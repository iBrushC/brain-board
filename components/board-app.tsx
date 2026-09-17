"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Maximize2, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { buildTree } from "@/lib/tree";
import type { Concept, ConceptPatch } from "@/lib/types";
import { BoardCanvas, type BoardHandle } from "./board-canvas";
import { FileViewer } from "./file-viewer";
import { InspectorPanel } from "./inspector-panel";
import { SidePanel } from "./side-panel";
import { Button } from "./ui";
import { VaultSetup } from "./vault-setup";

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

export function BoardApp() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kept apart from selection: the panel is an explicit mode you enter from a
  // node's edit button, so clicking around the board can't drop you out of it
  // mid-sentence.
  const [editingId, setEditingId] = useState<string | null>(null);
  // Read-only inspector on the right: opens whenever a node is selected, but
  // stays out of the way until then so clicking around the board is quiet.
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState<{ conceptId: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const boardRef = useRef<BoardHandle>(null);

  const load = useCallback(async () => {
    const { concepts, vaultPath } = await api.listConcepts();
    setConcepts(concepts);
    setVaultPath(vaultPath);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const vault = await api.getVault();
        setVaultPath(vault.path);
        if (vault.path) await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the board.");
      } finally {
        setReady(true);
      }
    })();
  }, [load]);

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
  const panelOpen = editingId !== null && panelConcept !== null;

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
      mergeConcept(await api.updateConcept(id, patch));
    },
    [mergeConcept],
  );

  const addConcept = useCallback(async (parentId: string | null) => {
    try {
      const created = await api.createConcept("New concept", parentId);
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
  }, []);

  const removeConcept = useCallback(
    async (id: string) => {
      const target = concepts.find((c) => c.id === id);
      const descendants = countDescendants(concepts, id);
      const detail =
        descendants > 0
          ? ` and its ${descendants} subconcept${descendants === 1 ? "" : "s"}`
          : "";

      if (
        !window.confirm(
          `Delete "${target?.name ?? id}"${detail}? The markdown file${
            descendants > 0 ? "s" : ""
          } and any attached files will be removed from disk.`,
        )
      ) {
        return;
      }

      try {
        const deleted = new Set(await api.deleteConcept(id));
        setConcepts((list) => list.filter((c) => !deleted.has(c.id)));
        setSelectedId((current) => (current && deleted.has(current) ? null : current));
        setEditingId((current) => (current && deleted.has(current) ? null : current));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete the concept.");
      }
    },
    [concepts],
  );

  const uploadFiles = useCallback(
    async (id: string, files: File[]) => mergeConcept(await api.uploadFiles(id, files)),
    [mergeConcept],
  );

  const removeFile = useCallback(
    async (id: string, name: string) => mergeConcept(await api.deleteFile(id, name)),
    [mergeConcept],
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-xs text-ink-faint">
        Loading…
      </div>
    );
  }

  if (!vaultPath) {
    return (
      <VaultSetup
        onReady={(path) => {
          setVaultPath(path);
          void load();
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <span className="text-xs font-semibold tracking-tight">Brain Board</span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-faint"
          title={vaultPath}
        >
          {vaultPath}
        </span>

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

        <Button onClick={() => void addConcept(null)}>
          <Plus size={12} strokeWidth={2} aria-hidden />
          Add root concept
        </Button>
        <Button variant="ghost" onClick={() => boardRef.current?.fit()} title="Frame the whole board">
          <Maximize2 size={12} strokeWidth={2} aria-hidden />
          Fit
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setVaultPath(null);
            setConcepts([]);
            setSelectedId(null);
            setEditingId(null);
          }}
        >
          <FolderOpen size={12} strokeWidth={2} aria-hidden />
          Change folder
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
                This board is empty. Start with a broad area of the field, then branch
                into subconcepts from there.
              </p>
              <Button variant="primary" onClick={() => void addConcept(null)}>
                <Plus size={12} strokeWidth={2} aria-hidden />
                Add the first concept
              </Button>
            </div>
          ) : (
            <BoardCanvas
              roots={roots}
              collapsed={collapsed}
              selectedId={selectedId}
              handleRef={boardRef}
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
                onOpenFile={(conceptId, name) => setViewingFile({ conceptId, name })}
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
              key={`${viewingFile.conceptId}/${viewingFile.name}`}
              target={{ conceptId: concept.id, file }}
              onClose={() => setViewingFile(null)}
            />
          );
        })()}
    </div>
  );
}

function countDescendants(concepts: Concept[], rootId: string): number {
  const children = concepts.filter((c) => c.parentId === rootId);
  return children.reduce((sum, child) => sum + 1 + countDescendants(concepts, child.id), 0);
}
