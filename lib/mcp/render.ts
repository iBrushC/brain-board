import { buildReferenceGraph } from "@/lib/references";
import { buildTree } from "@/lib/tree";
import type { Board, BoardSummary, Concept, ConceptNode } from "@/lib/types";

/**
 * Boards as text an agent can read. Markdown rather than JSON: the content is
 * already markdown, ids are inlined where the agent will need them for the next
 * call, and the outline's indentation says the hierarchy without a parent-id
 * lookup per line.
 */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderBoardList(boards: BoardSummary[]): string {
  if (boards.length === 0) return "No boards are visible to this account.";

  return boards
    .map((b) => {
      const tags = b.tags.length
        ? `\n  tags: ${b.tags.map((t) => `${t.name} (id: ${t.id})`).join(", ")}`
        : "";
      return (
        `- **${b.name}** (id: ${b.id}) — ${b.conceptCount} concepts, ${b.fileCount} files, ` +
        `last edited ${b.updatedAt}${tags}`
      );
    })
    .join("\n");
}

/** Lookups every per-concept rendering needs, built once per board. */
type BoardIndex = {
  board: Board;
  byId: Map<string, Concept>;
  children: Map<string | null, Concept[]>;
  refsOut: Map<string, string[]>;
  refsIn: Map<string, string[]>;
};

function indexBoard(board: Board, concepts: Concept[]): BoardIndex {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const children = new Map<string | null, Concept[]>();
  for (const c of concepts) {
    const key = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  const refsOut = new Map<string, string[]>();
  const refsIn = new Map<string, string[]>();
  for (const { from, to } of buildReferenceGraph(concepts)) {
    refsOut.set(from, [...(refsOut.get(from) ?? []), to]);
    refsIn.set(to, [...(refsIn.get(to) ?? []), from]);
  }

  return { board, byId, children, refsOut, refsIn };
}

function nameOf(index: BoardIndex, id: string): string {
  return `${index.byId.get(id)?.name ?? "(missing)"} (id: ${id})`;
}

/** Root-to-concept names, for knowing where something sits without the outline. */
function pathOf(index: BoardIndex, concept: Concept): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let current: Concept | undefined = concept;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? index.byId.get(current.parentId) : undefined;
  }
  return names.join(" › ");
}

function renderDetail(index: BoardIndex, concept: Concept, heading: string): string {
  const tag = concept.tagId ? index.board.tags.find((t) => t.id === concept.tagId) : undefined;
  const meta = [
    `id: ${concept.id}`,
    `parent: ${concept.parentId ? nameOf(index, concept.parentId) : "(top level)"}`,
    tag ? `tag: ${tag.name} (id: ${tag.id})` : null,
    `updated: ${concept.updatedAt}`,
  ].filter(Boolean);

  const lines = [`${heading} ${concept.name}`, meta.join(" · ")];

  const out = index.refsOut.get(concept.id) ?? [];
  const into = index.refsIn.get(concept.id) ?? [];
  if (out.length) lines.push(`References → ${out.map((id) => nameOf(index, id)).join(", ")}`);
  if (into.length) lines.push(`Referenced by ← ${into.map((id) => nameOf(index, id)).join(", ")}`);

  if (concept.links.length) {
    lines.push("", "Links:", ...concept.links.map((l) => `- [${l.label}](${l.url})`));
  }
  if (concept.files.length) {
    lines.push(
      "",
      "Files:",
      ...concept.files.map(
        (f) => `- ${f.label} (${f.mimeType ?? "unknown type"}, ${formatSize(f.size)}, id: ${f.id})`,
      ),
    );
  }

  lines.push("", concept.description.trim() || "_(no description)_");
  return lines.join("\n");
}

export function renderBoard(
  board: Board,
  concepts: Concept[],
  { descriptions }: { descriptions: boolean },
): string {
  const index = indexBoard(board, concepts);

  const outline: string[] = [];
  const walk = (nodes: ConceptNode[], depth: number) => {
    for (const node of nodes) {
      const tag = node.tagId ? board.tags.find((t) => t.id === node.tagId) : undefined;
      outline.push(
        `${"  ".repeat(depth)}- ${node.name} (id: ${node.id})${tag ? ` [${tag.name}]` : ""}`,
      );
      walk(node.children, depth + 1);
    }
  };
  walk(buildTree(concepts), 0);

  const sections = [
    `# ${board.name}`,
    `board id: ${board.id} · ${concepts.length} concepts · last edited ${board.updatedAt}`,
    board.tags.length
      ? `Tags: ${board.tags.map((t) => `${t.name} (${t.color}, id: ${t.id})`).join(", ")}`
      : "Tags: none defined",
    "## Outline",
    outline.join("\n") || "_(empty board)_",
  ];

  if (descriptions && concepts.length) {
    sections.push("## Concepts");
    // Outline order, so the details read in the same sequence as the tree.
    const ordered: Concept[] = [];
    const collect = (nodes: ConceptNode[]) => {
      for (const node of nodes) {
        ordered.push(index.byId.get(node.id)!);
        collect(node.children);
      }
    };
    collect(buildTree(concepts));
    sections.push(...ordered.map((c) => renderDetail(index, c, "###")));
  }

  return sections.join("\n\n");
}

export function renderConcept(board: Board, concepts: Concept[], concept: Concept): string {
  const index = indexBoard(board, concepts);
  const kids = index.children.get(concept.id) ?? [];

  return [
    `Board: ${board.name} (id: ${board.id})`,
    `Path: ${pathOf(index, concept)}`,
    renderDetail(index, concept, "#"),
    kids.length
      ? `## Children\n${kids.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")}`
      : "## Children\n_(none)_",
  ].join("\n\n");
}
