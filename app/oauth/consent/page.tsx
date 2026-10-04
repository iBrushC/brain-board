import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { decideAuthorization } from "./actions";

export const metadata: Metadata = {
  title: "Connect an agent · Brain Board",
  description: "Allow an AI agent to read and edit your boards.",
};

/**
 * Supabase's OAuth server sends the browser here (the authorization path set
 * in the dashboard) when an MCP client such as Claude asks to connect. The
 * visitor signs in if they aren't already, sees who is asking, and decides.
 */
export default async function Page({ searchParams }: PageProps<"/oauth/consent">) {
  const params = await searchParams;
  const authorizationId =
    typeof params.authorization_id === "string" ? params.authorization_id : null;
  const decisionError = typeof params.error === "string" ? params.error : null;

  if (!authorizationId) {
    return <Notice title="Nothing to approve">This link is missing its authorization request.</Notice>;
  }

  const viewer = await getViewer();
  if (!viewer) {
    const back = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !data) {
    return (
      <Notice title="This request has expired">
        Start connecting again from your AI client. {error?.message ? `(${error.message})` : ""}
      </Notice>
    );
  }

  // Already approved for these scopes earlier: no need to ask twice.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const client = data.client;
  const host = hostOf(client.uri);
  const readOnly = viewer.role === "admin";

  return (
    <Shell>
      <h1 className="text-sm font-semibold tracking-tight">
        Connect {client.name || "an AI agent"} to Brain Board
      </h1>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        Signed in as <span className="font-medium text-ink">{data.user.email}</span>.
        {host && (
          <>
            {" "}The request comes from <span className="font-medium text-ink">{host}</span>.
          </>
        )}
      </p>

      <div className="mt-5 space-y-2 border-t border-border-subtle pt-4 text-xs leading-relaxed text-ink-muted">
        <p>If you allow it, the agent can, acting as you:</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>read every board you can open, including attached text files</li>
          {readOnly ? (
            <li>nothing more — your account is an admin, which is read-only</li>
          ) : (
            <li>add concepts, edit names, descriptions, tags and links, and move concepts</li>
          )}
        </ul>
        <p className="text-[11px] text-ink-faint">
          It can&apos;t delete anything, create boards, or upload files.
        </p>
      </div>

      {decisionError && (
        <p className="mt-4 border border-border-subtle bg-surface px-2 py-1.5 text-[11px] leading-relaxed text-danger">
          {decisionError}
        </p>
      )}

      <form action={decideAuthorization} className="mt-5 flex justify-end gap-2">
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <Button type="submit" name="decision" value="deny">
          Deny
        </Button>
        <Button type="submit" name="decision" value="approve" variant="primary">
          Allow access
        </Button>
      </form>
    </Shell>
  );
}

/** Client metadata is self-reported at registration, so the URI may be junk. */
function hostOf(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{children}</p>
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
