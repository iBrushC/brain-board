"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  CornerDownRight,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/client";
import { CONCEPT_COLORS, swatch } from "@/lib/colors";
import type { ConceptColor } from "@/lib/colors";
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

  // A colour is a single click, so it writes straight through rather than
  // waiting on the text autosave.
  const setColor = async (color: ConceptColor | null) => {
    try {
      await onPatch(concept.id, { color });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the colour.");
    }
  };

  return (
    <aside className="flex h-full w-full flex-col border-r border-border-subtle bg-surface">
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
          title="Close panel"
          aria-label="Close panel"
          className="flex items-center justify-center rounded-sm p-1 text-ink-faint hover:bg-accent-soft hover:text-ink"
        >
          <X size={13} strokeWidth={2} aria-hidden />
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

        <ColorPicker value={concept.color} onChange={(color) => void setColor(color)} />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Description</SectionLabel>
            <button
              type="button"
              onClick={() => setEditingBody((v) => !v)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-[0.09em] text-ink-faint hover:text-accent"
            >
              {editingBody ? (
                <Eye size={11} strokeWidth={2} aria-hidden />
              ) : (
                <Pencil size={11} strokeWidth={2} aria-hidden />
              )}
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
              className="flex w-full items-center gap-1.5 border border-dashed border-border-subtle px-2.5 py-3 text-left text-[11px] text-ink-faint hover:border-border-strong hover:text-ink-muted"
            >
              <Pencil size={12} strokeWidth={1.75} aria-hidden />
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
                  aria-label={`Remove ${file.label}`}
                  onClick={() => void onRemoveFile(concept.id, file.name)}
                  className="shrink-0 text-ink-faint hover:text-danger"
                >
                  <X size={12} strokeWidth={2} aria-hidden />
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
            className="flex cursor-pointer items-center justify-center gap-1.5 border border-dashed border-border-subtle px-2.5 py-3 text-center text-[11px] text-ink-faint hover:border-border-strong hover:text-ink-muted"
          >
            <Upload size={12} strokeWidth={1.75} aria-hidden />
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
        <Button onClick={() => onAddChild(concept.id)}>
          <CornerDownRight size={12} strokeWidth={2} aria-hidden />
          Add subconcept
        </Button>
        <Button variant="danger" onClick={() => onDelete(concept.id)}>
          <Trash2 size={12} strokeWidth={2} aria-hidden />
          Delete
        </Button>
      </footer>
    </aside>
  );
}

/** The sixteen pastels, plus a way back to the board's default surface. */
function ColorPicker({
  value,
  onChange,
}: {
  value: ConceptColor | null;
  onChange: (color: ConceptColor | null) => void;
}) {
  return (
    <section className="space-y-2">
      <SectionLabel>Colour</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          title="No colour"
          aria-label="No colour"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`flex h-6 w-6 items-center justify-center rounded-sm border bg-surface-raised text-ink-faint hover:border-border-strong ${
            value === null ? "is-selected border-border-strong" : "border-border-subtle"
          }`}
        >
          <Ban size={12} strokeWidth={1.75} aria-hidden />
        </button>

        {CONCEPT_COLORS.map((color) => {
          const tint = swatch(color.key);
          const active = value === color.key;
          return (
            <button
              key={color.key}
              type="button"
              title={color.label}
              aria-label={color.label}
              aria-pressed={active}
              onClick={() => onChange(color.key)}
              style={{
                backgroundColor: tint?.fill,
                borderColor: tint?.border,
                color: tint?.ink,
              }}
              className={`flex h-6 w-6 items-center justify-center rounded-sm border ${
                active ? "is-selected" : ""
              }`}
            >
              {active && <Check size={12} strokeWidth={2.5} aria-hidden />}
            </button>
          );
        })}
      </div>
    </section>
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
          className="flex items-center gap-1 text-[10px] uppercase tracking-[0.09em] text-ink-faint hover:text-accent"
        >
          <Plus size={11} strokeWidth={2} aria-hidden />
          Add
        </button>
      </div>

      {links.length === 0 && <p className="text-[11px] text-ink-faint">No links yet.</p>}

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
                    className="flex shrink-0 items-center border border-border-subtle p-1.5 text-ink-faint hover:border-accent hover:text-accent"
                  >
                    <ExternalLink size={12} strokeWidth={2} aria-hidden />
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              title="Remove link"
              aria-label="Remove link"
              onClick={() => onChange(links.filter((_, i) => i !== index))}
              className="mt-2 shrink-0 text-ink-faint hover:text-danger"
            >
              <X size={12} strokeWidth={2} aria-hidden />
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
