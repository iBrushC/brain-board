import type { ConceptNode } from "./types";

export const NODE_W = 260;
export const NODE_H = 96;

/** Children sit this far to the right of their parent, leaving room for the spine. */
const INDENT = 36;
/** Where the connector spine runs, measured from a node's left edge. */
const GUTTER = 16;
/** Horizontal run from the spine into a child's left edge. */
const STUB = INDENT - GUTTER;
const ROW_GAP = 26; // between stacked rows
const COL_GAP = 30; // between parallel columns of siblings
const ROOT_GAP = 56; // between separate roots
const CORNER = 8; // connector corner radius

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
  /** Ready-to-render SVG path; the routing depends on layout internals. */
  d: string;
};

export type Layout = {
  nodes: PlacedNode[];
  edges: Edge[];
  width: number;
  height: number;
};

type Box = { right: number; bottom: number };
type Point = [number, number];

type Context = {
  nodes: PlacedNode[];
  edges: Edge[];
  collapsed: Set<string>;
};

/**
 * Outline layout: siblings stack vertically, indented under their parent, so a
 * plain branch reads top to bottom as a single column (A, then B, then C).
 *
 * A sibling that has visible children of its own claims the rest of its column
 * for them, so the sibling after it starts a fresh column alongside. Given A
 * with children B and C, where B has a child D, that produces the BD stack with
 * C beside it:
 *
 *     A
 *     B   C
 *     D
 */
export function layoutForest(roots: ConceptNode[], collapsed: Set<string>): Layout {
  const ctx: Context = { nodes: [], edges: [], collapsed };

  // Top-level concepts pack by the same rule, just with more air between them.
  placeRow(roots, 0, 0, 0, null, ROOT_GAP, ROOT_GAP, ctx);

  const width = ctx.nodes.reduce((max, n) => Math.max(max, n.x + NODE_W), 0);
  const height = ctx.nodes.reduce((max, n) => Math.max(max, n.y + NODE_H), 0);

  return { nodes: ctx.nodes, edges: ctx.edges, width, height };
}

/** Packs one set of siblings into columns, top-left anchored at (x, y). */
function placeRow(
  siblings: ConceptNode[],
  x: number,
  y: number,
  depth: number,
  parent: PlacedNode | null,
  rowGap: number,
  colGap: number,
  ctx: Context,
): Box {
  let columnX = x;
  let columnRight = x;
  let cursorY = y;
  const box: Box = { right: x, bottom: y };

  for (const sibling of siblings) {
    const placed = placeNode(sibling, columnX, cursorY, depth, ctx);
    if (parent) {
      ctx.edges.push({
        id: `${parent.node.id}->${sibling.id}`,
        d: connector(parent.x, parent.y, columnX, cursorY, rowGap),
      });
    }

    const subtree = placed.subtree;
    box.right = Math.max(box.right, subtree.right);
    box.bottom = Math.max(box.bottom, subtree.bottom);
    columnRight = Math.max(columnRight, subtree.right);

    if (placed.opensBranch) {
      // Its descendants own the rest of this column, so the next sibling gets
      // a column of its own rather than being pushed below them.
      columnX = columnRight + colGap;
      columnRight = columnX;
      cursorY = y;
    } else {
      cursorY = subtree.bottom + rowGap;
    }
  }

  return box;
}

function placeNode(
  node: ConceptNode,
  x: number,
  y: number,
  depth: number,
  ctx: Context,
): { subtree: Box; opensBranch: boolean } {
  const isCollapsed = ctx.collapsed.has(node.id);
  const children = isCollapsed ? [] : node.children;

  const placed: PlacedNode = {
    node,
    x,
    y,
    depth,
    hiddenChildren: isCollapsed ? node.children.length : 0,
  };
  ctx.nodes.push(placed);

  const subtree: Box = { right: x + NODE_W, bottom: y + NODE_H };
  if (children.length === 0) return { subtree, opensBranch: false };

  const below = placeRow(
    children,
    x + INDENT,
    y + NODE_H + ROW_GAP,
    depth + 1,
    placed,
    ROW_GAP,
    COL_GAP,
    ctx,
  );

  return {
    subtree: {
      right: Math.max(subtree.right, below.right),
      bottom: Math.max(subtree.bottom, below.bottom),
    },
    opensBranch: true,
  };
}

/**
 * Bracket connector: down the parent's gutter, then a short stub into the
 * child's left edge. A child that starts a new column is reached by crossing
 * the empty band between the two rows first, so the run never cuts through a
 * node that was placed in between.
 */
function connector(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rowGap: number,
): string {
  const spineX = px + GUTTER;
  const childSpineX = cx - STUB;
  const startY = py + NODE_H;
  const endY = cy + NODE_H / 2;

  const points: Point[] = [[spineX, startY]];
  if (childSpineX !== spineX) {
    const bandY = startY + rowGap / 2;
    points.push([spineX, bandY], [childSpineX, bandY]);
  }
  points.push([childSpineX, endY], [cx, endY]);

  return roundedPath(points);
}

/** Polyline with the corners eased off, so branches don't look like circuitry. */
function roundedPath(points: Point[], radius = CORNER): string {
  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];

    const inLength = Math.hypot(cx - px, cy - py);
    const outLength = Math.hypot(nx - cx, ny - cy);
    if (inLength === 0 || outLength === 0) continue;

    const cut = Math.min(radius, inLength / 2, outLength / 2);
    const ax = cx + ((px - cx) / inLength) * cut;
    const ay = cy + ((py - cy) / inLength) * cut;
    const bx = cx + ((nx - cx) / outLength) * cut;
    const by = cy + ((ny - cy) / outLength) * cut;

    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }

  const [lastX, lastY] = points[points.length - 1];
  return `${d} L ${lastX} ${lastY}`;
}
