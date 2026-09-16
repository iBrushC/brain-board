import { toErrorResponse } from "@/lib/api";
import { attachFiles } from "@/lib/store";
import { VaultError } from "@/lib/vault";

/**
 * Uploads one or more attachments, copying each into the vault. This is a Route
 * Handler rather than a Server Action specifically to sidestep the 1MB action
 * body cap, which papers and datasets blow past routinely.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/concepts/[id]/files">) {
  try {
    const { id } = await ctx.params;

    const form = await request.formData().catch(() => {
      throw new VaultError("Expected a multipart upload.");
    });

    const uploads = await Promise.all(
      form
        .getAll("files")
        .filter((entry): entry is File => entry instanceof File)
        .map(async (file) => ({
          name: file.name,
          bytes: Buffer.from(await file.arrayBuffer()),
        })),
    );

    if (uploads.length === 0) throw new VaultError("No files were included.");

    return Response.json({ concept: await attachFiles(id, uploads) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
