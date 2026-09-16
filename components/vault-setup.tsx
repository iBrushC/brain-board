"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, inputClass, SectionLabel } from "./ui";

/**
 * First-run screen. The app writes to a plain folder on disk, so all it needs
 * is an absolute path; it creates the folder (and its concepts/ and files/
 * subfolders) if they aren't there yet.
 */
export function VaultSetup({ onReady }: { onReady: (path: string) => void }) {
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const vault = await api.setVault(path);
      if (vault.path) onReady(vault.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that folder.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-lg border border-border-subtle bg-surface-raised p-7">
        <h1 className="text-sm font-semibold tracking-tight">Brain Board</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          Choose a folder to keep this board in. Each concept is stored as a markdown
          file, so the board stays readable and portable outside this app.
        </p>

        <form
          className="mt-6 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <SectionLabel>Data folder</SectionLabel>
          <input
            autoFocus
            className={`${inputClass} font-mono`}
            placeholder="C:\Users\you\Documents\brain-board"
            spellCheck={false}
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <p className="text-[11px] text-ink-faint">
            An absolute path. Created for you if it doesn&apos;t exist; an existing
            board in that folder is loaded as-is.
          </p>

          {error && (
            <p className="border border-border-subtle bg-surface px-2 py-1.5 text-[11px] text-danger">
              {error}
            </p>
          )}

          <div className="pt-2">
            <Button type="submit" variant="primary" disabled={busy || !path.trim()}>
              {busy ? "Opening\u2026" : "Open board"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
