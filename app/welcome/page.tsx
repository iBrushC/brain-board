import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeForm } from "@/components/welcome-form";
import { requireViewer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Welcome · Brain Board",
  description: "Join a workspace, or start your own.",
};

export default async function Page() {
  const viewer = await requireViewer();
  // Placement happens once; an account that already has a workspace is done here.
  if (viewer.orgId) redirect("/projects");

  return <WelcomeForm email={viewer.email} name={viewer.name} />;
}
