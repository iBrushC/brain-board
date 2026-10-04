import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Invite, Member, PendingInvitation, PlacedViewer } from "./accounts";
import { toBoard, toConcepts } from "./mapping";
import type { Board, BoardSummary, Concept } from "./types";

/**
 * Reads for the server-rendered screens. Every query here runs as the signed-in
 * user, so RLS — not these functions — decides what comes back: a user sees
 * only their own boards, an admin sees every board in the organization.
 *
 * The board reads take an optional client so the MCP endpoint, which signs in
 * with a bearer token instead of a cookie, gets the same queries and shapes.
 */

/**
 * Boards the viewer can open, newest edit first. The counts come from the
 * related tables in the same round trip rather than N follow-up queries.
 */
export async function listBoards(
  client?: SupabaseClient<Database>,
): Promise<BoardSummary[]> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .from("boards")
    .select("*, concepts(count), concept_files(count)")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const { concepts, concept_files, ...board } = row;
    return {
      ...toBoard(board),
      conceptCount: concepts?.[0]?.count ?? 0,
      fileCount: concept_files?.[0]?.count ?? 0,
    };
  });
}

/** One board with its whole concept tree, or `null` if it isn't readable. */
export async function getBoard(
  boardId: string,
  client?: SupabaseClient<Database>,
): Promise<{ board: Board; concepts: Concept[] } | null> {
  const supabase = client ?? (await createClient());

  const { data: boardRow } = await supabase
    .from("boards")
    .select("*")
    .eq("id", boardId)
    .maybeSingle();

  // Not found and not permitted are the same response under RLS, and should
  // stay that way — distinguishing them would leak which board ids exist.
  if (!boardRow) return null;

  const [{ data: conceptRows, error: conceptError }, { data: fileRows, error: fileError }] =
    await Promise.all([
      supabase.from("concepts").select("*").eq("board_id", boardId),
      supabase.from("concept_files").select("*").eq("board_id", boardId),
    ]);

  if (conceptError) throw new Error(conceptError.message);
  if (fileError) throw new Error(fileError.message);

  return {
    board: toBoard(boardRow),
    concepts: toConcepts(conceptRows ?? [], fileRows ?? []),
  };
}

/**
 * Everyone in the viewer's organization. Admins use it to scope the board list;
 * everyone else to see which admins can read over their shoulder.
 */
export async function listMembers(viewer: PlacedViewer): Promise<Member[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .eq("org_id", viewer.orgId)
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Invitations sent but not yet accepted. RLS decides the scope: the whole
 * workspace for an admin, and the ones they sent themselves for anyone else.
 */
export async function listPendingInvites(): Promise<Invite[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_invites")
    .select("id, email, role, created_at")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  }));
}

/**
 * An invitation to a workspace the viewer isn't in yet, if one is waiting.
 *
 * Every account is placed on first sign-in, so an invitation that arrives later
 * has nowhere to land on its own; surfacing it here is what lets the viewer
 * take it. `null` in the ordinary case, which is most of the time.
 */
export async function getPendingInvitation(): Promise<PendingInvitation | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("pending_invitation");
  if (error) return null;

  const invitation = data?.[0];
  if (!invitation) return null;

  return { orgName: invitation.org_name, role: invitation.role };
}
