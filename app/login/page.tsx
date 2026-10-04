import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";

export const metadata: Metadata = {
  title: "Sign in · Brain Board",
  description: "Sign in to Brain Board, or create an account.",
};

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // Already signed in: the sign-in screen has nothing to offer.
  if (await getViewer()) redirect(safeNext(typeof next === "string" ? next : null));

  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
