"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { buildTree } from "@/lib/tree";
import type { Concept, ConceptPatch } from "@/lib/types";
import { BoardCanvas, type BoardHandle } from "./board-canvas";
import { SidePanel } from "./side-panel";
import { Button } from "./ui";
import { VaultSetup } from "./vault-setup";

export function BoardApp() {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected = useMemo(
    () => concepts.find((c) => c.id === selectedId) ?? null,
    [concepts, selectedId],
  );

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

        <Button onClick={() => void addConcept(null)}>Add root concept</Button>
        <Button variant="ghost" onClick={() => boardRef.current?.fit()}>
          Fit
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setVaultPath(null);
            setConcepts([]);
            setSelectedId(null);
          }}
        >
          Change folder
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {selected && (
          /* Keyed by id so switching concepts remounts the panel, which resets
             its draft state without an effect. */
          <SidePanel
            key={selected.id}
            concept={selected}
            onPatch={patch}
            onUpload={uploadFiles}
            onRemoveFile={removeFile}
            onAddChild={(id) => void addConcept(id)}
            onDelete={(id) => void removeConcept(id)}
            onClose={() => setSelectedId(null)}
          />
        )}

        <main className="relative min-w-0 flex-1">
          {concepts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
                This board is empty. Start with a broad area of the field, then branch
                into subconcepts from there.
              </p>
              <Button variant="primary" onClick={() => void addConcept(null)}>
                Add the first concept
              </Button>
            </div>
          ) : (
            <BoardCanvas
              roots={roots}
              collapsed={collapsed}
              selectedId={selectedId}
              handleRef={boardRef}
              onSelect={setSelectedId}
              onToggleCollapse={toggleCollapse}
              onAddChild={(id) => void addConcept(id)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function countDescendants(concepts: Concept[], rootId: string): number {
  const children = concepts.filter((c) => c.parentId === rootId);
  return children.reduce((sum, child) => sum + 1 + countDescendants(concepts, child.id), 0);
}
