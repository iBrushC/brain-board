import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PlacedViewer, Viewer } from "./accounts";

/**
 * The columns every viewer is built from.
 *
 * The embed names its foreign key: `organizations` points back at `profiles`
 * through `owner_id`, so an unqualified `organizations(...)` is ambiguous and
 * PostgREST refuses it. This one is the workspace the profile belongs to.
 */
const VIEWER_COLUMNS =
  "id, name, email, role, org_id, organizations!profiles_org_id_fkey(name, owner_id)";

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: Viewer["role"];
  org_id: string | null;
  organizations: { name: string; owner_id: string | null } | null;
};

function toViewer(profile: ProfileRow): Viewer {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    orgId: profile.org_id,
    orgName: profile.organizations?.name ?? null,
    ownsWorkspace: profile.organizations?.owner_id === profile.id,
  };
}

/**
 * Who is asking. Verified against the auth server rather than read from the
 * cookie, so this is safe to gate on; the proxy's check is only optimistic.
 *
 * Returns `null` when signed out, so callers decide whether that's an error.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(VIEWER_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  // A failed read is not an unplaced account, and quietly treating it as one
  // sends the caller off to place an account that may already be placed.
  if (error) throw new Error(`Could not read your profile: ${error.message}`);

  // The profile is created by a trigger on auth.users, so a missing row means
  // the account is mid-creation rather than broken. Treat it as unplaced.
  if (!profile) {
    return {
      id: user.id,
      name: "",
      email: user.email ?? "",
      role: "user",
      orgId: null,
      orgName: null,
      ownsWorkspace: false,
    };
  }

  return toViewer(profile);
}

/** A signed-in viewer, or a redirect to the sign-in screen. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/**
 * A viewer that belongs to an organization. Everything past sign-in needs one,
 * since boards hang off the org — so rather than stopping a new account at a
 * fork it can't answer yet, placement happens here: `ensure_placement` puts the
 * account in the workspace that invited it, or in one of its own.
 *
 * The call is idempotent and only reached while `orgId` is null, which is the
 * first request after signing up and nothing after that.
 */
export async function requirePlacedViewer(): Promise<PlacedViewer> {
  const viewer = await requireViewer();
  if (viewer.orgId) return viewer as PlacedViewer;

  const supabase = await createClient();
  const { error } = await supabase.rpc("ensure_placement");
  if (error) throw new Error(`Could not set up your workspace: ${error.message}`);

  // Re-read rather than trust the RPC's row: it returns the profile alone, and
  // a viewer also carries the organization's name and who owns it.
  const placed = await getViewer();
  if (!placed?.orgId) throw new Error("Could not set up your workspace.");
  return placed as PlacedViewer;
}
