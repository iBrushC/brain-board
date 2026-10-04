import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "./database.types";
import type { Concept, ConceptLink, ConceptPatch } from "./types";

/**
 * The parts of a concept write that don't care who is making it. The board
 * writes from the browser and agents write through the MCP endpoint; both go
 * through here so a concept looks the same whichever of them touched it last.
 */

/** Drops links with no URL and labels the rest with their URL if they have no label. */
export function cleanLinks(links: ConceptLink[]): ConceptLink[] {
  return links
    .filter((l) => l.url.trim())
    .map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() }));
}

/**
 * The `sort_order` that lands a new concept after its current last sibling.
 * A race here costs a tie in `order`, which the tree sort breaks by name
 * rather than surfacing as an error.
 */
export async function nextSortOrder(
  supabase: SupabaseClient<Database>,
  boardId: string,
  parentId: string | null,
): Promise<number> {
  const siblings = supabase
    .from("concepts")
    .select("sort_order")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { data: last } = parentId
    ? await siblings.eq("parent_id", parentId)
    : await siblings.is("parent_id", null);

  return (last?.[0]?.sort_order ?? -1) + 1;
}

/** The row update for a patch. Only fields present in the patch are written. */
export function conceptUpdateRow(
  concept: Pick<Concept, "name">,
  patch: ConceptPatch,
): TablesUpdate<"concepts"> {
  return {
    ...(patch.name !== undefined ? { name: patch.name.trim() || concept.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.parentId !== undefined ? { parent_id: patch.parentId } : {}),
    ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.tagId !== undefined ? { tag_id: patch.tagId } : {}),
    ...(patch.links !== undefined ? { links: cleanLinks(patch.links) } : {}),
  };
}
