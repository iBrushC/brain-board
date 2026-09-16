import { readJson, toErrorResponse } from "@/lib/api";
import { deleteConcept, readConcept, updateConcept } from "@/lib/store";
import type { ConceptPatch } from "@/lib/types";

export async function GET(_request: Request, ctx: RouteContext<"/api/concepts/[id]">) {
  try {
    const { id } = await ctx.params;
    return Response.json({ concept: await readConcept(id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/concepts/[id]">) {
  try {
    const { id } = await ctx.params;
    const patch = await readJson<ConceptPatch>(request);
    return Response.json({ concept: await updateConcept(id, patch) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Removes the concept and everything beneath it. Returns the ids that went. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/concepts/[id]">) {
  try {
    const { id } = await ctx.params;
    return Response.json({ deleted: await deleteConcept(id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
