import type { Concept } from "./types";

/**
 * Concept-to-concept references live inside descriptions as ordinary markdown
 * links whose target is `#concept:<id>`. Storing the id rather than the title
 * means a rename carries through and two concepts sharing a name never get
 * confused; the label in the brackets is only what the raw markdown reads as.
 *
 * Nothing else stores references, so the arrow layer is always derived from
 * the descriptions and can't drift out of step with them.
 */

const HREF_PREFIX = "#concept:";
const REFERENCE_PATTERN = /\]\(#concept:([\w-]+)\)/g;

export type Reference = { from: string; to: string };

export function referenceHref(id: string): string {
  return HREF_PREFIX + id;
}

/** The concept id a link points at, or `null` for any other kind of link. */
export function parseReferenceHref(href: string | undefined): string | null {
  if (!href?.startsWith(HREF_PREFIX)) return null;
  const id = href.slice(HREF_PREFIX.length);
  return /^[\w-]+$/.test(id) ? id : null;
}

/** The markdown autocomplete inserts. Brackets are dropped so the label can't end the link early. */
export function referenceMarkdown(concept: Pick<Concept, "id" | "name">): string {
  const label = concept.name.replace(/[[\]]/g, "").trim() || "concept";
  return `[@${label}](${referenceHref(concept.id)})`;
}

/** Ids a description refers to, de-duplicated, in order of first mention. */
export function extractReferences(description: string): string[] {
  const ids = new Set<string>();
  for (const match of description.matchAll(REFERENCE_PATTERN)) ids.add(match[1]);
  return [...ids];
}

/**
 * Every reference on the board, one per (from, to) pair. Self-references and
 * references to concepts that no longer exist (or live on another board) are
 * left out, since there's nothing to draw an arrow to.
 */
export function buildReferenceGraph(concepts: Concept[]): Reference[] {
  const ids = new Set(concepts.map((c) => c.id));
  return concepts.flatMap((concept) =>
    extractReferences(concept.description)
      .filter((to) => to !== concept.id && ids.has(to))
      .map((to) => ({ from: concept.id, to })),
  );
}
