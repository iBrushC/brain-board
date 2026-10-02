import type { ConceptColor } from "./colors";
import type { Concept, ConceptFile, Tag } from "./types";

/**
 * The data contract of an HTML export, shared by the code that writes the file
 * (in the app) and the viewer that reads it (inside the file). Versioned so a
 * later importer can turn an export back into a board.
 */

export const EXPORT_FORMAT = "brain-board-export";
export const EXPORT_VERSION = 1;

/** `<script>` ids inside the exported page. */
export const DATA_ELEMENT_ID = "bb-data";
export const FILE_ELEMENT_PREFIX = "bb-file-";

/** Attachment metadata. The bytes, when included, live in their own element. */
export type ExportedFile = Omit<ConceptFile, "storagePath"> & {
  /** False when the file was too large to embed or couldn't be fetched. */
  included: boolean;
};

export type ExportedConcept = Omit<Concept, "boardId" | "files"> & {
  files: ExportedFile[];
};

export type ExportPayload = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  board: {
    name: string;
    color: ConceptColor | null;
    tags: Tag[];
  };
  concepts: ExportedConcept[];
  /** Branches folded on the owner's screen when they exported. */
  collapsed: string[];
};

export function isExportPayload(value: unknown): value is ExportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ExportPayload>;
  return (
    payload.format === EXPORT_FORMAT &&
    payload.version === EXPORT_VERSION &&
    !!payload.board &&
    Array.isArray(payload.concepts)
  );
}
