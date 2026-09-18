"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button, inputClass, SectionLabel, Segmented } from "./ui";

type Mode = "signin" | "signup";
/** How a new account joins a workspace, which is what decides its role. */
type Join = "invite" | "create";

/**
 * Sign in / create account. Nothing is submitted anywhere yet: the form is
 * drawn and shallowly validated, then drops you on the projects screen so the
 * flow can be walked end to end.
 */
export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [join, setJoin] = useState<Join>("invite");
  const [showPassword, setShowPassword] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspace, setWorkspace] = useState("");

  const signup = mode === "signup";
  const filled =
    email.trim() !== "" &&
    password !== "" &&
    (!signup || (name.trim() !== "" && workspace.trim() !== ""));

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-md border border-border-subtle bg-surface-raised p-7">
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
          onChange={setMode}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Create account" },
          ]}
        />

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            router.push("/projects");
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
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>Password</SectionLabel>
              {!signup && (
                <a
                  href="#"
                  className="text-[11px] text-ink-faint underline underline-offset-2 hover:text-accent"
                >
                  Forgot password?
                </a>
              )}
            </div>
            {/* Reveal toggle sits inside the field's right inset rather than
                beside it, so the input keeps the full column width. */}
            <div className="relative">
              <input
                className={`${inputClass} pr-8`}
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={signup ? "At least 12 characters" : "•".repeat(10)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink-faint hover:text-ink"
              >
                {showPassword ? (
                  <EyeOff size={13} strokeWidth={1.75} aria-hidden />
                ) : (
                  <Eye size={13} strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </div>
          </div>

          {/* Which workspace you land in is also what sets your role, so the
              two decisions are made in one place. */}
          {signup && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <SectionLabel>Workspace</SectionLabel>
              <Segmented
                className="w-full"
                label="How to join a workspace"
                value={join}
                onChange={(next) => {
                  setJoin(next);
                  setWorkspace("");
                }}
                options={[
                  {
                    value: "invite",
                    label: (
                      <>
                        <KeyRound size={11} strokeWidth={1.75} aria-hidden />
                        Join with a code
                      </>
                    ),
                  },
                  {
                    value: "create",
                    label: (
                      <>
                        <Building2 size={11} strokeWidth={1.75} aria-hidden />
                        Start a new one
                      </>
                    ),
                  },
                ]}
              />
              <input
                /* Keyed by mode so switching clears the field's own state
                   along with the value. */
                key={join}
                className={`${inputClass}${join === "invite" ? " font-mono uppercase" : ""}`}
                spellCheck={false}
                placeholder={join === "invite" ? "BB-4K7Q-2XRD" : "Sloan Ventures"}
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
              />
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {join === "invite"
                  ? "You join as a user: your boards stay yours, and the workspace admin can open them."
                  : "You become the admin of the new workspace — you manage who joins, and can open every board in it."}
              </p>
            </div>
          )}

          <Button type="submit" variant="primary" className="w-full" disabled={!filled}>
            {signup ? "Create account" : "Sign in"}
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
      </div>

      <p className="mt-4 text-[11px] text-ink-faint">
        Visual preview {"—"} sign-in isn&apos;t connected to a server yet.
      </p>
    </div>
  );
}
