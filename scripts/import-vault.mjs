#!/usr/bin/env node
/**
 * One-shot importer: a local vault folder -> a board in Supabase.
 *
 * The app used to keep each concept as a markdown file with YAML frontmatter in
 * a folder on disk. This lifts one of those folders into the database so a
 * board built before the move isn't stranded. It is meant to be run once per
 * vault, by hand.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-vault.mjs \
 *     --vault "C:\path\to\vault" --owner you@company.com [--name "Board name"]
 *
 * The service role key bypasses RLS, which is the point: the importer has to
 * write rows owned by someone who isn't signed in here. Pass it on the command
 * line rather than committing it, and don't put it in .env.local — that file is
 * loaded by the app, and this key must never reach the browser.
 */

import { createClient } from "@supabase/supabase-js";
import { load as loadYaml } from "js-yaml";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const BUCKET = "board-files";
const COLORS = new Set([
  "rose", "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "pink",
]);

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Reads NEXT_PUBLIC_SUPABASE_URL out of .env.local so only the key is passed in. */
async function readEnvLocal(key) {
  if (process.env[key]) return process.env[key];
  try {
    const raw = await readFile(path.join(process.cwd(), ".env.local"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    return line?.slice(key.length + 1).trim();
  } catch {
    return undefined;
  }
}

/** Frontmatter + markdown body -> the concept shape the old vault used. */
function parseConcept(raw, fallbackId) {
  const match = FRONTMATTER.exec(raw);
  if (!match) return null;

  let meta;
  try {
    meta = loadYaml(match[1]) ?? {};
  } catch {
    return null;
  }

  const str = (v, fallback = "") => (typeof v === "string" ? v : fallback);

  return {
    id: str(meta.id, fallbackId),
    name: str(meta.name, "Untitled").trim() || "Untitled",
    description: (match[2] ?? "").trimStart(),
    parentId: typeof meta.parentId === "string" ? meta.parentId : null,
    order: typeof meta.order === "number" ? meta.order : 0,
    color: COLORS.has(meta.color) ? meta.color : null,
    links: Array.isArray(meta.links)
      ? meta.links
          .filter((l) => l && typeof l.url === "string")
          .map((l) => ({ label: str(l.label, l.url), url: l.url }))
      : [],
    files: Array.isArray(meta.files)
      ? meta.files
          .filter((f) => f && typeof f.name === "string")
          .map((f) => ({
            name: f.name,
            label: str(f.label, f.name),
            size: typeof f.size === "number" ? f.size : 0,
          }))
      : [],
  };
}

async function readVault(vault) {
  const dir = path.join(vault, "concepts");
  const entries = await readdir(dir).catch(() => die(`No concepts/ folder in ${vault}`));

  const concepts = [];
  for (const entry of entries.filter((n) => n.endsWith(".md"))) {
    const raw = await readFile(path.join(dir, entry), "utf8");
    const parsed = parseConcept(raw, entry.replace(/\.md$/, ""));
    if (parsed) concepts.push(parsed);
    else console.warn(`  ! skipped ${entry} — no readable frontmatter`);
  }
  return concepts;
}

function mimeFor(name) {
  const ext = path.extname(name).toLowerCase();
  return (
    {
      ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
      ".svg": "image/svg+xml", ".md": "text/markdown", ".txt": "text/plain",
      ".csv": "text/csv", ".json": "application/json",
    }[ext] ?? "application/octet-stream"
  );
}

async function main() {
  const vault = arg("--vault");
  const ownerEmail = arg("--owner")?.trim().toLowerCase();
  if (!vault || !ownerEmail) {
    die("Usage: node scripts/import-vault.mjs --vault <path> --owner <email> [--name <board name>]");
  }

  const url = await readEnvLocal("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) die("NEXT_PUBLIC_SUPABASE_URL is not set (checked the environment and .env.local).");
  if (!serviceKey) die("SUPABASE_SERVICE_ROLE_KEY is not set. Pass it on the command line.");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: owner, error: ownerError } = await supabase
    .from("profiles")
    .select("id, name, email, org_id, role")
    .eq("email", ownerEmail)
    .maybeSingle();

  if (ownerError) die(`Could not look up ${ownerEmail}: ${ownerError.message}`);
  if (!owner) die(`No account for ${ownerEmail}. Sign in once with that address first.`);
  if (!owner.org_id) die(`${ownerEmail} hasn't joined a workspace yet — do that first.`);
  if (owner.role === "admin") {
    die(`${ownerEmail} is an admin, and admins can't own boards. Import to a user account.`);
  }

  const concepts = await readVault(vault);
  if (concepts.length === 0) die(`No concepts found in ${vault}.`);

  const boardName = arg("--name")?.trim() || path.basename(path.resolve(vault));
  console.log(`\n  Importing ${concepts.length} concepts into "${boardName}" for ${ownerEmail}…\n`);

  const { data: board, error: boardError } = await supabase
    .from("boards")
    .insert({ name: boardName, org_id: owner.org_id, owner_id: owner.id })
    .select()
    .single();
  if (boardError) die(`Could not create the board: ${boardError.message}`);

  // The vault's ids aren't UUIDs, so every concept gets a new one and parent
  // links are remapped through this table.
  const newId = new Map(concepts.map((c) => [c.id, randomUUID()]));

  // Parents are attached in a second pass: a single multi-row insert would have
  // to order rows so every parent lands before its children, and the vault
  // makes no such promise.
  const { error: insertError } = await supabase.from("concepts").insert(
    concepts.map((c) => ({
      id: newId.get(c.id),
      board_id: board.id,
      parent_id: null,
      name: c.name,
      description: c.description,
      sort_order: c.order,
      color: c.color,
      links: c.links,
    })),
  );
  if (insertError) die(`Could not insert concepts: ${insertError.message}`);

  let reparented = 0;
  let orphaned = 0;
  for (const concept of concepts) {
    if (!concept.parentId) continue;
    const parent = newId.get(concept.parentId);
    if (!parent) {
      // Matches how the board already treats a missing parent: surface it as a
      // root rather than dropping it.
      orphaned += 1;
      continue;
    }
    const { error } = await supabase
      .from("concepts")
      .update({ parent_id: parent })
      .eq("id", newId.get(concept.id));
    if (error) die(`Could not link ${concept.name} to its parent: ${error.message}`);
    reparented += 1;
  }

  let uploaded = 0;
  for (const concept of concepts) {
    for (const file of concept.files) {
      const source = path.join(vault, "files", concept.id, file.name);
      const bytes = await readFile(source).catch(() => null);
      if (!bytes) {
        console.warn(`  ! missing on disk, skipped: ${source}`);
        continue;
      }

      const conceptId = newId.get(concept.id);
      const storagePath = `${board.id}/${conceptId}/${file.name}`;
      const contentType = mimeFor(file.name);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, { contentType, upsert: true });
      if (uploadError) die(`Could not upload ${file.name}: ${uploadError.message}`);

      const { error: rowError } = await supabase.from("concept_files").insert({
        concept_id: conceptId,
        board_id: board.id,
        name: file.name,
        label: file.label,
        size: bytes.byteLength,
        mime_type: contentType,
        storage_path: storagePath,
      });
      if (rowError) die(`Could not record ${file.name}: ${rowError.message}`);

      uploaded += 1;
    }
  }

  console.log(`  Done.`);
  console.log(`    board      ${board.id}`);
  console.log(`    concepts   ${concepts.length} (${reparented} nested${orphaned ? `, ${orphaned} orphaned to root` : ""})`);
  console.log(`    files      ${uploaded}`);
  console.log(`\n  Open it at /board/${board.id}\n`);
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
