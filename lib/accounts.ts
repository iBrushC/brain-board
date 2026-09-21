/**
 * People: the signed-in viewer, and the members of their organization.
 *
 * One organization per account, and nobody waits to be given one: signing in
 * places you in a workspace of your own, unless an invitation was already
 * addressed to your email, in which case you land in that one instead.
 */

/**
 * `user` creates and edits their own boards. `admin` manages the organization's
 * members and can read every board in it, but cannot write to any board — that
 * boundary is enforced by RLS, not just by what the UI offers. You are never
 * made an admin by your own hand; someone invites you as one.
 */
export type Role = "user" | "admin";

/** The signed-in account, resolved server-side on every request. */
export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** `null` only in the instant between sign-up and placement. */
  orgId: string | null;
  orgName: string | null;
  /**
   * Whether this workspace was provisioned for the viewer. The owner is the one
   * who may invite into it — an admin they add, or a colleague — which someone
   * invited into a workspace they don't own cannot do.
   */
  ownsWorkspace: boolean;
};

/** A viewer that has been placed in an organization. */
export type PlacedViewer = Viewer & { orgId: string; orgName: string };

/** Another account in the same organization. */
export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** An invitation to a workspace the viewer has not joined. */
export type PendingInvitation = {
  orgName: string;
  role: Role;
};

/** An outstanding invitation to the organization. */
export type Invite = {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
};

/** Two letters for an avatar square. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Fixed formatter, fixed timezone: a relative "2 days ago" would render
 * differently on the server and the client and trip a hydration warning.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Falls back to the email's local part, since `name` is optional at sign-up. */
export function displayName(name: string, email: string): string {
  return name.trim() || email.split("@")[0];
}
