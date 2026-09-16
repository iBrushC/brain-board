"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/client";
import type { Concept, ConceptLink, ConceptPatch } from "@/lib/types";
import { Button, inputClass, SectionLabel } from "./ui";

const AUTOSAVE_MS = 600;

type Props = {
  concept: Concept;
  onPatch: (id: string, patch: ConceptPatch) => Promise<void>;
  onUpload: (id: string, files: File[]) => Promise<void>;
  onRemoveFile: (id: string, name: string) => Promise<void>;
  onAddChild: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function SidePanel({
  concept,
  onPatch,
  onUpload,
  onRemoveFile,
  onAddChild,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(concept.name);
  const [description, setDescription] = useState(concept.description);
  const [links, setLinks] = useState<ConceptLink[]>(concept.links);
  const [editingBody, setEditingBody] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Whether the draft has diverged from what's on disk. Derived rather than
  // stored, so a successful save (which updates `concept`) clears it on its own.
  const dirty =
    name !== concept.name ||
    description !== concept.description ||
    !sameLinks(links, concept.links);

  // Debounced autosave. Staying put while the draft matches disk means simply
  // opening a concept never rewrites its file.
  useEffect(() => {
    if (!dirty) return;

    const timer = setTimeout(async () => {
      setSave("saving");
      try {
        await onPatch(concept.id, { name, description, links });
        setSave("saved");
        setError(null);
      } catch (err) {
        setSave("error");
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    }, AUTOSAVE_MS);

    return () => clearTimeout(timer);
  }, [dirty, name, description, links, concept, onPatch]);

  const status =
    save === "error"
      ? "Not saved"
      : dirty || save === "saving"
        ? "Saving…"
        : save === "saved"
          ? "Saved"
          : "Concept";

  const [uploading, setUploading] = useState(false);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    try {
      await onUpload(concept.id, files);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-r border-border-subtle bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <span
          className={`text-[10px] uppercase tracking-[0.09em] ${
            save === "error" ? "text-danger" : "text-ink-faint"
          }`}
        >
          {status}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="rounded-sm px-1.5 py-0.5 text-xs text-ink-faint hover:bg-accent-soft hover:text-ink"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-3.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Concept name"
          className="w-full rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-ink hover:border-border-subtle focus:border-accent focus-visible:outline-none"
        />

        {error && (
          <p className="border border-border-subtle bg-surface-raised px-2 py-1.5 text-[11px] text-danger">
            {error}
          </p>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Description</SectionLabel>
            <button
              type="button"
              onClick={() => setEditingBody((v) => !v)}
              className="text-[10px] uppercase tracking-[0.09em] text-ink-faint hover:text-accent"
            >
              {editingBody ? "Preview" : "Edit"}
            </button>
          </div>

          {editingBody ? (
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Markdown supported…"
              className={`${inputClass} min-h-56 resize-y font-mono leading-relaxed`}
            />
          ) : description.trim() ? (
            <div className="prose-note border border-border-subtle bg-surface-raised px-2.5 py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingBody(true)}
              className="w-full border border-dashed border-border-subtle px-2.5 py-3 text-left text-[11px] text-ink-faint hover:border-border-strong hover:text-ink-muted"
            >
              No description yet — click to write one.
            </button>
          )}
        </section>

        <LinkEditor links={links} onChange={setLinks} />

        <section className="space-y-2">
          <SectionLabel>Files</SectionLabel>

          <ul className="space-y-1">
            {concept.files.map((file) => (
              <li
                key={file.name}
                className="flex items-center gap-2 border border-border-subtle bg-surface-raised px-2 py-1.5"
              >
                <a
                  href={api.fileUrl(concept.id, file.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[11px] text-ink hover:text-accent hover:underline"
                  title={file.label}
                >
                  {file.label}
                </a>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                  {formatSize(file.size)}
                </span>
                <button
                  type="button"
                  title="Remove file"
                  onClick={() => void onRemoveFile(concept.id, file.name)}
                  className="shrink-0 text-[11px] leading-none text-ink-faint hover:text-danger"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(Array.from(e.dataTransfer.files));
            }}
            className="block cursor-pointer border border-dashed border-border-subtle px-2.5 py-3 text-center text-[11px] text-ink-faint hover:border-border-strong hover:text-ink-muted"
          >
            {uploading ? "Copying…" : "Drop files here, or click to choose"}
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-[10px] text-ink-faint">
            Files are copied into the board folder, so it stays self-contained.
          </p>
        </section>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
        <Button onClick={() => onAddChild(concept.id)}>Add subconcept</Button>
        <Button variant="danger" onClick={() => onDelete(concept.id)}>
          Delete
        </Button>
      </footer>
    </aside>
  );
}

function LinkEditor({
  links,
  onChange,
}: {
  links: ConceptLink[];
  onChange: (links: ConceptLink[]) => void;
}) {
  const update = (index: number, patch: Partial<ConceptLink>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <SectionLabel>Links</SectionLabel>
        <button
          type="button"
          onClick={() => onChange([...links, { label: "", url: "" }])}
          className="text-[10px] uppercase tracking-[0.09em] text-ink-faint hover:text-accent"
        >
          Add
        </button>
      </div>

      {links.length === 0 && (
        <p className="text-[11px] text-ink-faint">No links yet.</p>
      )}

      <ul className="space-y-1.5">
        {links.map((link, index) => (
          <li key={index} className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1 space-y-1">
              <input
                value={link.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Label"
                className={inputClass}
              />
              <div className="flex items-center gap-1.5">
                <input
                  value={link.url}
                  onChange={(e) => update(index, { url: e.target.value })}
                  placeholder="https://"
                  spellCheck={false}
                  className={`${inputClass} font-mono text-[11px]`}
                />
                {isOpenable(link.url) && (
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open link"
                    className="shrink-0 border border-border-subtle px-1.5 py-1.5 text-[11px] leading-none text-ink-faint hover:border-accent hover:text-accent"
                  >
                    ↗
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              title="Remove link"
              onClick={() => onChange(links.filter((_, i) => i !== index))}
              className="mt-2 shrink-0 text-[11px] leading-none text-ink-faint hover:text-danger"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Only offer to open links the browser will actually navigate to. */
function isOpenable(url: string): boolean {
  return /^https?:\/\/\S+/i.test(url.trim());
}

function sameLinks(a: ConceptLink[], b: ConceptLink[]): boolean {
  return (
    a.length === b.length &&
    a.every((link, i) => link.label === b[i].label && link.url === b[i].url)
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
