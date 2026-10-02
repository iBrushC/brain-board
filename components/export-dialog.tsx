"use client";

import { useEffect, useState } from "react";
import { Download, TriangleAlert, X } from "lucide-react";
import {
  buildExportHtml,
  downloadBlob,
  EMAIL_WARN_BYTES,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  type ExportPlan,
  type SkipReason,
  type SkippedFile,
} from "@/lib/export-html";
import { Button, SectionLabel } from "./ui";

const REASONS: Record<SkipReason, string> = {
  "too-large": `over ${formatBytes(MAX_FILE_BYTES)}`,
  "over-total": `over the ${formatBytes(MAX_TOTAL_BYTES)} total`,
  failed: "couldn't be downloaded",
};

type Status =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number }
  | { kind: "done"; failed: SkippedFile[] }
  | { kind: "error"; message: string };

/** Confirms what an HTML export will contain, then builds and downloads it. */
export function ExportDialog({ plan, onClose }: { plan: ExportPlan; onClose: () => void }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "working";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const run = async () => {
    setStatus({ kind: "working", done: 0, total: plan.included.length });
    try {
      const result = await buildExportHtml(plan, (done, total) =>
        setStatus({ kind: "working", done, total }),
      );
      downloadBlob(result.blob, result.fileName);
      // Nothing to report means nothing to keep the dialog open for.
      if (result.failed.length === 0) onClose();
      else setStatus({ kind: "done", failed: result.failed });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not export the board.",
      });
    }
  };

  const fileCount = plan.included.length + plan.skipped.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col border border-border-subtle bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <span id="export-title" className="text-xs font-medium text-ink">
            Export as HTML
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            title="Close"
            aria-label="Close"
            className="flex items-center justify-center rounded-sm p-1 text-ink-faint hover:bg-accent-soft hover:text-ink"
          >
            <X size={13} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3.5">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            Creates a single file anyone can open in a web browser, no account needed. It&rsquo;s
            a snapshot: later edits won&rsquo;t show up in it, and anyone you send it to can read
            everything inside.
          </p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
            <dt className="text-ink-faint">Concepts</dt>
            <dd className="text-ink">{plan.concepts.length}</dd>
            <dt className="text-ink-faint">Files</dt>
            <dd className="text-ink">
              {fileCount === 0
                ? "None"
                : `${plan.included.length} of ${fileCount} included`}
            </dd>
            <dt className="text-ink-faint">Estimated size</dt>
            <dd className="text-ink">{formatBytes(plan.estimatedBytes)}</dd>
          </dl>

          {plan.estimatedBytes > EMAIL_WARN_BYTES && (
            <p className="flex gap-1.5 text-[11px] leading-relaxed text-danger">
              <TriangleAlert size={12} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
              Over {formatBytes(EMAIL_WARN_BYTES)}, which many email providers won&rsquo;t accept
              as an attachment. A file-sharing link will work better.
            </p>
          )}

          {plan.skipped.length > 0 && (
            <SkippedList
              title="Left out (listed by name only)"
              files={plan.skipped}
            />
          )}

          {status.kind === "done" && (
            <SkippedList
              title="Exported, but these couldn't be downloaded and were left out"
              files={status.failed}
            />
          )}

          {status.kind === "error" && (
            <p className="text-[11px] text-danger">{status.message}</p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-3 py-2">
          {status.kind === "working" && (
            <span className="mr-auto text-[11px] text-ink-faint">
              {status.total === 0
                ? "Building…"
                : `Downloading files ${status.done} of ${status.total}…`}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {status.kind === "done" ? "Close" : "Cancel"}
          </Button>
          {status.kind !== "done" && (
            <Button variant="primary" onClick={() => void run()} disabled={busy}>
              <Download size={12} strokeWidth={2} aria-hidden />
              {busy ? "Exporting…" : "Export"}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function SkippedList({ title, files }: { title: string; files: SkippedFile[] }) {
  return (
    <section className="space-y-2">
      <SectionLabel>{title}</SectionLabel>
      <ul className="space-y-1">
        {files.map(({ file, conceptName, reason }) => (
          <li
            key={file.id}
            className="flex min-w-0 items-baseline gap-2 border border-border-subtle bg-surface-raised px-2 py-1.5 text-[11px]"
          >
            <span className="min-w-0 flex-1 truncate text-ink" title={`${file.label} · ${conceptName}`}>
              {file.label}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-faint">
              {formatBytes(file.size)} · {REASONS[reason]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
