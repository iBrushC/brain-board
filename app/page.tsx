import { redirect } from "next/navigation";

/** The board list is the real home; a board is opened from there. */
export default function Page() {
  redirect("/projects");
}
