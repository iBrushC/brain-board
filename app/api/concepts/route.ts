import { readJson, toErrorResponse } from "@/lib/api";
import { createConcept, readAllConcepts } from "@/lib/store";
import { getVaultPath } from "@/lib/vault";

/** The whole board, flat. The client folds it into a tree for rendering. */
export async function GET() {
  try {
    const path = await getVaultPath();
    if (!path) return Response.json({ concepts: [], vaultPath: null });

    return Response.json({ concepts: await readAllConcepts(), vaultPath: path });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ name?: string; parentId?: string | null }>(request);
    const concept = await createConcept({ name: body.name, parentId: body.parentId ?? null });
    return Response.json({ concept }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
