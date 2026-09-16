import type { ConceptNode } from "./types";

export const NODE_W = 208;
export const NODE_H = 72;

const H_GAP = 28; // between siblings
const V_GAP = 68; // between depth levels
const ROOT_GAP = 72; // extra breathing room between separate roots

export type PlacedNode = {
  node: ConceptNode;
  x: number;
  y: number;
  depth: number;
  /** Children exist but are hidden, so the node can show a count badge. */
  hiddenChildren: number;
};

export type Edge = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type Layout = {
  nodes: PlacedNode[];
  edges: Edge[];
  width: number;
  height: number;
};

/**
 * Classic top-down tidy layout: leaves are packed left to right in order, and
 * each parent is centered over the span of its children. Runs over a forest,
 * so several unrelated top-level concepts sit side by side.
 */
export function layoutForest(roots: ConceptNode[], collapsed: Set<string>): Layout {
  const nodes: PlacedNode[] = [];
  const edges: Edge[] = [];
  let cursor = 0;

  const place = (node: ConceptNode, depth: number): number => {
    const y = depth * (NODE_H + V_GAP);
    const isCollapsed = collapsed.has(node.id);
    const children = isCollapsed ? [] : node.children;

    let x: number;
    if (children.length === 0) {
      x = cursor;
      cursor += NODE_W + H_GAP;
    } else {
      const childXs = children.map((child) => place(child, depth + 1));
      x = (childXs[0] + childXs[childXs.length - 1]) / 2;

      for (let i = 0; i < children.length; i++) {
        edges.push({
          id: `${node.id}->${children[i].id}`,
          from: { x: x + NODE_W / 2, y: y + NODE_H },
          to: { x: childXs[i] + NODE_W / 2, y: y + NODE_H + V_GAP },
        });
      }
    }

    nodes.push({
      node,
      x,
      y,
      depth,
      hiddenChildren: isCollapsed ? node.children.length : 0,
    });
    return x;
  };

  for (const root of roots) {
    place(root, 0);
    cursor += ROOT_GAP;
  }

  const maxX = nodes.reduce((max, n) => Math.max(max, n.x + NODE_W), 0);
  const maxY = nodes.reduce((max, n) => Math.max(max, n.y + NODE_H), 0);

  return { nodes, edges, width: maxX, height: maxY };
}
