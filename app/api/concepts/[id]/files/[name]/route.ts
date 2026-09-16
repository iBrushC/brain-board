import { toErrorResponse } from "@/lib/api";
import { detachFile, readAttachment } from "@/lib/store";

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
        "Content-Type": "application/octet-stream",
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
