"use client";

import { ExternalLink, FileText, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Concept } from "@/lib/types";
import { fileKind } from "./file-viewer";
import { SectionLabel } from "./ui";

type Props = {
  concept: Concept;
  onClose: () => void;
  onOpenFile: (conceptId: string, name: string) => void;
};

/** Read-only companion to the edit panel: what the concept says, not what it should say. */
export function InspectorPanel({ concept, onClose, onOpenFile }: Props) {
  return (
    <aside className="flex h-full w-full flex-col border-l border-border-subtle bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">Inspector</span>
        <button
          type="button"
          onClick={onClose}
          title="Close panel"
          aria-label="Close panel"
          className="flex items-center justify-center rounded-sm p-1 text-ink-faint hover:bg-accent-soft hover:text-ink"
        >
          <X size={13} strokeWidth={2} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3.5">
        <h2 className="border-b border-border-subtle pb-2 text-sm font-medium leading-snug text-ink">
          {concept.name}
        </h2>

        <section className="space-y-2">
          <SectionLabel>Description</SectionLabel>
          {concept.description.trim() ? (
            <div className="prose-note border border-border-subtle bg-surface-raised px-2.5 py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{concept.description}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-[11px] text-ink-faint">No description.</p>
          )}
        </section>

        <section className="space-y-2">
          <SectionLabel>Links</SectionLabel>
          {concept.links.length === 0 ? (
            <p className="text-[11px] text-ink-faint">No links.</p>
          ) : (
            <ul className="space-y-1">
              {concept.links.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={link.url}
                    className="flex min-w-0 items-center gap-1.5 border border-border-subtle bg-surface-raised px-2 py-1.5 text-[11px] text-ink hover:border-accent hover:text-accent"
                  >
                    <ExternalLink size={11} strokeWidth={2} className="shrink-0" aria-hidden />
                    <span className="truncate">
                      {link.label.trim() || link.url}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <SectionLabel>Files</SectionLabel>
          {concept.files.length === 0 ? (
            <p className="text-[11px] text-ink-faint">No files attached.</p>
          ) : (
            <ul className="space-y-1">
              {concept.files.map((file) => (
                <li key={file.name}>
                  <button
                    type="button"
                    onClick={() => onOpenFile(concept.id, file.name)}
                    title={`View ${file.label}`}
                    className="flex w-full min-w-0 items-center gap-2 border border-border-subtle bg-surface-raised px-2 py-1.5 text-left hover:border-accent"
                  >
                    <FileText size={12} strokeWidth={1.75} className="shrink-0 text-ink-faint" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-ink hover:text-accent">
                      {file.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                      {fileKind(file.name, file.size) === "other" ? "file" : fileKind(file.name, file.size)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
