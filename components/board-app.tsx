"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Eye, Maximize2, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { buildTree } from "@/lib/tree";
import type { Board, Concept, ConceptPatch } from "@/lib/types";
import { BoardCanvas, type BoardHandle } from "./board-canvas";
import { FileViewer } from "./file-viewer";
import { InspectorPanel } from "./inspector-panel";
import { SidePanel } from "./side-panel";
import { Button } from "./ui";

const PANEL_W = 360;
const INSPECTOR_W = 340;
const PANEL_MS = 300;

/**
 * Animates a panel's width in JS rather than CSS. Each animation frame yields
 * the width delta, so the caller can move the board transform in the same
 * frame and the slide reads as one motion instead of two lagging ones.
 */
function useAnimatedPanel(
  open: boolean,
  target: number,
  onDelta?: (dx: number) => void,
): number {
  const [width, setWidth] = useState(open ? target : 0);
  const widthRef = useRef(width);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const from = widthRef.current;
    const to = open ? target : 0;
    const delta = to - from;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (delta === 0 || reduced) {
      if (onDelta) onDelta(delta);
      widthRef.current = to;
      setWidth(to);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / PANEL_MS);
      // Matches the previous cubic-bezier(0.16, 1, 0.3, 1) ease-out curve.
      const eased = 1 - Math.pow(1 - t, 3);
      const w = from + delta * eased;
      if (onDelta) onDelta(w - widthRef.current);
      widthRef.current = w;
      setWidth(w);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // onDelta is stable; width changes are driven by this effect alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target]);

  return width;
}

type Props = {
  board: Board;
  /** The whole board, loaded on the server. Edits are applied in place from here on. */
  initialConcepts: Concept[];
  /** True when the viewer can read this board but not write to it — i.e. an admin. */
  readOnly: boolean;
};

export function BoardApp({ board, initialConcepts, readOnly }: Props) {
  const router = useRouter();
  const [name, setName] = useState(board.name);
  const [concepts, setConcepts] = useState<Concept[]>(initialConcepts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kept apart from selection: the panel is an explicit mode you enter from a
  // node's edit button, so clicking around the board can't drop you out of it
  // mid-sentence.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Read-only inspector on the right: opens whenever a node is selected, but
  // stays out of the way until then so clicking around the board is quiet.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState<{ conceptId: string; name: string } | null>(
    null,
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const boardRef = useRef<BoardHandle>(null);

  const roots = useMemo(() => buildTree(concepts), [concepts]);

  // The panel animates shut rather than disappearing, so it keeps rendering the
  // concept it was last opened for until something else opens it.
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);
  if (editingId !== null && editingId !== lastOpenedId) {
    setLastOpenedId(editingId);
  }

  const panelConcept = useMemo(
    () => concepts.find((c) => c.id === (editingId ?? lastOpenedId)) ?? null,
    [concepts, editingId, lastOpenedId],
  );
  const panelOpen = !readOnly && editingId !== null && panelConcept !== null;

  // Mirror of the edit panel's "keep rendering while it slides shut" trick.
  const [lastInspectedId, setLastInspectedId] = useState<string | null>(null);
  const inspectId = inspectorOpen ? selectedId : lastInspectedId;
  if (inspectorOpen && selectedId !== null && selectedId !== lastInspectedId) {
    setLastInspectedId(selectedId);
  }
  const inspectConcept = useMemo(
    () => concepts.find((c) => c.id === inspectId) ?? null,
    [concepts, inspectId],
  );
  const inspectorShown = inspectorOpen && selectedId !== null && inspectConcept !== null;

  // Only the left panel moves the board viewport's left edge, so only it
  // compensates the transform; the right inspector just moves the right edge.
  const shiftBoard = useCallback((dx: number) => {
    boardRef.current?.shift(dx);
  }, []);
  const panelWidth = useAnimatedPanel(panelOpen, PANEL_W, shiftBoard);
  const inspectorWidth = useAnimatedPanel(inspectorShown, INSPECTOR_W);

  /** Replaces one concept in place, so the board doesn't refetch on every keystroke. */
  const mergeConcept = useCallback((updated: Concept) => {
    setConcepts((list) => list.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  const patch = useCallback(
    async (id: string, patch: ConceptPatch) => {
      const current = concepts.find((c) => c.id === id);
      if (!current) return;
      mergeConcept(await api.updateConcept(current, patch));
    },
    [concepts, mergeConcept],
  );

  const addConcept = useCallback(
    async (parentId: string | null) => {
      try {
        const created = await api.createConcept(board.id, "New concept", parentId);
        setConcepts((list) => [...list, created]);
        setSelectedId(created.id);
        setEditingId(created.id);
        // A new child is useless hidden behind a collapsed parent.
        if (parentId) {
          setCollapsed((set) => {
            if (!set.has(parentId)) return set;
            const next = new Set(set);
            next.delete(parentId);
            return next;
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the concept.");
      }
    },
    [board.id],
  );

  const removeConcept = useCallback(
    async (id: string) => {
      const target = concepts.find((c) => c.id === id);
      if (!target) return;

      const descendants = descendantsOf(concepts, id);
      const detail =
        descendants.length > 0
          ? ` and its ${descendants.length} subconcept${descendants.length === 1 ? "" : "s"}`
          : "";

      if (
        !window.confirm(
          `Delete "${target.name}"${detail}? Any attached files will be deleted too.`,
        )
      ) {
        return;
      }

      try {
        await api.deleteConcept(target, descendants);
        const gone = new Set([id, ...descendants.map((c) => c.id)]);
        setConcepts((list) => list.filter((c) => !gone.has(c.id)));
        setSelectedId((current) => (current && gone.has(current) ? null : current));
        setEditingId((current) => (current && gone.has(current) ? null : current));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete the concept.");
      }
    },
    [concepts],
  );

  const uploadFiles = useCallback(
    async (id: string, files: File[]) => {
      const current = concepts.find((c) => c.id === id);
      if (!current) return;
      mergeConcept(await api.uploadFiles(current, files));
    },
    [concepts, mergeConcept],
  );

  const removeFile = useCallback(
    async (id: string, fileName: string) => {
      const current = concepts.find((c) => c.id === id);
      const file = current?.files.find((f) => f.name === fileName);
      if (!current || !file) return;
      mergeConcept(await api.removeFile(current, file));
    },
    [concepts, mergeConcept],
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  /** Commits the board title on blur; refreshes so the projects list agrees. */
  const renameBoard = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === board.name) {
      setName(board.name);
      return;
    }
    try {
      const updated = await api.updateBoard(board.id, { name: trimmed });
      setName(updated.name);
      router.refresh();
    } catch (err) {
      setName(board.name);
      setError(err instanceof Error ? err.message : "Could not rename the board.");
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <Button variant="ghost" onClick={() => router.push("/projects")} title="All projects">
          <ChevronLeft size={12} strokeWidth={2} aria-hidden />
          Projects
        </Button>

        {readOnly ? (
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink" title={name}>
            {name}
          </span>
        ) : (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void renameBoard()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName(board.name);
                e.currentTarget.blur();
              }
            }}
            aria-label="Board name"
            className="min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-ink hover:border-border-subtle focus:border-accent focus-visible:outline-none"
          />
        )}

        {readOnly && (
          <span
            title="Admins can read every board in the workspace, but not edit them"
            className="flex shrink-0 items-center gap-1 rounded-sm border border-border-subtle px-1.5 py-0.5 text-[9px] uppercase tracking-[0.09em] text-ink-faint"
          >
            <Eye size={10} strokeWidth={2} aria-hidden />
            Read-only
          </span>
        )}

        {error && (
          <button
            type="button"
            onClick={() => setError(null)}
            className="max-w-xs truncate text-[11px] text-danger hover:underline"
            title={`${error} (click to dismiss)`}
          >
            {error}
          </button>
        )}

        {!readOnly && (
          <Button onClick={() => void addConcept(null)}>
            <Plus size={12} strokeWidth={2} aria-hidden />
            Add root concept
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => boardRef.current?.fit()}
          title="Frame the whole board"
        >
          <Maximize2 size={12} strokeWidth={2} aria-hidden />
          Fit
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Width is animated in JS (see useAnimatedPanel) so the board can
            compensate in the same frame; the inner column keeps its full width
            so the contents don't reflow on the way out. */}
        <div
          inert={!panelOpen}
          className="h-full shrink-0 overflow-hidden transition-opacity duration-300"
          style={{ width: panelWidth, opacity: panelOpen ? 1 : 0 }}
        >
          <div className="h-full" style={{ width: PANEL_W }}>
            {panelConcept && (
              /* Keyed by id so switching concepts remounts the panel, which
                 resets its draft state without an effect. */
              <SidePanel
                key={panelConcept.id}
                concept={panelConcept}
                onPatch={patch}
                onUpload={uploadFiles}
                onRemoveFile={removeFile}
                onOpenFile={(conceptId, fileName) =>
                  setViewingFile({ conceptId, name: fileName })
                }
                onAddChild={(id) => void addConcept(id)}
                onDelete={(id) => void removeConcept(id)}
                onClose={() => setEditingId(null)}
              />
            )}
          </div>
        </div>

        <main className="relative min-w-0 flex-1">
          {concepts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
                {readOnly
                  ? "This board is empty."
                  : "This board is empty. Start with a broad area of the field, then branch into subconcepts from there."}
              </p>
              {!readOnly && (
                <Button variant="primary" onClick={() => void addConcept(null)}>
                  <Plus size={12} strokeWidth={2} aria-hidden />
                  Add the first concept
                </Button>
              )}
            </div>
          ) : (
            <BoardCanvas
              roots={roots}
              collapsed={collapsed}
              selectedId={selectedId}
              handleRef={boardRef}
              readOnly={readOnly}
              onSelect={(id) => {
                setSelectedId(id);
                if (id !== null) setInspectorOpen(true);
              }}
              onEdit={setEditingId}
              onToggleCollapse={toggleCollapse}
              onAddChild={(id) => void addConcept(id)}
            />
          )}
        </main>

        {/* Right inspector: same animated-width treatment as the left edit
            panel, just mirrored across the board. */}
        <div
          inert={!inspectorShown}
          className="h-full shrink-0 overflow-hidden transition-opacity duration-300"
          style={{ width: inspectorWidth, opacity: inspectorShown ? 1 : 0 }}
        >
          <div className="h-full" style={{ width: INSPECTOR_W }}>
            {inspectConcept && (
              <InspectorPanel
                key={inspectConcept.id}
                concept={inspectConcept}
                onClose={() => {
                  setInspectorOpen(false);
                  setLastInspectedId(selectedId);
                }}
                onOpenFile={(conceptId, fileName) =>
                  setViewingFile({ conceptId, name: fileName })
                }
              />
            )}
          </div>
        </div>
      </div>

      {viewingFile &&
        (() => {
          const concept = concepts.find((c) => c.id === viewingFile.conceptId);
          const file = concept?.files.find((f) => f.name === viewingFile.name);
          if (!concept || !file) return null;
          return (
            <FileViewer
              key={file.id}
              file={file}
              onClose={() => setViewingFile(null)}
            />
          );
        })()}
    </div>
  );
}

/** Every concept beneath `rootId`, exclusive of the root itself. */
function descendantsOf(concepts: Concept[], rootId: string): Concept[] {
  const children = concepts.filter((c) => c.parentId === rootId);
  return children.flatMap((child) => [child, ...descendantsOf(concepts, child.id)]);
}
