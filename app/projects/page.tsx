import type { Metadata } from "next";
import { ProjectsBrowser } from "@/components/projects-browser";
import { requirePlacedViewer } from "@/lib/auth";
import { listBoards, listMembers, listPendingInvites } from "@/lib/boards";

export const metadata: Metadata = {
  title: "Projects · Brain Board",
  description: "The boards in your workspace.",
};

export default async function Page() {
  const viewer = await requirePlacedViewer();
  const admin = viewer.role === "admin";

  // What comes back is already scoped by RLS: a user's own boards, or every
  // board in the organization for an admin. The member rail and invite list
  // are admin-only, so they aren't fetched for anyone else.
  const [boards, members, invites] = await Promise.all([
    listBoards(),
    admin ? listMembers(viewer) : Promise.resolve([]),
    admin ? listPendingInvites() : Promise.resolve([]),
  ]);

  return (
    <ProjectsBrowser
      viewer={viewer}
      boards={boards}
      members={members}
      invites={invites}
    />
  );
}
