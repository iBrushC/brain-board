import type { Concept, ConceptPatch, VaultInfo } from "./types";

/**
 * Thin fetch wrapper that surfaces the API's `error` field as a thrown Error,
 * so callers can just try/catch instead of checking status codes.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  getVault: () => request<VaultInfo>("/api/vault"),

  setVault: (path: string) =>
    request<VaultInfo>("/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    }),

  listConcepts: () =>
    request<{ concepts: Concept[]; vaultPath: string | null }>("/api/concepts"),

  createConcept: (name: string, parentId: string | null) =>
    request<{ concept: Concept }>("/api/concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    }).then((r) => r.concept),

  updateConcept: (id: string, patch: ConceptPatch) =>
    request<{ concept: Concept }>(`/api/concepts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => r.concept),

  deleteConcept: (id: string) =>
    request<{ deleted: string[] }>(`/api/concepts/${id}`, { method: "DELETE" }).then(
      (r) => r.deleted,
    ),

  uploadFiles: (id: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    return request<{ concept: Concept }>(`/api/concepts/${id}/files`, {
      method: "POST",
      body: form,
    }).then((r) => r.concept);
  },

  deleteFile: (id: string, name: string) =>
    request<{ concept: Concept }>(
      `/api/concepts/${id}/files/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ).then((r) => r.concept),

  fileUrl: (id: string, name: string) =>
    `/api/concepts/${id}/files/${encodeURIComponent(name)}`,
};
