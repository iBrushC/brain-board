import { toErrorResponse } from "@/lib/api";
import { detachFile, readAttachment } from "@/lib/store";

const MIME: [RegExp, string][] = [
  [/\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i, "image"],
  [/\.pdf$/i, "application/pdf"],
  [/\.txt$|\.md$|\.csv$|\.log$/i, "text/plain"],
  [/\.(json|xml|yml|yaml|html?|css|js|mjs|ts|py|sh|toml|ini)$/i, "text/plain"],
];

/** Best-effort MIME type, so viewers can embed the file instead of downloading it. */
function mimeFor(name: string): string {
  for (const [pattern, type] of MIME) {
    if (pattern.test(name)) return type;
  }
  return "application/octet-stream";
}

/** Streams an attachment back so the side panel can open or download it. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/concepts/[id]/files/[name]">,
) {
  try {
    const { id, name } = await ctx.params;
    const { bytes, label } = await readAttachment(id, decodeURIComponent(name));

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeFor(label),
        "Content-Length": String(bytes.byteLength),
        // `inline` lets the browser preview PDFs and images in a new tab
        // instead of forcing a download.
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(label)}`,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/concepts/[id]/files/[name]">,
) {
  try {
    const { id, name } = await ctx.params;
    return Response.json({ concept: await detachFile(id, decodeURIComponent(name)) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
