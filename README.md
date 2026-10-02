# Brain Board

A board for organizing a hierarchical field — medical technology, in the case it
was built for — into an outline of concepts. Each concept holds a markdown
description, links, attached files, and an optional colour, and can branch into
subconcepts.

Boards live in Supabase, scoped to a workspace, so they follow you between
machines. Signing in gives you a workspace of your own straight away; an admin
who reads across it is someone you invite afterwards, if you want one at all.

Made for the Sloan Venture Capital internship.

## Running it

```bash
npm install
npm run dev
```

`.env.local` needs the project's URL and publishable key:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Both are safe in the browser — every table and every stored file is gated by
row-level security, so the key grants nothing on its own.

In the Supabase dashboard, **Authentication → URL Configuration** has to list
`http://localhost:3000/auth/confirm` as a redirect URL (plus the deployed
origin), or the sign-in link will bounce.

## Accounts and workspaces

Sign-in is passwordless: you enter an email, Supabase sends a link, and opening
it signs you in. There is no password to set or reset.

Nothing stands between that and a board. The first page load calls
`ensure_placement`, which puts the account in a workspace named after it — or,
if an invitation was already addressed to that email, in the workspace that sent
it. Either way you arrive as a **user**, with somewhere to put boards.

| | User | Admin |
| --- | --- | --- |
| Own boards | creates, edits, deletes | — |
| Other members' boards | not visible | read-only |
| Members and invitations | — | manages |

You are never made an admin by your own hand; someone invites you as one.

**Admins can't write to boards.** Not "the buttons are hidden": `can_write_board`
in the database refuses any insert, update, or delete from an admin, so the
read-only board view is a reflection of the rule rather than the rule itself.
That also means an admin has no boards of their own and no "New project" button.

### Adding an admin to your work

**Share** in the projects toolbar invites someone by email, as an admin who can
read every board in the workspace or as a user who keeps their own. That control
belongs to the workspace's *owner* — the account it was provisioned for, kept in
`organizations.owner_id` — so being invited into someone else's workspace does
not let you widen who sees it. An admin can invite too, that being the role's
job, and the owner sees and can revoke every pending invitation in their own
workspace.

Invitations are addressed to an email, not handed out as codes. Invite
`someone@company.com`; when that person signs in with that address, placement
puts them in the workspace.

If the invitation arrives *after* they already have a workspace of their own, a
bar on the projects screen offers to take it. Accepting moves the account and
drops the workspace it left — so it only goes through when that workspace is
empty, with no boards and nobody else in it.

## Using the board

| Action | How |
| --- | --- |
| Pan | Drag empty canvas |
| Zoom | Scroll wheel (anchors on the cursor) |
| Re-frame the tree | **Fit** in the header |
| Open a concept | Click its node |
| Rename the board | Edit the title in the header |
| Add a subconcept | **+** on a node, or **Add subconcept** in the panel |
| Add a top-level concept | **Add root concept** in the header |
| Collapse a branch | The chevron under a node; the count beside it is what's hidden |
| Colour a concept | Pick a swatch in the panel, or the crossed circle to clear it |
| Attach files | Drop them on the panel's file area, or click to browse |
| Reference another concept | Type `@` in a description and pick from the list (↑/↓, Enter) |
| Jump to a referenced concept | Click its chip in the description |
| Show or hide reference arrows | **References** in the header |

Subconcepts stack vertically under their parent, so a plain branch reads top to
bottom as one column. A subconcept that has children of its own claims the rest
of that column for them, and the sibling after it starts a fresh column
alongside — so A with subconcepts B and C, where B has a subconcept D, lays out
as the B–D stack with C beside it.

The board keeps itself framed while you build. Once you pan or zoom it leaves
the view alone until you press **Fit**.

A reference is stored in the description as a markdown link to
`#concept:<id>`, so it follows the concept through renames and shows its
current name. With **References** on, each one is drawn as an arrow from the
concept that mentions it to the concept it names. Selecting a node brings its
own arrows forward. An arrow whose end is folded away under a collapsed branch
points at that branch instead, dashed. A reference to a deleted concept stays in
the text, crossed out. The toggle is remembered per board, in this browser.

Edits to the name, description, and links autosave about half a second after you
stop typing; the panel header shows the save state. Deleting a concept also
deletes everything beneath it, along with their attachments, and asks first.

## How data is stored

| Table | Holds |
| --- | --- |
| `organizations` | One workspace, and the account it was provisioned for |
| `profiles` | One row per account, mirrored from `auth.users` by a trigger |
| `organization_invites` | Pending invitations, keyed on email |
| `ensure_placement()` | Puts a new account in a workspace; idempotent |
| `boards` | One board, owned by one profile |
| `concepts` | The tree; `parent_id` defines it, `sort_order` orders siblings |
| `concept_files` | Attachment metadata |

References between concepts have no table of their own: they're read out of the
descriptions (`lib/references.ts`), so the arrows can never disagree with the text.

Attachments themselves go in the private `board-files` bucket under
`<board id>/<concept id>/<file>`; the bucket's policies read that first path
segment to decide who may touch the object. Nothing is publicly addressable, so
opening a file mints a short-lived signed URL.

Deleting a concept cascades to its descendants and their file rows in Postgres.
Stored objects don't cascade, so the app removes those explicitly first.

## Importing an old vault

Earlier versions kept each concept as a markdown file in a folder on disk. To
lift one of those folders into a board:

```bash
SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-vault.mjs \
  --vault "C:\path\to\vault" --owner you@company.com --name "Board name"
```

The account must already exist and hold a workspace, which happens on its first
page load — so sign in and open the app once first. The service role key bypasses row-level security — which is the point,
since the importer writes rows on someone else's behalf — so pass it on the
command line and keep it out of `.env.local`, which the app loads.

## Layout of the code

| Path | Purpose |
| --- | --- |
| `proxy.ts` | Refreshes the session, bounces signed-out traffic to `/login` |
| `lib/supabase/*` | The three clients: browser, server, proxy |
| `lib/auth.ts` | Resolving the signed-in viewer, placing it; the gate every page calls |
| `lib/boards.ts` | Server-side reads for the projects and board screens |
| `lib/client.ts` | Browser-side board, concept, and file writes |
| `lib/mapping.ts` | Postgres rows ↔ the shapes the UI renders |
| `lib/tree.ts` | Flat concept list → forest |
| `lib/layout-tree.ts` | Outline layout: node placement, connector and reference-arrow routing |
| `lib/references.ts` | The `@` reference link format, and the graph read out of descriptions |
| `lib/colors.ts` | The sixteen concept pastels |
| `app/actions.ts` | Server Actions: sign out, invitations |
| `components/board-canvas.tsx` | Pan, zoom, edges, node placement |
| `components/side-panel.tsx` | The editor |

Writes go straight from the browser to Postgres rather than through a route
handler. There's no API layer to enforce anything, because row-level security
already does — a hand-rolled request reaches exactly what the UI could.

## Not in this version

- Reordering or re-parenting concepts by dragging (the data model supports both;
  there is no UI for it yet)
- Setting a board's colour (the column and the tinted folder icons exist; only
  the importer and the database can set it)
- Search across concepts
- Undo
