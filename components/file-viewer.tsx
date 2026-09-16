"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { api } from "@/lib/client";
import type { ConceptFile } from "@/lib/types";

type FileRef = { conceptId: string; file: ConceptFile };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT =
  /\.(txt|md|markdown|json|csv|log|xml|yml|yaml|html?|css|js|mjs|jsx|ts|tsx|py|rb|go|rs|java|c|h|cpp|hpp|sh|toml|ini|env|sql)$/i;
const TEXT_LIMIT = 2 * 1024 * 1024;

/** Decides how a file can be shown: embedded, as text, or download-only. */
export function fileKind(name: string, size: number): "image" | "pdf" | "text" | "other" {
  if (IMAGE_EXT.test(name)) return "image";
  if (PDF_EXT.test(name)) return "pdf";
  if (TEXT_EXT.test(name) && size <= TEXT_LIMIT) return "text";
  return "other";
}

export function FileViewer({ target: { conceptId, file }, onClose }: {
  target: FileRef;
  onClose: () => void;
}) {
  const kind = fileKind(file.name, file.size);
  const url = api.fileUrl(conceptId, file.name);
  const [text, setText] = useState<string | null>(kind === "text" ? null : "");

  useEffect(() => {
    if (kind !== "text") return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(url);
        const body = await res.text();
        if (alive) setText(body);
      } catch {
        if (alive) setText("Could not load the file.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`View ${file.label}`}
    >
      <div
        className="flex h-full max-h-[85vh] w-full max-w-4xl flex-col border border-border-subtle bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-medium text-ink" title={file.label}>
              {file.label}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase text-ink-faint">
              {kind === "other" ? "file" : kind}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={url}
              download={file.label}
              title="Download"
              aria-label={`Download ${file.label}`}
              className="flex items-center justify-center rounded-sm p-1 text-ink-faint hover:bg-accent-soft hover:text-ink"
            >
              <Download size={13} strokeWidth={2} aria-hidden />
            </a>
            <button
              type="button"
              onClick={onClose}
              title="Close viewer"
              aria-label="Close viewer"
              className="flex items-center justify-center rounded-sm p-1 text-ink-faint hover:bg-accent-soft hover:text-ink"
            >
              <X size={13} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-surface-raised">
          {kind === "image" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={file.label}
              className="mx-auto max-h-full max-w-full object-contain p-3"
            />
          )}
          {kind === "pdf" && <iframe src={url} title={file.label} className="h-full w-full" />}
          {kind === "text" &&
            (text === null ? (
              <p className="p-3 text-[11px] text-ink-faint">Loading…</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-ink">
                {text}
              </pre>
            ))}
          {kind === "other" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-[11px] text-ink-muted">No preview available for this file type.</p>
              <a
                href={url}
                download={file.label}
                className="text-[11px] text-accent hover:underline"
              >
                Download {file.label}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

