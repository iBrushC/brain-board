import { VaultError } from "./vault";

/**
 * Turns a thrown error into a JSON response. `VaultError` carries messages
 * meant for the user (bad path, missing concept); anything else is unexpected,
 * so it gets logged and reported generically.
 */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof VaultError) {
    return Response.json({ error: err.message }, { status: 400 });
  }

  console.error("[brain-board]", err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}

/** Parses a JSON body, treating a malformed one as a user-facing error. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new VaultError("Request body was not valid JSON.");
  }
}
