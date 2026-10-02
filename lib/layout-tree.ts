import type { Reference } from "./references";
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

export type ReferenceEdge = {
  id: string;
  /** The nodes the arrow is actually drawn between, after collapsing. */
  from: string;
  to: string;
  d: string;
  /** One end stands in for a concept hidden under a collapsed branch. */
  dashed: boolean;
};

/** How far a reference arrow bows away from the straight line, at most. */
const REF_BOW = 56;

/**
 * Reference arrows over an existing layout. An end hidden under a collapsed
 * branch moves up to the nearest ancestor that's on screen, and arrows that end
 * up sharing both ends are merged — drawn solid if any of them was direct.
 */
export function layoutReferences(
  layout: Layout,
  references: Reference[],
  parentOf: Map<string, string | null>,
): ReferenceEdge[] {
  const placed = new Map(layout.nodes.map((p) => [p.node.id, p]));

  const visible = (id: string): string | null => {
    for (let at: string | null | undefined = id; at; at = parentOf.get(at)) {
      if (placed.has(at)) return at;
    }
    return null;
  };

  const merged = new Map<string, ReferenceEdge>();
  for (const ref of references) {
    const from = visible(ref.from);
    const to = visible(ref.to);
    // Both ends folded into the same node: there's nothing to point across.
    if (!from || !to || from === to) continue;

    const dashed = from !== ref.from || to !== ref.to;
    const id = `ref:${from}->${to}`;
    const existing = merged.get(id);
    if (existing) {
      existing.dashed &&= dashed;
      continue;
    }
    merged.set(id, {
      id,
      from,
      to,
      dashed,
      d: referenceCurve(placed.get(from)!, placed.get(to)!),
    });
  }

  return [...merged.values()];
}

/**
 * A gentle curve between the facing sides of two nodes. It always bows to the
 * left of its direction of travel, so A→B and B→A separate instead of
 * drawing on top of each other, and the bend keeps it from reading as part of
 * the square tree connectors.
 */
function referenceCurve(from: PlacedNode, to: PlacedNode): string {
  const [sx, sy] = facingSide(from, to);
  const [tx, ty] = facingSide(to, from);

  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.hypot(dx, dy) || 1;
  const bow = Math.min(REF_BOW, length * 0.2);
  const cx = (sx + tx) / 2 + (dy / length) * bow;
  const cy = (sy + ty) / 2 - (dx / length) * bow;

  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
}

/** Midpoint of the side of `node` that faces `other`. */
function facingSide(node: PlacedNode, other: PlacedNode): Point {
  const cx = node.x + NODE_W / 2;
  const cy = node.y + NODE_H / 2;
  const dx = other.x + NODE_W / 2 - cx;
  const dy = other.y + NODE_H / 2 - cy;

  // Compared in proportion to the box, since nodes are much wider than tall.
  if (Math.abs(dx) / NODE_W > Math.abs(dy) / NODE_H) {
    return [dx > 0 ? node.x + NODE_W : node.x, cy];
  }
  return [cx, dy > 0 ? node.y + NODE_H : node.y];
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
