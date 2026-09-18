/**
 * People: the signed-in viewer, and the members of their organization.
 *
 * One organization per account, decided once when the account is placed —
 * either by creating an organization (which makes you its admin) or by
 * accepting an invitation to one (which makes you a user).
 */

/**
 * `user` creates and edits their own boards. `admin` manages the organization's
 * members and can read every board in it, but cannot write to any board — that
 * boundary is enforced by RLS, not just by what the UI offers.
 */
export type Role = "user" | "admin";

/** The signed-in account, resolved server-side on every request. */
export type Viewer = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** `null` until the account joins or creates an organization. */
  orgId: string | null;
  orgName: string | null;
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
