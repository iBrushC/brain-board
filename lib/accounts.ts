import type { ConceptColor } from "./colors";

/**
 * Accounts and projects for the cloud version of the board.
 *
 * Nothing here talks to a server yet — this module is the shape of the data
 * the login and projects screens are drawn against, plus a fixture to draw
 * them with. When auth lands, the types stay and `MOCK_*` goes away.
 */

/**
 * `user` creates and edits their own boards. `admin` manages a workspace of
 * users and can open any board inside it.
 */
export type Role = "user" | "admin";

export type Account = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** The group this account belongs to; one admin manages it. */
  workspace: string;
};

/** A board as it appears in the file view, without loading its concepts. */
export type ProjectSummary = {
  id: string;
  name: string;
  /** Account id of the person whose board this is. */
  ownerId: string;
  conceptCount: number;
  fileCount: number;
  /** ISO date. Rendered with a fixed formatter so SSR and the client agree. */
  updatedAt: string;
  /** Tint from the concept palette, or `null` for the default surface. */
  color: ConceptColor | null;
};

export const MOCK_WORKSPACE = "Sloan Ventures";

export const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-rosalind",
    name: "Rosalind Sloan",
    email: "rosalind@sloan.vc",
    role: "admin",
    workspace: MOCK_WORKSPACE,
  },
  {
    id: "acc-avery",
    name: "Avery Nakamura",
    email: "avery@sloan.vc",
    role: "user",
    workspace: MOCK_WORKSPACE,
  },
  {
    id: "acc-dara",
    name: "Dara Whitfield",
    email: "dara@sloan.vc",
    role: "user",
    workspace: MOCK_WORKSPACE,
  },
  {
    id: "acc-iman",
    name: "Iman Rezaei",
    email: "iman@sloan.vc",
    role: "user",
    workspace: MOCK_WORKSPACE,
  },
  {
    id: "acc-teo",
    name: "Teo Marchetti",
    email: "teo@sloan.vc",
    role: "user",
    workspace: MOCK_WORKSPACE,
  },
];

/** The account each role preview is drawn as. */
export const MOCK_VIEWER: Record<Role, Account> = {
  user: MOCK_ACCOUNTS[1],
  admin: MOCK_ACCOUNTS[0],
};

export const MOCK_PROJECTS: ProjectSummary[] = [
  {
    id: "prj-thesis",
    name: "Seed thesis 2026",
    ownerId: "acc-avery",
    conceptCount: 47,
    fileCount: 12,
    updatedAt: "2026-09-16",
    color: "indigo",
  },
  {
    id: "prj-diligence",
    name: "Diligence playbook",
    ownerId: "acc-avery",
    conceptCount: 31,
    fileCount: 8,
    updatedAt: "2026-09-11",
    color: "teal",
  },
  {
    id: "prj-climate",
    name: "Climate hardware landscape",
    ownerId: "acc-avery",
    conceptCount: 88,
    fileCount: 24,
    updatedAt: "2026-08-29",
    color: null,
  },
  {
    id: "prj-lp",
    name: "LP narrative",
    ownerId: "acc-dara",
    conceptCount: 19,
    fileCount: 5,
    updatedAt: "2026-09-15",
    color: "amber",
  },
  {
    id: "prj-devtools",
    name: "Devtools market map",
    ownerId: "acc-dara",
    conceptCount: 64,
    fileCount: 17,
    updatedAt: "2026-09-02",
    color: "green",
  },
  {
    id: "prj-biotech",
    name: "Biotech primer",
    ownerId: "acc-iman",
    conceptCount: 52,
    fileCount: 30,
    updatedAt: "2026-09-14",
    color: "rose",
  },
  {
    id: "prj-regulation",
    name: "Regulatory watchlist",
    ownerId: "acc-iman",
    conceptCount: 23,
    fileCount: 4,
    updatedAt: "2026-07-21",
    color: "orange",
  },
  {
    id: "prj-fundops",
    name: "Fund ops handbook",
    ownerId: "acc-teo",
    conceptCount: 15,
    fileCount: 9,
    updatedAt: "2026-09-08",
    color: "sky",
  },
  {
    id: "prj-portfolio",
    name: "Portfolio support notes",
    ownerId: "acc-teo",
    conceptCount: 41,
    fileCount: 11,
    updatedAt: "2026-06-30",
    color: "violet",
  },
];

/** Two letters for an avatar square. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Fixed formatter, fixed timezone: a relative "2 days ago" would render
 * differently on the server and the client and trip a hydration warning.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}
