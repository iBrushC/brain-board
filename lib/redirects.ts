/**
 * Where to go after signing in, carried as `?next=` from the page that sent
 * the visitor to /login (the OAuth consent screen, say) through the magic link
 * and back. Only ever a path on this origin, so the link can't be aimed elsewhere.
 */
export function safeNext(next: string | null | undefined, fallback = "/projects"): string {
  return next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
