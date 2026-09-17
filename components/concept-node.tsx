"use client";

import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Link2,
  Paperclip,
  FileText,
  Pencil,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { swatch } from "@/lib/colors";
import type { PlacedNode } from "@/lib/layout-tree";
import { NODE_H, NODE_W } from "@/lib/layout-tree";

type Props = {
  placed: PlacedNode;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onAddChild: (id: string) => void;
};

export function ConceptNode({
  placed,
  selected,
  onSelect,
  onEdit,
  onToggleCollapse,
  onAddChild,
}: Props) {
  const { node, x, y, hiddenChildren } = placed;
  const collapsed = hiddenChildren > 0;
  const childCount = node.children.length;
  const tint = swatch(node.color);

  return (
    // The wrapper stays transparent to the pointer so a drag that starts in the
    // gap around a node still pans the board; only the controls take the event.
    <div
      className="group pointer-events-none absolute"
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
    >
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        onDoubleClick={() => onEdit(node.id)}
        style={
          tint
            ? { backgroundColor: tint.fill, borderColor: tint.border, color: tint.ink }
            : undefined
        }
        className={`pointer-events-auto flex h-full w-full flex-col justify-between rounded-sm border px-3 py-2.5 text-left transition-colors ${
          tint ? "" : "border-border-subtle bg-surface-raised hover:border-border-strong"
        } ${selected ? "is-selected" : ""}`}
      >
        <span className="line-clamp-2 text-base font-medium leading-snug">{node.name}</span>

        <span className="flex items-center gap-2.5 pr-6 opacity-60">
          {childCount > 0 && <Meta icon={GitBranch} count={childCount} />}
          {node.links.length > 0 && <Meta icon={Link2} count={node.links.length} />}
          {node.description.trim() && <Meta icon={FileText} />}
          {node.files.length > 0 && <Meta icon={Paperclip} count={node.files.length} />}
          {childCount + node.links.length + node.files.length === 0 && !node.description.trim() && (
            <span className="text-xs">&mdash;</span>
          )}
        </span>
      </button>

      {/* The only way into the editor, so the panel never opens on its own. */}
      <button
        type="button"
        title="Edit concept"
        aria-label={`Edit ${node.name}`}
        onClick={() => onEdit(node.id)}
        className={`pointer-events-auto absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-sm border border-border-subtle bg-surface-raised text-ink-muted transition-opacity hover:border-accent hover:text-accent ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Pencil size={12} strokeWidth={2} aria-hidden />
      </button>

      {/* Add a child. Hidden until hover or selection to keep the board quiet. */}
      <button
        type="button"
        title="Add subconcept"
        aria-label={`Add a subconcept to ${node.name}`}
        onClick={() => onAddChild(node.id)}
        className={`pointer-events-auto absolute -right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm border border-border-subtle bg-surface-raised text-ink-muted transition-opacity hover:border-accent hover:text-accent ${
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <Plus size={12} strokeWidth={2} aria-hidden />
      </button>

      {/* Sits on the connector spine, so it reads as the switch for the branch
          hanging below it. */}
      {childCount > 0 && (
        <button
          type="button"
          aria-expanded={!collapsed}
          title={
            collapsed
              ? `Show ${hiddenChildren} hidden subconcept${hiddenChildren === 1 ? "" : "s"}`
              : `Hide ${childCount} subconcept${childCount === 1 ? "" : "s"}`
          }
          onClick={() => onToggleCollapse(node.id)}
          className="pointer-events-auto absolute -bottom-2.5 left-4 flex h-5 -translate-x-1/2 items-center justify-center gap-0.5 rounded-sm border border-border-subtle bg-surface-raised pl-0.5 pr-1 text-[11px] leading-none text-ink-muted hover:border-accent hover:text-accent"
        >
          {collapsed ? (
            <ChevronRight size={12} strokeWidth={2} aria-hidden />
          ) : (
            <ChevronDown size={12} strokeWidth={2} aria-hidden />
          )}
          <span className="font-mono">{collapsed ? hiddenChildren : childCount}</span>
        </button>
      )}
    </div>
  );
}

function Meta({ icon: Icon, count }: { icon: LucideIcon; count?: number }) {
  return (
    <span className="flex items-center gap-1 text-xs leading-none">
      <Icon size={13} strokeWidth={1.75} aria-hidden />
      {count}
    </span>
  );
}
