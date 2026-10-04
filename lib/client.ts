"use client";

import { createClient } from "@/lib/supabase/client";
import { load as loadYaml } from "js-yaml";
import type { ConceptColor } from "./colors";
import { conceptUpdateRow, nextSortOrder } from "./concept-writes";
import {
  sanitizeFileName,
  storagePathFor,
  toBoard,
  toConcept,
  toFile,
  uniqueFileName,
} from "./mapping";
import type { Board, Concept, ConceptFile, ConceptPatch, Tag } from "./types";

/**
 * Board and concept writes, straight from the browser to Postgres.
 *
 * There is no API layer in between on purpose: every table and every storage
 * object is gated by row-level security keyed on the signed-in user, so a
 * hand-rolled request can't reach anything this client couldn't. That also
 * means an admin's writes fail at the database — the read-only UI they get is
 * a courtesy, not the control.
 */

const BUCKET = "board-files";
/** Long enough to read a paper without re-fetching, short enough to not be a link. */
const SIGNED_URL_TTL = 60 * 60;

function fail(message: string, error: { message: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

export const api = {
  /* ------------------------------------------------------------------ boards */

  async createBoard(name: string, orgId: string, ownerId: string): Promise<Board> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("boards")
      .insert({ name: name.trim() || "Untitled board", org_id: orgId, owner_id: ownerId })
      .select()
      .single();

    if (error || !data) fail("Could not create the board", error);
    return toBoard(data);
  },

  async updateBoard(
    id: string,
    patch: { name?: string; color?: ConceptColor | null; tags?: Tag[] },
  ): Promise<Board> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("boards")
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() || "Untitled board" } : {}),
        // Compared against undefined so `null` can clear the tint.
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.tags !== undefined
          ? {
              tags: patch.tags.map((tag) => ({
                id: tag.id,
                name: tag.name.trim(),
                color: tag.color,
              })),
            }
          : {}),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) fail("Could not update the board", error);
    return toBoard(data);
  },

  /**
   * Deletes a board, its concepts, and its files. The rows cascade; the stored
   * objects don't, so they're swept first while their paths are still known.
   */
  async deleteBoard(id: string): Promise<void> {
    const supabase = createClient();

    const { data: files } = await supabase
      .from("concept_files")
      .select("storage_path")
      .eq("board_id", id);

    const paths = (files ?? []).map((f) => f.storage_path);
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) fail("Could not delete the board", error);
  },

  /* ---------------------------------------------------------------- concepts */

  async createConcept(
    boardId: string,
    name: string,
    parentId: string | null,
  ): Promise<Concept> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("concepts")
      .insert({
        board_id: boardId,
        parent_id: parentId,
        name: name.trim() || "New concept",
        sort_order: await nextSortOrder(supabase, boardId, parentId),
      })
      .select()
      .single();

    if (error || !data) fail("Could not add the concept", error);
    return toConcept(data, []);
  },

  /**
   * Takes the whole concept rather than an id so the files it already carries
   * survive the round trip — the concepts table doesn't know about them.
   */
  async updateConcept(concept: Concept, patch: ConceptPatch): Promise<Concept> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("concepts")
      .update(conceptUpdateRow(concept, patch))
      .eq("id", concept.id)
      .select()
      .single();

    if (error || !data) fail("Could not save the concept", error);
    return toConcept(data, concept.files);
  },

  /**
   * Removes a concept and everything beneath it. Child rows cascade in the
   * database, so only the root row is deleted here — but the stored files of
   * the whole subtree have to go explicitly, hence `descendants`.
   */
  async deleteConcept(concept: Concept, descendants: Concept[]): Promise<void> {
    const supabase = createClient();

    const paths = [concept, ...descendants].flatMap((c) =>
      c.files.map((file) => file.storagePath),
    );
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

    const { error } = await supabase.from("concepts").delete().eq("id", concept.id);
    if (error) fail("Could not delete the concept", error);
  },

  /* ------------------------------------------------------------------- import */

  /**
   * Lifts a local vault folder (the pre-cloud format: `concepts/*.md` with YAML
   * frontmatter plus `files/<conceptId>/…` attachments) into a new board, all
   * from the browser. Mirrors scripts/import-vault.mjs so both paths stay
   * interchangeable.
   */
  async importBoard(
    orgId: string,
    ownerId: string,
    selected: File[],
  ): Promise<{ board: Board; conceptCount: number; fileCount: number; skipped: number }> {
    const supabase = createClient();

    // Relative paths look like `<vault>/concepts/x.md` and
    // `<vault>/files/<conceptId>/<name>`. The first segment names the vault.
    const entries = selected
      .map((file) => ({
        file,
        segments: (file.webkitRelativePath || file.name).split("/"),
      }))
      .filter((e) => e.segments.length >= 2);

    const vaultName = entries[0]?.segments[0] ?? "Imported board";

    type Parsed = {
      id: string;
      name: string;
      description: string;
      parentId: string | null;
      order: number;
      color: ConceptColor | null;
      links: { label: string; url: string }[];
      attachments: { name: string; label: string; size: number; file: File }[];
    };

    const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const COLORS: ReadonlySet<string> = new Set([
      "rose", "red", "orange", "amber", "yellow", "lime", "green", "emerald",
      "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "pink",
    ]);
    const MIME: Record<string, string> = {
      ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
      ".svg": "image/svg+xml", ".md": "text/markdown", ".txt": "text/plain",
      ".csv": "text/csv", ".json": "application/json",
    };

    const parsed: Parsed[] = [];
    const loose: { conceptId: string; file: File }[] = [];
    let skipped = 0;

    for (const entry of entries) {
      const [, folder, ...rest] = entry.segments;
      if (folder === "concepts" && rest.length === 1 && rest[0].endsWith(".md")) {
        const raw = await entry.file.text();
        const match = FRONTMATTER.exec(raw);
        if (!match) {
          skipped += 1;
          continue;
        }
        let meta: Record<string, unknown>;
        try {
          meta = (loadYaml(match[1]) as Record<string, unknown>) ?? {};
        } catch {
          skipped += 1;
          continue;
        }
        const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
        const id = str(meta.id) || rest[0].replace(/\.md$/, "");
        const color = str(meta.color);
        parsed.push({
          id,
          name: str(meta.name, "Untitled").trim() || "Untitled",
          description: (match[2] ?? "").trimStart(),
          parentId: typeof meta.parentId === "string" ? meta.parentId : null,
          order: typeof meta.order === "number" ? meta.order : 0,
          color: COLORS.has(color) ? (color as ConceptColor) : null,
          links: Array.isArray(meta.links)
            ? (meta.links as { label?: unknown; url?: unknown }[])
                .filter((l) => !!l && typeof l.url === "string")
                .map((l) => ({ label: str(l.label, l.url as string), url: l.url as string }))
            : [],
          attachments: [],
        });
      } else if (folder === "files" && rest.length === 2) {
        loose.push({ conceptId: rest[0], file: entry.file });
      }
      // Anything else (dotfiles, stray notes at the root) is ignored.
    }

    if (parsed.length === 0) fail("No readable concepts in that folder", null);

    const board = await api.createBoard(vaultName, orgId, ownerId);

    // The vault's ids aren't UUIDs, so every concept gets a new one and parent
    // links are remapped through this table.
    const newId = new Map(parsed.map((c) => [c.id, crypto.randomUUID()]));

    const { error: insertError } = await supabase
      .from("concepts")
      .insert(
        parsed.map((c) => ({
          id: newId.get(c.id),
          board_id: board.id,
          parent_id: null,
          name: c.name,
          description: c.description,
          sort_order: c.order,
          color: c.color,
          links: c.links,
        })),
      );
    if (insertError) fail("Could not insert the concepts", insertError);

    let orphaned = 0;
    for (const concept of parsed) {
      if (!concept.parentId) continue;
      const parent = newId.get(concept.parentId);
      if (!parent) {
        orphaned += 1;
        continue;
      }
      const { error } = await supabase
        .from("concepts")
        .update({ parent_id: parent })
        .eq("id", newId.get(concept.id) ?? concept.id);
      if (error) fail(`Could not link ${concept.name} to its parent`, error);
    }

    // Attachments join by the vault's own concept id.
    const byVaultId = new Map(parsed.map((c) => [c.id, c]));
    let uploaded = 0;
    for (const { conceptId, file } of loose) {
      const concept = byVaultId.get(conceptId);
      if (!concept) {
        skipped += 1;
        continue;
      }
      const newConceptId = newId.get(conceptId) ?? crypto.randomUUID();
      const taken = new Set(concept.attachments.map((f) => f.name));
      const name = uniqueFileName(sanitizeFileName(file.name), taken);
      const storagePath = storagePathFor(board.id, newConceptId, name);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || MIME[file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ""] || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) fail(`Could not upload ${file.name}`, uploadError);

      const { error: rowError } = await supabase.from("concept_files").insert({
        concept_id: newConceptId,
        board_id: board.id,
        name,
        label: file.name,
        size: file.size,
        mime_type: file.type || null,
        storage_path: storagePath,
      });
      if (rowError) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        fail(`Could not attach ${file.name}`, rowError);
      }

      concept.attachments.push({ name, label: file.name, size: file.size, file });
      uploaded += 1;
    }

    return { board, conceptCount: parsed.length, fileCount: uploaded, skipped: skipped + orphaned };
  },

  /* ------------------------------------------------------------------- files */

  /** Uploads each file to the board's folder and records it against the concept. */
  async uploadFiles(concept: Concept, uploads: File[]): Promise<Concept> {
    const supabase = createClient();
    const taken = new Set(concept.files.map((f) => f.name));
    const added: ConceptFile[] = [];

    for (const upload of uploads) {
      const name = uniqueFileName(sanitizeFileName(upload.name), taken);
      taken.add(name);
      const storagePath = storagePathFor(concept.boardId, concept.id, name);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, upload, {
          contentType: upload.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) fail(`Could not upload ${upload.name}`, uploadError);

      const { data, error } = await supabase
        .from("concept_files")
        .insert({
          concept_id: concept.id,
          board_id: concept.boardId,
          name,
          label: upload.name,
          size: upload.size,
          mime_type: upload.type || null,
          storage_path: storagePath,
        })
        .select()
        .single();

      if (error || !data) {
        // Don't leave the object behind with nothing pointing at it.
        await supabase.storage.from(BUCKET).remove([storagePath]);
        fail(`Could not attach ${upload.name}`, error);
      }

      added.push(toFile(data));
    }

    return { ...concept, files: [...concept.files, ...added] };
  },

  async removeFile(concept: Concept, file: ConceptFile): Promise<Concept> {
    const supabase = createClient();

    await supabase.storage.from(BUCKET).remove([file.storagePath]);
    const { error } = await supabase.from("concept_files").delete().eq("id", file.id);
    if (error) fail("Could not remove the file", error);

    return { ...concept, files: concept.files.filter((f) => f.id !== file.id) };
  },

  /** The bucket is private, so viewing anything means minting a short-lived URL. */
  async signedFileUrl(file: ConceptFile): Promise<string> {
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storagePath, SIGNED_URL_TTL);

    if (error || !data) fail("Could not open the file", error);
    return data.signedUrl;
  },
};
