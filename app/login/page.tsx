import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Sign in · Brain Board",
  description: "Sign in to Brain Board, or create an account.",
};

export default function Page() {
  return <AuthForm />;
}
