import type { ConceptColor } from "./colors";

export type ConceptLink = {
  label: string;
  url: string;
};

/** A named meaning for one of the palette colours, scoped to a board. */
export type Tag = {
  id: string;
  name: string;
  color: ConceptColor;
};

export type ConceptFile = {
  id: string;
  /** De-duplicated name, unique within the concept. */
  name: string;
  /** Original name shown in the UI, before de-duplication. */
  label: string;
  size: number;
  mimeType: string | null;
  /** Object key in the `board-files` bucket: `<boardId>/<conceptId>/<name>`. */
  storagePath: string;
  addedAt: string;
};

export type Concept = {
  id: string;
  boardId: string;
  name: string;
  /** Full markdown body. */
  description: string;
  parentId: string | null;
  /** Sort position among siblings. */
  order: number;
  /** Pastel tint from the shared palette, or `null` for the default surface. */
  color: ConceptColor | null;
  /** Board tag whose colour the concept takes, or `null` for no tag. */
  tagId: string | null;
  links: ConceptLink[];
  files: ConceptFile[];
  createdAt: string;
  updatedAt: string;
};

/** A concept plus its resolved children, used for rendering the tree. */
export type ConceptNode = Concept & {
  children: ConceptNode[];
};

/** Patch accepted by the update path. Every field is optional. */
export type ConceptPatch = Partial<
  Pick<Concept, "name" | "description" | "parentId" | "order" | "links" | "color" | "tagId">
>;

export type Board = {
  id: string;
  orgId: string;
  ownerId: string;
  name: string;
  color: ConceptColor | null;
  /** Tag vocabulary for this board: what each colour means here. */
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
};

/** A board as it appears in the projects list, without loading its concepts. */
export type BoardSummary = Board & {
  conceptCount: number;
  fileCount: number;
};
