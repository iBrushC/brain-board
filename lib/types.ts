export type ConceptLink = {
  label: string;
  url: string;
};

export type ConceptFile = {
  /** Name as stored on disk inside <data>/files/<conceptId>/ */
  name: string;
  /** Original name shown in the UI, before de-duplication. */
  label: string;
  size: number;
  addedAt: string;
};

export type Concept = {
  id: string;
  name: string;
  /** Full markdown body. */
  description: string;
  parentId: string | null;
  /** Sort position among siblings. */
  order: number;
  links: ConceptLink[];
  files: ConceptFile[];
  createdAt: string;
  updatedAt: string;
};

/** A concept plus its resolved children, used for rendering the tree. */
export type ConceptNode = Concept & {
  children: ConceptNode[];
};

/** Patch accepted by the update endpoint. Every field is optional. */
export type ConceptPatch = Partial<
  Pick<Concept, "name" | "description" | "parentId" | "order" | "links">
>;

export type VaultInfo = {
  path: string | null;
  conceptCount: number;
};
