"use client";

import { createClient } from "@/lib/supabase/client";
import type { ConceptColor } from "./colors";
import {
  sanitizeFileName,
  storagePathFor,
  toBoard,
  toConcept,
  toFile,
  uniqueFileName,
} from "./mapping";
import type { Board, Concept, ConceptFile, ConceptPatch } from "./types";

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
    patch: { name?: string; color?: ConceptColor | null },
  ): Promise<Board> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("boards")
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() || "Untitled board" } : {}),
        // Compared against undefined so `null` can clear the tint.
        ...(patch.color !== undefined ? { color: patch.color } : {}),
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

    // Land after the current last sibling. A race here costs a tie in `order`,
    // which the tree sort breaks by name rather than surfacing as an error.
    const siblings = supabase
      .from("concepts")
      .select("sort_order")
      .eq("board_id", boardId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const { data: last } = parentId
      ? await siblings.eq("parent_id", parentId)
      : await siblings.is("parent_id", null);

    const { data, error } = await supabase
      .from("concepts")
      .insert({
        board_id: boardId,
        parent_id: parentId,
        name: name.trim() || "New concept",
        sort_order: (last?.[0]?.sort_order ?? -1) + 1,
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
      .update({
        ...(patch.name !== undefined ? { name: patch.name.trim() || concept.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.parentId !== undefined ? { parent_id: patch.parentId } : {}),
        ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.links !== undefined
          ? {
              links: patch.links
                .filter((l) => l.url.trim())
                .map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() })),
            }
          : {}),
      })
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
