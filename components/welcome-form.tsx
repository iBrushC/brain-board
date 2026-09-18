"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Building2, KeyRound, LogOut } from "lucide-react";
import { acceptInvitation, createOrganization, signOut } from "@/app/actions";
import { Button, inputClass, SectionLabel, Segmented } from "./ui";

type Join = "invite" | "create";

/**
 * The fork every new account passes through once: join the workspace that
 * invited you, or start your own. It's the same decision that sets your role,
 * so the two are made in one place — and only once, since the database refuses
 * to move an account that already belongs somewhere.
 */
export function WelcomeForm({ email, name }: { email: string; name: string }) {
  const [join, setJoin] = useState<Join>("invite");
  const [workspace, setWorkspace] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    start(async () => {
      if (join === "create") {
        const form = new FormData();
        form.set("name", workspace);
        const result = await createOrganization(form);
        if (result?.error) setError(result.error);
      } else {
        const result = await acceptInvitation();
        if (result?.error) setError(result.error);
      }
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-md border border-border-subtle bg-surface-raised p-7">
        <h1 className="text-sm font-semibold tracking-tight">
          Welcome{name ? `, ${name.split(/\s+/)[0]}` : ""}
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          One more step: every board lives in a workspace, so pick yours.
        </p>

        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <SectionLabel>Workspace</SectionLabel>
          <Segmented
            className="w-full"
            label="How to join a workspace"
            value={join}
            onChange={(next) => {
              setJoin(next);
              setWorkspace("");
              setError(null);
            }}
            options={[
              {
                value: "invite",
                label: (
                  <>
                    <KeyRound size={11} strokeWidth={1.75} aria-hidden />
                    Accept an invite
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

          {join === "create" ? (
            <input
              autoFocus
              className={inputClass}
              placeholder="Sloan Ventures"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
            />
          ) : (
            <p className="border border-border-subtle bg-surface px-2.5 py-2 text-[11px] leading-relaxed text-ink-muted">
              Invitations are sent to an email address, not handed out as codes.
              If an admin invited <span className="font-medium text-ink">{email}</span>,
              accepting below puts you in their workspace.
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-ink-faint">
            {join === "invite"
              ? "You join as a user: your boards stay yours, and the workspace admin can read them."
              : "You become the admin of the new workspace — you manage who joins and can read every board in it, but admins don't edit boards."}
          </p>

          {error && (
            <p className="border border-border-subtle bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-danger">
              {error}
            </p>
          )}

          <div className="pt-1">
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={pending || (join === "create" && workspace.trim() === "")}
            >
              {pending
                ? "Working…"
                : join === "create"
                  ? "Create workspace"
                  : "Accept invitation"}
              <ArrowRight size={12} strokeWidth={2} aria-hidden />
            </Button>
          </div>
        </form>

        <div className="mt-5 border-t border-border-subtle pt-4">
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              <LogOut size={12} strokeWidth={2} aria-hidden />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
