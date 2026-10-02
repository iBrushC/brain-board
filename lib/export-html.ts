import { api } from "./client";
import type { ConceptColor } from "./colors";
import {
  DATA_ELEMENT_ID,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  FILE_ELEMENT_PREFIX,
  type ExportPayload,
} from "./export-format";
import type { Concept, ConceptFile, Tag } from "./types";

/**
 * Turns a board into one self-contained HTML file, entirely in the browser:
 * the concepts are already loaded, and attachments come down through the same
 * signed URLs the file viewer uses. Nothing is uploaded anywhere.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
/** Above this, many mail providers refuse the attachment. */
export const EMAIL_WARN_BYTES = 25 * 1024 * 1024;

/** Rough size of the inlined viewer, for the estimate shown before exporting. */
const VIEWER_BYTES = 420 * 1024;
const VIEWER_BASE = "/export-viewer";

export type SkipReason = "too-large" | "over-total" | "failed";

export type PlannedFile = { file: ConceptFile; conceptName: string };
export type SkippedFile = PlannedFile & { reason: SkipReason };

export type ExportPlan = {
  board: { name: string; color: ConceptColor | null; tags: Tag[] };
  concepts: Concept[];
  collapsed: string[];
  included: PlannedFile[];
  skipped: SkippedFile[];
  /** Best guess at the finished file's size, before anything is fetched. */
  estimatedBytes: number;
};

/**
 * Decides which attachments fit, from the sizes already on hand, without
 * downloading anything. Files are taken in board order until the budget runs
 * out, so a later file can't push out an earlier one.
 */
export function planExport(input: {
  name: string;
  color: ConceptColor | null;
  tags: Tag[];
  concepts: Concept[];
  collapsed: Iterable<string>;
}): ExportPlan {
  const included: PlannedFile[] = [];
  const skipped: SkippedFile[] = [];
  let total = 0;

  for (const concept of input.concepts) {
    for (const file of concept.files) {
      const entry = { file, conceptName: concept.name };
      if (file.size > MAX_FILE_BYTES) {
        skipped.push({ ...entry, reason: "too-large" });
      } else if (total + file.size > MAX_TOTAL_BYTES) {
        skipped.push({ ...entry, reason: "over-total" });
      } else {
        included.push(entry);
        total += file.size;
      }
    }
  }

  const textBytes = input.concepts.reduce(
    (sum, c) => sum + c.name.length + c.description.length + 400,
    0,
  );

  return {
    board: { name: input.name, color: input.color, tags: input.tags },
    concepts: input.concepts,
    collapsed: [...input.collapsed],
    included,
    skipped,
    // Base64 costs a third on top of the raw bytes.
    estimatedBytes: VIEWER_BYTES + textBytes + Math.ceil(total * (4 / 3)),
  };
}

export type ExportResult = {
  blob: Blob;
  fileName: string;
  /** Files the plan meant to include but which couldn't be fetched. */
  failed: SkippedFile[];
};

/** Fetches the viewer and every planned attachment, and assembles the page. */
export async function buildExportHtml(
  plan: ExportPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const [viewerJs, viewerCss] = await Promise.all([
    fetchText(`${VIEWER_BASE}/viewer.js`),
    fetchText(`${VIEWER_BASE}/viewer.css`),
  ]);

  const embedded = new Map<string, string>();
  const failed: SkippedFile[] = [];

  onProgress?.(0, plan.included.length);
  for (const [index, entry] of plan.included.entries()) {
    try {
      const url = await api.signedFileUrl(entry.file);
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      embedded.set(entry.file.id, await toBase64(await res.blob()));
    } catch {
      failed.push({ ...entry, reason: "failed" });
    }
    onProgress?.(index + 1, plan.included.length);
  }

  const exportedAt = new Date().toISOString();
  const payload: ExportPayload = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    board: plan.board,
    // Listed field by field, so whatever is added to a concept later doesn't
    // leave the app in an export unless someone decides it should. Storage
    // paths and board ids mean nothing outside the app anyway.
    concepts: plan.concepts.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      parentId: c.parentId,
      order: c.order,
      color: c.color,
      tagId: c.tagId,
      links: c.links,
      files: c.files.map((f) => ({
        id: f.id,
        name: f.name,
        label: f.label,
        size: f.size,
        mimeType: f.mimeType,
        addedAt: f.addedAt,
        included: embedded.has(f.id),
      })),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    collapsed: plan.collapsed,
  };

  const fileBlocks = [...embedded]
    .map(
      ([id, data]) =>
        `<script type="application/octet-stream" id="${FILE_ELEMENT_PREFIX}${id}">${data}</script>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Brain Board">
<title>${escapeHtml(plan.board.name)} · Brain Board</title>
<style>${viewerCss}</style>
</head>
<body>
<div id="root"></div>
<noscript><p style="padding:1rem;font-family:system-ui,sans-serif">This board export needs JavaScript to display. Open it in a web browser with JavaScript turned on.</p></noscript>
<script type="application/json" id="${DATA_ELEMENT_ID}">${serializeJson(payload)}</script>
${fileBlocks}
<script>${viewerJs}</script>
</body>
</html>
`;

  return {
    blob: new Blob([html], { type: "text/html;charset=utf-8" }),
    fileName: exportFileName(plan.board.name, exportedAt),
    failed,
  };
}

/** Hands the finished file to the browser's download flow. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a moment to start before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load the export viewer. Try reloading the page.");
  return res.text();
}

/** Native base64 via a data URL, far quicker than encoding byte by byte. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * JSON inside a <script> ends at the first `</script`, so a concept that
 * mentions one could break out. Escaping every `<` rules that out entirely.
 */
function serializeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportFileName(boardName: string, iso: string): string {
  const slug =
    boardName
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "board";
  return `${slug}-${iso.slice(0, 10)}.html`;
}
