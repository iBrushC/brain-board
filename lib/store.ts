import { promises as fs } from "node:fs";
import path from "node:path";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import type { Concept, ConceptFile, ConceptLink, ConceptPatch } from "./types";
import {
  assertSafeId,
  conceptsDir,
  filesDir,
  newId,
  requireVaultPath,
  sanitizeFileName,
  VaultError,
} from "./vault";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function serialize(concept: Concept): string {
  const { description, ...meta } = concept;
  const front = dumpYaml(meta, { lineWidth: 100, noRefs: true });
  return `---\n${front}---\n\n${description.trimStart()}`;
}

function parse(raw: string, fallbackId: string): Concept | null {
  const match = FRONTMATTER.exec(raw);
  if (!match) return null;

  let meta: Record<string, unknown>;
  try {
    meta = (loadYaml(match[1]) ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }

  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const now = new Date().toISOString();

  return {
    id: str(meta.id, fallbackId),
    name: str(meta.name, "Untitled"),
    // Mirrors the trimStart in `serialize`, so a description doesn't pick up a
    // phantom leading blank line every time it round-trips through disk.
    description: (match[2] ?? "").trimStart(),
    parentId: typeof meta.parentId === "string" ? meta.parentId : null,
    order: typeof meta.order === "number" ? meta.order : 0,
    links: Array.isArray(meta.links)
      ? (meta.links as ConceptLink[])
          .filter((l) => l && typeof l.url === "string")
          .map((l) => ({ label: str(l.label, l.url), url: l.url }))
      : [],
    files: Array.isArray(meta.files)
      ? (meta.files as ConceptFile[])
          .filter((f) => f && typeof f.name === "string")
          .map((f) => ({
            name: f.name,
            label: str(f.label, f.name),
            size: typeof f.size === "number" ? f.size : 0,
            addedAt: str(f.addedAt, now),
          }))
      : [],
    createdAt: str(meta.createdAt, now),
    updatedAt: str(meta.updatedAt, now),
  };
}

async function conceptPath(id: string): Promise<string> {
  const vault = await requireVaultPath();
  return path.join(conceptsDir(vault), `${assertSafeId(id)}.md`);
}

export async function readAllConcepts(): Promise<Concept[]> {
  const vault = await requireVaultPath();
  const dir = conceptsDir(vault);

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const concepts = await Promise.all(
    entries
      .filter((name) => name.endsWith(".md"))
      .map(async (name) => {
        const raw = await fs.readFile(path.join(dir, name), "utf8").catch(() => null);
        return raw === null ? null : parse(raw, name.replace(/\.md$/, ""));
      }),
  );

  return concepts.filter((c): c is Concept => c !== null);
}

export async function readConcept(id: string): Promise<Concept> {
  const file = await conceptPath(id);
  const raw = await fs.readFile(file, "utf8").catch(() => null);
  if (raw === null) throw new VaultError(`Concept ${id} not found.`);
  const parsed = parse(raw, id);
  if (!parsed) throw new VaultError(`Concept ${id} is malformed.`);
  return parsed;
}

async function writeConcept(concept: Concept): Promise<Concept> {
  const file = await conceptPath(concept.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, serialize(concept), "utf8");
  return concept;
}

export async function createConcept(input: {
  name?: string;
  parentId?: string | null;
}): Promise<Concept> {
  const parentId = input.parentId ?? null;
  if (parentId) {
    // Fails if the parent is gone, rather than silently orphaning the node.
    await readConcept(parentId);
  }

  const siblings = (await readAllConcepts()).filter((c) => c.parentId === parentId);
  const now = new Date().toISOString();

  return writeConcept({
    id: newId(),
    name: input.name?.trim() || "New concept",
    description: "",
    parentId,
    order: siblings.reduce((max, c) => Math.max(max, c.order), -1) + 1,
    links: [],
    files: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateConcept(id: string, patch: ConceptPatch): Promise<Concept> {
  const current = await readConcept(id);

  if (patch.parentId !== undefined && patch.parentId !== current.parentId) {
    if (patch.parentId === id) throw new VaultError("A concept cannot be its own parent.");
    if (patch.parentId !== null) {
      const all = await readAllConcepts();
      if (descendantIds(all, id).has(patch.parentId)) {
        throw new VaultError("Cannot move a concept beneath one of its own children.");
      }
    }
  }

  return writeConcept({
    ...current,
    name: patch.name?.trim() || current.name,
    description: patch.description ?? current.description,
    parentId: patch.parentId !== undefined ? patch.parentId : current.parentId,
    order: patch.order ?? current.order,
    links: patch.links
      ? patch.links
          .filter((l) => l.url.trim())
          .map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() }))
      : current.links,
    updatedAt: new Date().toISOString(),
  });
}

/** Every id beneath `rootId`, exclusive of `rootId` itself. */
function descendantIds(all: Concept[], rootId: string): Set<string> {
  const byParent = new Map<string | null, Concept[]>();
  for (const c of all) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  const found = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    for (const child of byParent.get(queue.pop()!) ?? []) {
      if (found.has(child.id)) continue;
      found.add(child.id);
      queue.push(child.id);
    }
  }
  return found;
}

/** Deletes a concept, everything beneath it, and all of their attachments. */
export async function deleteConcept(id: string): Promise<string[]> {
  const vault = await requireVaultPath();
  const all = await readAllConcepts();
  const doomed = [id, ...descendantIds(all, id)];

  await Promise.all(
    doomed.map(async (victim) => {
      const safe = assertSafeId(victim);
      await fs.rm(path.join(conceptsDir(vault), `${safe}.md`), { force: true });
      await fs.rm(path.join(filesDir(vault), safe), { recursive: true, force: true });
    }),
  );

  return doomed;
}

export async function attachFiles(
  id: string,
  uploads: { name: string; bytes: Buffer }[],
): Promise<Concept> {
  const concept = await readConcept(id);
  const vault = await requireVaultPath();
  const dir = path.join(filesDir(vault), assertSafeId(id));
  await fs.mkdir(dir, { recursive: true });

  const taken = new Set(concept.files.map((f) => f.name));
  const added: ConceptFile[] = [];

  for (const upload of uploads) {
    const name = uniqueName(sanitizeFileName(upload.name), taken);
    taken.add(name);
    // The vault is an absolute path the user picks at runtime, so Turbopack
    // can't scope this statically. Opting out keeps it from tracing the whole
    // project into the server bundle.
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ dir, name), upload.bytes);
    added.push({
      name,
      label: path.basename(upload.name),
      size: upload.bytes.byteLength,
      addedAt: new Date().toISOString(),
    });
  }

  return writeConcept({
    ...concept,
    files: [...concept.files, ...added],
    updatedAt: new Date().toISOString(),
  });
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function detachFile(id: string, fileName: string): Promise<Concept> {
  const concept = await readConcept(id);
  const vault = await requireVaultPath();
  const safeName = sanitizeFileName(fileName);

  await fs.rm(path.join(filesDir(vault), assertSafeId(id), safeName), { force: true });

  return writeConcept({
    ...concept,
    files: concept.files.filter((f) => f.name !== safeName),
    updatedAt: new Date().toISOString(),
  });
}

export async function readAttachment(
  id: string,
  fileName: string,
): Promise<{ bytes: Buffer; label: string }> {
  const concept = await readConcept(id);
  const safeName = sanitizeFileName(fileName);

  // Only serve files the concept actually claims, so the route can't be used to
  // read arbitrary names out of the vault.
  const record = concept.files.find((f) => f.name === safeName);
  if (!record) throw new VaultError(`No attachment named ${fileName}.`);

  const vault = await requireVaultPath();
  const bytes = await fs.readFile(path.join(filesDir(vault), assertSafeId(id), safeName));
  return { bytes, label: record.label };
}
