import type { Metadata } from "next";
import { ProjectsBrowser } from "@/components/projects-browser";

export const metadata: Metadata = {
  title: "Projects · Brain Board",
  description: "The boards in your workspace.",
};

export default function Page() {
  return <ProjectsBrowser />;
}
