import type { Concept, ConceptNode } from "./types";

/**
 * Folds the flat concept list into a forest, sorted by `order` then name.
 * Pure and dependency-free so both the server and the board can use it.
 */
export function buildTree(concepts: Concept[]): ConceptNode[] {
  const nodes = new Map<string, ConceptNode>(
    concepts.map((c) => [c.id, { ...c, children: [] }]),
  );

  const roots: ConceptNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    // A concept whose parent was deleted out from under it still shows up, as a
    // root, instead of vanishing from the board.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: ConceptNode[]) => {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    for (const child of list) sort(child.children);
  };
  sort(roots);

  return roots;
}
