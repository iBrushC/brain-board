import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PlacedViewer, Viewer } from "./accounts";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, role, org_id, organizations(name)")
    .eq("id", user.id)
    .maybeSingle();

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
    };
  }

  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    orgId: profile.org_id,
    orgName: profile.organizations?.name ?? null,
  };
}

/** A signed-in viewer, or a redirect to the sign-in screen. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/**
 * A viewer that belongs to an organization. Everything past sign-in needs one,
 * since boards hang off the org, so an unplaced account is sent to /welcome to
 * pick a side of that fork.
 */
export async function requirePlacedViewer(): Promise<PlacedViewer> {
  const viewer = await requireViewer();
  if (!viewer.orgId) redirect("/welcome");
  return viewer as PlacedViewer;
}
