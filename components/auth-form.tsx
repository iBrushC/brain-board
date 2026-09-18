"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, MailCheck, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, inputClass, SectionLabel, Segmented } from "./ui";

type Mode = "signin" | "signup";

/**
 * Passwordless sign-in. Both modes send the same kind of email; they differ
 * only in whether an unrecognized address is allowed to become an account, so
 * signing in with a typo says so instead of quietly creating a second you.
 *
 * Which workspace you land in isn't decided here — that needs an account to
 * attach the decision to, so it happens on /welcome after the first sign-in.
 */
export function AuthForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));

  const signup = mode === "signup";
  const filled = email.trim() !== "" && (!signup || name.trim() !== "");

  const send = async () => {
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const address = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: signup,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        // Read by the trigger that mirrors auth.users into profiles.
        data: signup ? { name: name.trim() } : undefined,
      },
    });

    if (error) {
      setError(
        !signup && /signups not allowed|not found/i.test(error.message)
          ? "No account with that email. Create one instead?"
          : error.message,
      );
    } else {
      setSentTo(address);
    }
    setBusy(false);
  };

  if (sentTo) {
    return (
      <Shell>
        <div className="flex items-center gap-2">
          <MailCheck size={15} strokeWidth={1.75} className="text-accent" aria-hidden />
          <h1 className="text-sm font-semibold tracking-tight">Check your email</h1>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          A sign-in link is on its way to{" "}
          <span className="font-medium text-ink">{sentTo}</span>. Open it on this
          device and you&apos;ll land straight in your boards.
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          The link works once and expires after an hour.
        </p>
        <div className="mt-5 border-t border-border-subtle pt-4">
          <Button
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
          >
            <RotateCcw size={12} strokeWidth={2} aria-hidden />
            Use a different email
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-sm font-semibold tracking-tight">Brain Board</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        {signup
          ? "Create an account to keep your boards in sync across machines."
          : "Sign in to open the boards in your workspace."}
      </p>

      <Segmented
        className="mt-6 w-full"
        label="Sign in or create an account"
        value={mode}
        onChange={(next) => {
          setMode(next);
          setError(null);
        }}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Create account" },
        ]}
      />

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {signup && (
          <div className="space-y-1.5">
            <SectionLabel>Name</SectionLabel>
            <input
              autoFocus
              className={inputClass}
              autoComplete="name"
              placeholder="Avery Nakamura"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <SectionLabel>Email</SectionLabel>
          <input
            autoFocus={!signup}
            className={inputClass}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-[11px] leading-relaxed text-ink-faint">
            No password — we email you a link that signs you in.
          </p>
        </div>

        {error && (
          <p className="border border-border-subtle bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-danger">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" className="w-full" disabled={!filled || busy}>
          {busy ? "Sending…" : signup ? "Create account" : "Email me a link"}
          <ArrowRight size={12} strokeWidth={2} aria-hidden />
        </Button>
      </form>

      <p className="mt-5 border-t border-border-subtle pt-4 text-[11px] leading-relaxed text-ink-faint">
        {signup ? (
          <>
            Creating an account means you accept the{" "}
            <a href="#" className="underline underline-offset-2 hover:text-accent">
              terms
            </a>{" "}
            and the{" "}
            <a href="#" className="underline underline-offset-2 hover:text-accent">
              privacy policy
            </a>
            .
          </>
        ) : (
          <>
            No account yet?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="underline underline-offset-2 hover:text-accent"
            >
              Create one
            </button>
            .
          </>
        )}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-md border border-border-subtle bg-surface-raised p-7">
        {children}
      </div>
    </div>
  );
}
