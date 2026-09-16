# Brain Board

A board for organizing a hierarchical field — medical technology, in the case it
was built for — into an outline of concepts. Each concept holds a markdown
description, links, attached files, and an optional colour, and can branch into
subconcepts.

Everything is stored as plain files in a folder you choose, so a board stays
readable, greppable, and version-controllable outside this app.

Made for the Sloan Venture Capital internship.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first run you'll be asked for a data folder —
give it an absolute path (e.g. `C:\Users\you\Documents\brain-board`). It's
created if it doesn't exist, and an existing board there is loaded as-is.

> This app reads and writes your local filesystem through its own server, so
> it's meant to be run locally. Deployed somewhere remote, it would read that
> machine's disk rather than yours.

## Using the board

| Action | How |
| --- | --- |
| Pan | Drag empty canvas |
| Zoom | Scroll wheel (anchors on the cursor) |
| Re-frame the tree | **Fit** in the header |
| Open a concept | Click its node |
| Add a subconcept | **+** on a node, or **Add subconcept** in the panel |
| Add a top-level concept | **Add root concept** in the header |
| Collapse a branch | The chevron under a node; the count beside it is what's hidden |
| Colour a concept | Pick a swatch in the panel, or the crossed circle to clear it |
| Attach files | Drop them on the panel's file area, or click to browse |

Subconcepts stack vertically under their parent, so a plain branch reads top to
bottom as one column. A subconcept that has children of its own claims the rest
of that column for them, and the sibling after it starts a fresh column
alongside — so A with subconcepts B and C, where B has a subconcept D, lays out
as the B–D stack with C beside it.

The board keeps itself framed while you build. Once you pan or zoom it leaves
the view alone until you press **Fit**.

Edits to the name, description, and links autosave about half a second after you
stop typing; the panel header shows the save state. Deleting a concept also
deletes everything beneath it, along with their attachments, and asks first.

## How data is stored

```
<your folder>/
  concepts/
    <id>.md          one file per concept
  files/
    <concept-id>/    attachments, copied in on upload
```

A concept file is YAML frontmatter plus the description as ordinary markdown:

```markdown
---
id: mu3c7wln-uvjrmz
name: MRI
parentId: mu3c7vsg-ioigfj
order: 0
color: teal
links:
  - label: Low-field MRI review (2025)
    url: https://example.com/low-field-mri
files:
  - name: trial-protocol.pdf
    label: trial-protocol.pdf
    size: 24000
    addedAt: '2026-09-16T00:03:30.639Z'
createdAt: '2026-09-16T00:03:22.955Z'
updatedAt: '2026-09-16T00:03:30.639Z'
---

## Magnetic Resonance Imaging

No ionizing radiation. The core tradeoff is **capital cost** vs
*soft-tissue resolution*.
```

The tree is defined entirely by `parentId`, and siblings order by `order`.
`color` names one of the sixteen pastels in `lib/colors.ts`, or is `null`; a
colour the palette no longer has falls back to the default surface. A concept
whose parent goes missing resurfaces as a root rather than disappearing.

Which folder you're using is remembered in `.brainboard.json` at the project
root. That file is gitignored, so the board folder is yours to track separately
(or not).

## Layout of the code

| Path | Purpose |
| --- | --- |
| `lib/vault.ts` | Resolving the data folder, id/filename sanitizing |
| `lib/store.ts` | Reading and writing concept files and attachments |
| `lib/tree.ts` | Flat concept list → forest |
| `lib/layout-tree.ts` | Outline layout: node placement and connector routing |
| `lib/colors.ts` | The sixteen concept pastels |
| `app/api/**` | Route Handlers for concepts and files |
| `components/board-canvas.tsx` | Pan, zoom, edges, node placement |
| `components/side-panel.tsx` | The editor |

File uploads go through a Route Handler rather than a Server Action, since
Server Action bodies are capped at 1MB by default and papers routinely exceed
that.

## Not in this version

- Reordering or re-parenting concepts by dragging (the API supports both; there
  is no UI for it yet)
- Search across concepts
- Multiple boards open at once
- Undo
