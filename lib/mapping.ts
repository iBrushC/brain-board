import { isConceptColor } from "./colors";
import type { Tables } from "./database.types";
import type { Board, Concept, ConceptFile, ConceptLink } from "./types";

/**
 * Postgres rows in, domain objects out. Kept in one place because both the
 * server (initial page data) and the browser (live edits) read the same tables
 * and must agree on the shape they produce.
 */

/** `links` is jsonb, so it arrives as `Json` and has to be re-checked here. */
export function toLinks(value: unknown): ConceptLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (link): link is { label?: unknown; url: string } =>
        !!link && typeof link === "object" && typeof (link as { url?: unknown }).url === "string",
    )
    .map((link) => ({
      label: typeof link.label === "string" && link.label ? link.label : link.url,
      url: link.url,
    }));
}

export function toFile(row: Tables<"concept_files">): ConceptFile {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    size: Number(row.size),
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    addedAt: row.added_at,
  };
}

export function toConcept(row: Tables<"concepts">, files: ConceptFile[]): Concept {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    order: row.sort_order,
    // A colour the palette no longer has falls back to the untinted default.
    color: isConceptColor(row.color) ? row.color : null,
    links: toLinks(row.links),
    files,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Joins concepts to their files, oldest attachment first within each concept. */
export function toConcepts(
  conceptRows: Tables<"concepts">[],
  fileRows: Tables<"concept_files">[],
): Concept[] {
  const byConcept = new Map<string, ConceptFile[]>();
  for (const row of fileRows) {
    const list = byConcept.get(row.concept_id) ?? [];
    list.push(toFile(row));
    byConcept.set(row.concept_id, list);
  }
  for (const list of byConcept.values()) {
    list.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  }

  return conceptRows.map((row) => toConcept(row, byConcept.get(row.id) ?? []));
}

export function toBoard(row: Tables<"boards">): Board {
  return {
    id: row.id,
    orgId: row.org_id,
    ownerId: row.owner_id,
    name: row.name,
    color: isConceptColor(row.color) ? row.color : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Object key in the `board-files` bucket. RLS keys off the first segment. */
export function storagePathFor(boardId: string, conceptId: string, name: string): string {
  return `${boardId}/${conceptId}/${name}`;
}

/**
 * Attachment names are user-supplied, so strip anything that could confuse the
 * object store while keeping the name recognizable.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\/]/).pop() ?? name;
  const cleaned = base
    .replace(/[\u0000-\u001f<>:"\/|?*#]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "file";
}

/** Appends `-2`, `-3`, … until the name is free within the concept. */
export function uniqueFileName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}
