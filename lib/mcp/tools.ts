import "server-only";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getBoard, listBoards } from "@/lib/boards";
import { cleanLinks, nextSortOrder } from "@/lib/concept-writes";
import { toLinks, toTags } from "@/lib/mapping";
import { createTokenClient, type TokenClient } from "@/lib/supabase/token";
import type { ConceptLink } from "@/lib/types";
import { formatSize, renderBoard, renderBoardList, renderConcept } from "./render";

/**
 * The tools an agent gets. Each one runs as the user whose token came with the
 * request, so what it can see and change is whatever RLS allows that user —
 * an admin's write tools fail at the database exactly as the board UI's would.
 *
 * Deliberately absent: deleting anything, creating boards, uploading files.
 * Those stay in the UI, so the worst a confused agent can do is add or reword.
 */

export const SERVER_INSTRUCTIONS = `Brain Board organizes a field into boards: each board is an outline (tree) of concepts.
A concept has a name, a markdown description, links (label + URL), attached files, and optionally one of the board's tags.

Start with list_boards, then get_board for the whole outline. Ids are shown inline as "(id: …)"; tools take those ids.

Cross-references between concepts are ordinary markdown links in a description whose target is "#concept:<id>",
written as [@Concept name](#concept:<id>). The board draws these as arrows. Use exactly that form to link concepts.

Write tools add and edit; nothing can be deleted through this server. Admin accounts are read-only.
Someone with the board already open has to refresh the page to see changes made here.`;

const BUCKET = "board-files";
/** Larger text attachments aren't worth an agent's context window. */
const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILE_CHARS = 100_000;
const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "htm",
]);

/** A failure worth showing the agent as-is, rather than a stack trace. */
class ToolError extends Error {}

const READ_ONLY_HINT =
  "This account can't edit that board — admins are read-only, and users can only edit their own boards.";

function fail(message: string, error?: { message: string } | null): never {
  throw new ToolError(error?.message ? `${message}: ${error.message}` : message);
}

/**
 * Wraps a tool body: builds the caller's Supabase client from the verified
 * token, and turns any failure into an `isError` result the agent can act on.
 */
async function run(
  ctx: ServerContext,
  body: (supabase: TokenClient) => Promise<string>,
): Promise<CallToolResult> {
  const token = ctx.http?.authInfo?.token;
  if (!token) {
    return { isError: true, content: [{ type: "text", text: "Not signed in." }] };
  }

  try {
    const text = await body(createTokenClient(token));
    return { content: [{ type: "text", text }] };
  } catch (error) {
    const text =
      error instanceof ToolError ? error.message : "Something went wrong on the Brain Board side.";
    if (!(error instanceof ToolError)) console.error("MCP tool failed:", error);
    return { isError: true, content: [{ type: "text", text }] };
  }
}

/** A concept's row, or a not-found error. Not found and not permitted look alike under RLS. */
async function readConcept(supabase: TokenClient, conceptId: string) {
  const { data, error } = await supabase
    .from("concepts")
    .select("*")
    .eq("id", conceptId)
    .maybeSingle();
  if (error) fail("Could not read the concept", error);
  if (!data) fail(`No concept with id ${conceptId} is visible to this account.`);
  return data;
}

async function loadBoard(supabase: TokenClient, boardId: string) {
  const loaded = await getBoard(boardId, supabase);
  if (!loaded) fail(`No board with id ${boardId} is visible to this account.`);
  return loaded;
}

/** Tag ids are only meaningful on the board that defines them. */
async function assertTagOnBoard(supabase: TokenClient, boardId: string, tagId: string) {
  const { data } = await supabase.from("boards").select("tags").eq("id", boardId).maybeSingle();
  const tags = toTags(data?.tags);
  if (!tags.some((t) => t.id === tagId)) {
    const known = tags.map((t) => `${t.name} (id: ${t.id})`).join(", ") || "none";
    fail(`Tag ${tagId} isn't defined on this board. Its tags: ${known}.`);
  }
}

/**
 * Writes that return no row were filtered out by RLS — the concept is visible
 * (it was just read) but not writable by this account.
 */
function writeFailed(message: string, error: { code?: string; message: string } | null): never {
  if (!error || error.code === "PGRST116" || error.code === "42501") fail(READ_ONLY_HINT);
  fail(message, error);
}

function isTextFile(name: string, mimeType: string | null): boolean {
  if (mimeType?.startsWith("text/")) return true;
  if (mimeType && /json|xml|yaml|csv|markdown/.test(mimeType)) return true;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

const id = (what: string) => z.guid().describe(`The ${what}'s id, as shown in "(id: …)".`);

const linkInput = z.object({
  url: z.url().describe("Full URL, including https://"),
  label: z.string().optional().describe("Readable title. Defaults to the URL."),
});

const toLinkList = (links: z.infer<typeof linkInput>[]): ConceptLink[] =>
  cleanLinks(links.map((l) => ({ url: l.url, label: l.label ?? "" })));

export function registerTools(server: McpServer) {
  /* ------------------------------------------------------------------ reads */

  server.registerTool(
    "list_boards",
    {
      title: "List boards",
      description:
        "Boards this account can open, newest edit first, with concept and file counts and each board's tags.",
      annotations: { readOnlyHint: true },
    },
    async (ctx) =>
      run(ctx, async (supabase) => renderBoardList(await listBoards(supabase))),
  );

  server.registerTool(
    "get_board",
    {
      title: "Read a board",
      description:
        "A board's full outline as an indented tree, followed by every concept's description, links, files, and cross-references. " +
        "Use this to summarize a board or check it for gaps and inconsistencies. Set includeDescriptions to false for just the tree.",
      inputSchema: z.object({
        boardId: id("board"),
        includeDescriptions: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ boardId, includeDescriptions }, ctx) =>
      run(ctx, async (supabase) => {
        const { board, concepts } = await loadBoard(supabase, boardId);
        return renderBoard(board, concepts, { descriptions: includeDescriptions });
      }),
  );

  server.registerTool(
    "get_concept",
    {
      title: "Read a concept",
      description:
        "One concept in full: where it sits in the tree, its description, links, files, children, and which concepts it references or is referenced by.",
      inputSchema: z.object({ conceptId: id("concept") }),
      annotations: { readOnlyHint: true },
    },
    async ({ conceptId }, ctx) =>
      run(ctx, async (supabase) => {
        const row = await readConcept(supabase, conceptId);
        const { board, concepts } = await loadBoard(supabase, row.board_id);
        const concept = concepts.find((c) => c.id === conceptId);
        if (!concept) fail(`No concept with id ${conceptId} is visible to this account.`);
        return renderConcept(board, concepts, concept);
      }),
  );

  server.registerTool(
    "search_concepts",
    {
      title: "Search concepts",
      description:
        "Case-insensitive text search over concept names and descriptions, on one board or across every board this account can see.",
      inputSchema: z.object({
        query: z.string().trim().min(1),
        boardId: id("board").optional().describe("Limit the search to one board."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, boardId }, ctx) =>
      run(ctx, async (supabase) => {
        let request = supabase.from("concepts").select("id, board_id, name, description");
        if (boardId) request = request.eq("board_id", boardId);
        const [{ data, error }, { data: boards }] = await Promise.all([
          request,
          supabase.from("boards").select("id, name"),
        ]);
        if (error) fail("Could not search", error);

        const needle = query.toLowerCase();
        const boardName = new Map((boards ?? []).map((b) => [b.id, b.name]));
        const hits = (data ?? []).filter(
          (c) =>
            c.name.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle),
        );
        if (hits.length === 0) return `No concepts match "${query}".`;

        const shown = hits.slice(0, 50).map((c) => {
          const at = c.description.toLowerCase().indexOf(needle);
          const snippet =
            at < 0
              ? ""
              : `\n  …${c.description.slice(Math.max(0, at - 80), at + needle.length + 80).replace(/\s+/g, " ")}…`;
          return `- ${c.name} (id: ${c.id}) on ${boardName.get(c.board_id) ?? "a board"}${snippet}`;
        });
        const more = hits.length > 50 ? `\n\n…and ${hits.length - 50} more. Narrow the query.` : "";
        return shown.join("\n") + more;
      }),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read an attached file",
      description: `The contents of a text attachment (markdown, plain text, CSV, JSON, YAML, XML, HTML) up to ${formatSize(MAX_FILE_BYTES)}. Other file types return their details only.`,
      inputSchema: z.object({ fileId: id("file") }),
      annotations: { readOnlyHint: true },
    },
    async ({ fileId }, ctx) =>
      run(ctx, async (supabase) => {
        const { data: file, error } = await supabase
          .from("concept_files")
          .select("*")
          .eq("id", fileId)
          .maybeSingle();
        if (error) fail("Could not read the file", error);
        if (!file) fail(`No file with id ${fileId} is visible to this account.`);

        const about = `${file.label} (${file.mime_type ?? "unknown type"}, ${formatSize(Number(file.size))})`;
        if (!isTextFile(file.name, file.mime_type)) {
          return `${about} isn't a text file, so its contents can't be read here. Ask the user to open it on the board.`;
        }
        if (Number(file.size) > MAX_FILE_BYTES) {
          return `${about} is larger than ${formatSize(MAX_FILE_BYTES)}, too large to read here.`;
        }

        const { data: blob, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(file.storage_path);
        if (downloadError || !blob) fail("Could not download the file", downloadError);

        const text = await blob.text();
        return text.length > MAX_FILE_CHARS
          ? `${about}, first ${MAX_FILE_CHARS} characters:\n\n${text.slice(0, MAX_FILE_CHARS)}`
          : `${about}:\n\n${text}`;
      }),
  );

  /* ----------------------------------------------------------------- writes */

  server.registerTool(
    "create_concept",
    {
      title: "Create a concept",
      description:
        "Adds a concept to a board, after any existing siblings. Leave parentId out for a top-level concept. " +
        "The description is markdown; reference other concepts as [@Name](#concept:<id>).",
      inputSchema: z.object({
        boardId: id("board"),
        parentId: id("parent concept").optional(),
        name: z.string().trim().min(1).max(200),
        description: z.string().default(""),
        links: z.array(linkInput).default([]),
        tagId: z.string().min(1).optional().describe("One of the board's tag ids."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ boardId, parentId, name, description, links, tagId }, ctx) =>
      run(ctx, async (supabase) => {
        let parentName = "the top level";
        if (parentId) {
          const parent = await readConcept(supabase, parentId);
          if (parent.board_id !== boardId) fail("That parent concept is on a different board.");
          parentName = `${parent.name} (id: ${parent.id})`;
        }
        if (tagId) await assertTagOnBoard(supabase, boardId, tagId);

        const { data, error } = await supabase
          .from("concepts")
          .insert({
            board_id: boardId,
            parent_id: parentId ?? null,
            name,
            description,
            links: toLinkList(links),
            tag_id: tagId ?? null,
            sort_order: await nextSortOrder(supabase, boardId, parentId ?? null),
          })
          .select("id, name")
          .single();
        if (error || !data) writeFailed("Could not create the concept", error);

        return `Created ${data.name} (id: ${data.id}) under ${parentName}.`;
      }),
  );

  server.registerTool(
    "update_concept",
    {
      title: "Edit a concept",
      description:
        "Changes a concept's name, description, tag, or links. Only the fields given are changed. " +
        "description and links replace what's there, so read the concept first and send the full new value. " +
        "To append sources without touching existing ones, use add_links instead. Pass tagId: null to remove the tag.",
      inputSchema: z.object({
        conceptId: id("concept"),
        name: z.string().trim().min(1).max(200).optional(),
        description: z.string().optional(),
        tagId: z.string().min(1).nullable().optional(),
        links: z.array(linkInput).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ conceptId, name, description, tagId, links }, ctx) =>
      run(ctx, async (supabase) => {
        if ([name, description, tagId, links].every((v) => v === undefined)) {
          fail("Nothing to change: pass at least one of name, description, tagId, links.");
        }

        const row = await readConcept(supabase, conceptId);
        if (tagId) await assertTagOnBoard(supabase, row.board_id, tagId);

        const { data, error } = await supabase
          .from("concepts")
          .update({
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(tagId !== undefined ? { tag_id: tagId } : {}),
            ...(links !== undefined ? { links: toLinkList(links) } : {}),
          })
          .eq("id", conceptId)
          .select("id, name")
          .single();
        if (error || !data) writeFailed("Could not save the concept", error);

        const changed = Object.entries({ name, description, tagId, links })
          .filter(([, v]) => v !== undefined)
          .map(([k]) => k);
        return `Updated ${changed.join(", ")} on ${data.name} (id: ${data.id}).`;
      }),
  );

  server.registerTool(
    "add_links",
    {
      title: "Add links to a concept",
      description:
        "Appends links (sources, references, further reading) to a concept, skipping any URL it already has. Existing links are kept.",
      inputSchema: z.object({
        conceptId: id("concept"),
        links: z.array(linkInput).min(1),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ conceptId, links }, ctx) =>
      run(ctx, async (supabase) => {
        const row = await readConcept(supabase, conceptId);
        const existing = toLinks(row.links);
        const have = new Set(existing.map((l) => l.url));
        const fresh = toLinkList(links).filter((l) => {
          if (have.has(l.url)) return false;
          have.add(l.url);
          return true;
        });
        if (fresh.length === 0) return `${row.name} already has all of those links.`;

        const { data, error } = await supabase
          .from("concepts")
          .update({ links: [...existing, ...fresh] })
          .eq("id", conceptId)
          .select("id")
          .single();
        if (error || !data) writeFailed("Could not add the links", error);

        const skipped = links.length - fresh.length;
        return (
          `Added ${fresh.length} link${fresh.length === 1 ? "" : "s"} to ${row.name}` +
          (skipped ? ` (${skipped} already there or duplicated).` : ".")
        );
      }),
  );

  server.registerTool(
    "move_concept",
    {
      title: "Move a concept",
      description:
        "Moves a concept (with everything under it) to a new parent, or reorders it among its siblings. " +
        "Leave parentId out to make it top level. index is its 0-based position among the new siblings; leave it out to place it last.",
      inputSchema: z.object({
        conceptId: id("concept"),
        parentId: id("new parent concept").optional(),
        index: z.number().int().min(0).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ conceptId, parentId, index }, ctx) =>
      run(ctx, async (supabase) => {
        const row = await readConcept(supabase, conceptId);
        const { concepts } = await loadBoard(supabase, row.board_id);
        const byId = new Map(concepts.map((c) => [c.id, c]));
        const newParent = parentId ?? null;

        if (newParent) {
          const parent = byId.get(newParent);
          if (!parent) fail("That parent concept isn't on the same board.");
          // Walk up from the new parent: meeting the concept means it would
          // become its own ancestor.
          for (let at: string | null = newParent; at; at = byId.get(at)?.parentId ?? null) {
            if (at === conceptId) fail("A concept can't be moved under itself or its own descendants.");
          }
        }

        const siblings = concepts
          .filter((c) => (c.parentId ?? null) === newParent && c.id !== conceptId)
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
        const position = Math.min(index ?? siblings.length, siblings.length);
        const ordered = [...siblings.slice(0, position), byId.get(conceptId)!, ...siblings.slice(position)];

        // Renumber the whole sibling list so ties from earlier races don't
        // leave the new position ambiguous. Only rows that actually change are written.
        for (const [order, concept] of ordered.entries()) {
          const isMoved = concept.id === conceptId;
          if (!isMoved && concept.order === order) continue;
          const { data, error } = await supabase
            .from("concepts")
            .update(isMoved ? { parent_id: newParent, sort_order: order } : { sort_order: order })
            .eq("id", concept.id)
            .select("id")
            .single();
          if (error || !data) writeFailed("Could not move the concept", error);
        }

        const where = newParent ? `under ${byId.get(newParent)!.name}` : "to the top level";
        return `Moved ${row.name} ${where}, at position ${position}.`;
      }),
  );
}
