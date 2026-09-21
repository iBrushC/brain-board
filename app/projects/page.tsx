import type { Metadata } from "next";
import { ProjectsBrowser } from "@/components/projects-browser";
import { requirePlacedViewer } from "@/lib/auth";
import {
  getPendingInvitation,
  listBoards,
  listMembers,
  listPendingInvites,
} from "@/lib/boards";

export const metadata: Metadata = {
  title: "Projects · Brain Board",
  description: "The boards in your workspace.",
};

export default async function Page() {
  // Placement happens inside this call on the first request after signing up,
  // so a brand-new account lands here with a workspace and a New project button.
  const viewer = await requirePlacedViewer();

  // What comes back is already scoped by RLS: a user's own boards, or every
  // board in the organization for an admin; the whole workspace's pending
  // invitations for an admin, or just the ones this account sent.
  const [boards, members, invites, invitation] = await Promise.all([
    listBoards(),
    listMembers(viewer),
    listPendingInvites(),
    getPendingInvitation(),
  ]);

  return (
    <ProjectsBrowser
      viewer={viewer}
      boards={boards}
      members={members}
      invites={invites}
      invitation={invitation}
    />
  );
}
