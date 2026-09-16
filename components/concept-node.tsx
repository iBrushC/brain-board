"use client";

import type { PlacedNode } from "@/lib/layout-tree";
import { NODE_H, NODE_W } from "@/lib/layout-tree";

type Props = {
  placed: PlacedNode;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onAddChild: (id: string) => void;
};

export function ConceptNode({
  placed,
  selected,
  onSelect,
  onToggleCollapse,
  onAddChild,
}: Props) {
  const { node, x, y, hiddenChildren } = placed;
  const collapsed = hiddenChildren > 0;
  const childCount = node.children.length;

  const meta = [
    childCount > 0 && `${childCount} sub`,
    node.links.length > 0 && `${node.links.length} link${node.links.length === 1 ? "" : "s"}`,
    node.files.length > 0 && `${node.files.length} file${node.files.length === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  return (
    <div
      className="group absolute"
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={`flex h-full w-full flex-col justify-between rounded-sm border px-2.5 py-2 text-left transition-colors ${
          selected
            ? "border-accent bg-accent-soft"
            : "border-border-subtle bg-surface-raised hover:border-border-strong"
        }`}
      >
        <span className="line-clamp-2 text-xs font-medium leading-snug text-ink">
          {node.name}
        </span>
        <span className="truncate text-[10px] text-ink-faint">
          {meta.length > 0 ? meta.join(" · ") : "—"}
        </span>
      </button>

      {/* Add a child. Hidden until hover or selection to keep the board quiet. */}
      <button
        type="button"
        title="Add subconcept"
        onClick={() => onAddChild(node.id)}
        className={`absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-sm border border-border-subtle bg-surface-raised text-xs leading-none text-ink-muted transition-opacity hover:border-accent hover:text-accent ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        +
      </button>

      {childCount > 0 && (
        <button
          type="button"
          title={collapsed ? `Expand ${hiddenChildren}` : "Collapse"}
          onClick={() => onToggleCollapse(node.id)}
          className="absolute -bottom-2.5 left-1/2 h-5 min-w-5 -translate-x-1/2 rounded-sm border border-border-subtle bg-surface-raised px-1 text-[10px] leading-none text-ink-muted hover:border-accent hover:text-accent"
        >
          {collapsed ? hiddenChildren : "–"}
        </button>
      )}
    </div>
  );
}
