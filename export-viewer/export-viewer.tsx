"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Search, Tag as TagIcon } from "lucide-react";
import { BoardCanvas, type BoardHandle } from "@/components/board-canvas";
import { FileViewer } from "@/components/file-viewer";
import { InspectorPanel } from "@/components/inspector-panel";
import { Button, inputClass } from "@/components/ui";
import { swatch } from "@/lib/colors";
import type { ExportPayload } from "@/lib/export-format";
import { FILE_ELEMENT_PREFIX } from "@/lib/export-format";
import { buildTree } from "@/lib/tree";
import type { Concept, ConceptFile, ConceptLink } from "@/lib/types";

const INSPECTOR_W = 340;
const MAX_RESULTS = 20;
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * The read-only board inside an HTML export: the same canvas, nodes and
 * inspector as the app, fed from the page's embedded data instead of Supabase.
 */
export function ExportViewer({ payload }: { payload: ExportPayload }) {
  const { board } = payload;

  // Back into the app's shapes, so the shared components take them unchanged.
  // `included` rides along on each file for the "not included" badge.
  const concepts = useMemo<Concept[]>(
    () =>
      payload.concepts.map((c) => ({
        ...c,
        boardId: "",
        links: safeLinks(c.links),
        files: c.files.map((f) => ({ ...f, storagePath: "" })),
      })),
    [payload],
  );
  const missingFiles = useMemo(
    () =>
      new Set(payload.concepts.flatMap((c) => c.files.filter((f) => !f.included).map((f) => f.id))),
    [payload],
  );

  const roots = useMemo(() => buildTree(concepts), [concepts]);
  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const tagById = useMemo(() => new Map(board.tags.map((t) => [t.id, t])), [board.tags]);

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(payload.collapsed.filter((id) => byId.has(id))),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ conceptId: string; name: string } | null>(
    null,
  );
  const boardRef = useRef<BoardHandle>(null);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  /** Opens every branch above a concept, then selects it and brings it into view. */
  const reveal = useCallback(
    (id: string) => {
      const ancestors: string[] = [];
      for (let p = byId.get(id)?.parentId; p; p = byId.get(p)?.parentId) ancestors.push(p);
      setCollapsed((set) => {
        if (!ancestors.some((a) => set.has(a))) return set;
        const next = new Set(set);
        for (const a of ancestors) next.delete(a);
        return next;
      });
      setSelectedId(id);
      boardRef.current?.focus(id);
    },
    [byId],
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-xs font-medium text-ink" title={board.name}>
            {board.name}
          </span>
          <span
            className="shrink-0 text-[10px] text-ink-faint"
            title="A snapshot of the board, exported from Brain Board"
          >
            Exported {formatDate(payload.exportedAt)}
          </span>
        </div>

        <ConceptSearch concepts={concepts} byId={byId} onPick={reveal} />
        {board.tags.length > 0 && <TagLegend payload={payload} />}

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
        <main className="relative min-w-0 flex-1">
          {concepts.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-xs text-ink-muted">This board is empty.</p>
            </div>
          ) : (
            <BoardCanvas
              roots={roots}
              tags={board.tags}
              collapsed={collapsed}
              selectedId={selectedId}
              handleRef={boardRef}
              readOnly
              onSelect={setSelectedId}
              onEdit={() => {}}
              onToggleCollapse={toggleCollapse}
              onAddChild={() => {}}
            />
          )}
        </main>

        {selected && (
          <div className="h-full shrink-0" style={{ width: INSPECTOR_W }}>
            <InspectorPanel
              key={selected.id}
              concept={selected}
              tag={selected.tagId ? (tagById.get(selected.tagId) ?? null) : null}
              onClose={() => setSelectedId(null)}
              onOpenFile={(conceptId, name) => setViewingFile({ conceptId, name })}
              fileBadge={(file) => (missingFiles.has(file.id) ? "not included" : null)}
            />
          </div>
        )}
      </div>

      {viewingFile &&
        (() => {
          const file = byId
            .get(viewingFile.conceptId)
            ?.files.find((f) => f.name === viewingFile.name);
          if (!file) return null;
          return (
            <FileViewer
              key={file.id}
              file={file}
              resolveUrl={embeddedFileUrl}
              onClose={() => setViewingFile(null)}
            />
          );
        })()}
    </div>
  );
}

function ConceptSearch({
  concepts,
  byId,
  onPick,
}: {
  concepts: Concept[];
  byId: Map<string, Concept>;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Name hits first: they're almost always what was meant.
    const byName = concepts.filter((c) => c.name.toLowerCase().includes(q));
    const byBody = concepts.filter(
      (c) => !c.name.toLowerCase().includes(q) && c.description.toLowerCase().includes(q),
    );
    return [...byName, ...byBody].slice(0, MAX_RESULTS);
  }, [concepts, query]);

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };

  return (
    <div className="relative w-64 shrink-0">
      <Search
        size={12}
        strokeWidth={2}
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        placeholder="Search concepts"
        aria-label="Search concepts"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a result lands before the list unmounts.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            pick(results[active].id);
          } else if (e.key === "Escape") {
            setQuery("");
            e.currentTarget.blur();
          }
        }}
        className={`${inputClass} py-1 pl-6`}
      />

      {open && query.trim() && (
        <ul className="absolute right-0 top-full z-40 mt-1 max-h-80 w-80 overflow-y-auto border border-border-subtle bg-surface-raised shadow-lg">
          {results.length === 0 ? (
            <li className="px-2.5 py-2 text-[11px] text-ink-faint">No matching concepts.</li>
          ) : (
            results.map((c, index) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.id)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full min-w-0 flex-col items-start gap-0.5 px-2.5 py-1.5 text-left ${
                    index === active ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="w-full truncate text-[11px] text-ink">{c.name}</span>
                  {c.parentId && (
                    <span className="w-full truncate text-[10px] text-ink-faint">
                      {pathOf(c, byId)}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function TagLegend({ payload }: { payload: ExportPayload }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of payload.concepts) {
      if (c.tagId) map.set(c.tagId, (map.get(c.tagId) ?? 0) + 1);
    }
    return map;
  }, [payload]);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <Button
        variant="ghost"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="What each colour means on this board"
      >
        <TagIcon size={12} strokeWidth={2} aria-hidden />
        Tags
      </Button>

      {open && (
        <ul className="absolute right-0 top-full z-40 mt-1 w-56 space-y-1 border border-border-subtle bg-surface-raised p-2 shadow-lg">
          {payload.board.tags.map((tag) => {
            const tint = swatch(tag.color);
            return (
              <li key={tag.id} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-sm border"
                  style={{ backgroundColor: tint?.fill, borderColor: tint?.border }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{tag.name}</span>
                <span className="font-mono text-[10px] text-ink-faint">
                  {counts.get(tag.id) ?? 0}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Decoded once per file, then reused for every later open. */
const blobUrls = new Map<string, string>();

/** Attachments sit in the page as base64, so viewing one means decoding it into a blob. */
async function embeddedFileUrl(file: ConceptFile): Promise<string> {
  const cached = blobUrls.get(file.id);
  if (cached) return cached;

  const element = document.getElementById(FILE_ELEMENT_PREFIX + file.id);
  if (!element?.textContent) {
    throw new Error("This file wasn't included in the export, usually because it was too large.");
  }

  const binary = atob(element.textContent.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const url = URL.createObjectURL(new Blob([bytes], { type: blobType(file) }));
  blobUrls.set(file.id, url);
  return url;
}

/**
 * Only types the viewer embeds keep their real MIME type. Everything else is
 * opaque bytes, so an attached HTML page can be downloaded but never rendered.
 */
function blobType(file: ConceptFile): string {
  const name = file.label.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (file.mimeType?.startsWith("image/") && file.mimeType !== "image/svg+xml") return file.mimeType;
  return "application/octet-stream";
}

/** Drops `javascript:` and friends; the file may be opened by anyone, anywhere. */
function safeLinks(links: ConceptLink[]): ConceptLink[] {
  return links.filter((link) => {
    try {
      return SAFE_PROTOCOLS.has(new URL(link.url).protocol);
    } catch {
      return false;
    }
  });
}

function pathOf(concept: Concept, byId: Map<string, Concept>): string {
  const names: string[] = [];
  for (let p = concept.parentId; p; p = byId.get(p)?.parentId ?? null) {
    const parent = byId.get(p);
    if (!parent) break;
    names.unshift(parent.name);
  }
  return names.join(" › ");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
