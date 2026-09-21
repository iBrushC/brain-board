"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Folder,
  LayoutGrid,
  List,
  LogOut,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { acceptInvitation, inviteMember, revokeInvite, signOut } from "@/app/actions";
import {
  displayName,
  formatDate,
  initials,
  type Invite,
  type Member,
  type PendingInvitation,
  type PlacedViewer,
  type Role,
} from "@/lib/accounts";
import { api } from "@/lib/client";
import { swatch } from "@/lib/colors";
import type { BoardSummary } from "@/lib/types";
import { Avatar, Button, inputClass, SectionLabel, Segmented } from "./ui";

type View = "list" | "grid";

type Props = {
  viewer: PlacedViewer;
  boards: BoardSummary[];
  /** Everyone in the workspace: an admin scopes by them, a user reads who can see their work. */
  members: Member[];
  /** The whole workspace's pending invitations for an admin, the viewer's own otherwise. */
  invites: Invite[];
  /** An invitation to somewhere else, waiting to be taken. Usually `null`. */
  invitation: PendingInvitation | null;
};

/**
 * The file view a signed-in account lands on. A user sees their own boards; an
 * admin sees every board in the workspace, filterable down to one member.
 *
 * The scoping below is presentation only — the list arrives already filtered by
 * row-level security, so an admin's "all projects" is the whole organization
 * and a user's is their own, whatever this component does with it.
 */
export function ProjectsBrowser({ viewer, boards, members, invites, invitation }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  /** Admin rail selection; `null` is the whole workspace. */
  const [memberId, setMemberId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const admin = viewer.role === "admin";
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const projects = useMemo(() => {
    const scope =
      admin && memberId !== null ? boards.filter((b) => b.ownerId === memberId) : boards;

    const q = query.trim().toLowerCase();
    if (!q) return scope;
    return scope.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (byId.get(b.ownerId)?.name.toLowerCase().includes(q) ?? false),
    );
  }, [admin, boards, byId, memberId, query]);

  const conceptTotal = projects.reduce((sum, b) => sum + b.conceptCount, 0);
  const open = (id: string) => router.push(`/board/${id}`);

  /**
   * Admins can't create boards — `can_write_board` requires not being one — so
   * the control is absent for them rather than present and rejected. Nobody
   * becomes an admin by accident any more, so this is a deliberate role rather
   * than a dead end someone signed up into.
   */
  const createBoard = async () => {
    setCreating(true);
    setError(null);
    try {
      const board = await api.createBoard("Untitled board", viewer.orgId, viewer.id);
      router.push(`/board/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
      setCreating(false);
    }
  };

  /**
   * Pulls a local vault folder — the format the app used before the cloud —
   * into a new board. The browser reads the folder via a directory picker, so
   * no service key or script is involved.
   */
  const importBoard = async (files: FileList) => {
    setImporting(true);
    setError(null);
    try {
      const result = await api.importBoard(viewer.orgId, viewer.id, Array.from(files));
      if (result.skipped > 0) {
        setError(
          `Imported with ${result.skipped} item${result.skipped === 1 ? "" : "s"} skipped (unreadable or unattached).`,
        );
      }
      router.push(`/board/${result.board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import the board.");
      setImporting(false);
    }
  };

  /** Only the owner's own boards can go; RLS enforces it regardless. */
  const deleteBoard = async (board: BoardSummary) => {
    if (!window.confirm(`Delete “${board.name}” and all of its concepts and files?`)) return;
    setDeletingId(board.id);
    setError(null);
    try {
      await api.deleteBoard(board.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the project.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <span className="text-xs font-semibold tracking-tight">Brain Board</span>
        <ChevronRight size={12} strokeWidth={1.75} className="text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          {admin ? viewer.orgName : "Your projects"}
        </span>

        {error && (
          <button
            type="button"
            onClick={() => setError(null)}
            className="max-w-xs truncate text-[11px] text-danger hover:underline"
            title={`${error} (click to dismiss)`}
          >
            {error}
          </button>
        )}

        <div className="flex items-center gap-2 border-l border-border-subtle pl-3">
          <Avatar initials={initials(displayName(viewer.name, viewer.email))} />
          <div className="leading-tight">
            <div className="text-[11px] text-ink">{displayName(viewer.name, viewer.email)}</div>
            <div className="text-[10px] text-ink-faint">{viewer.email}</div>
          </div>
          <RoleBadge role={viewer.role} />
        </div>

        <form action={signOut}>
          <Button type="submit" variant="ghost" title="Sign out">
            <LogOut size={12} strokeWidth={2} aria-hidden />
            Sign out
          </Button>
        </form>
      </header>

      {invitation && <InvitationBar invitation={invitation} hasBoards={boards.length > 0} />}

      <div className="flex min-h-0 flex-1">
        {admin && (
          <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface">
            <div className="space-y-1.5 border-b border-border-subtle px-3 py-3">
              <SectionLabel>Workspace</SectionLabel>
              <div className="flex items-center gap-1.5 text-xs text-ink">
                <Building2 size={12} strokeWidth={1.75} className="text-ink-faint" aria-hidden />
                <span className="truncate">{viewer.orgName}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              <div className="px-1 pb-2">
                <SectionLabel>Members</SectionLabel>
              </div>

              <MemberRow
                icon={<Users size={12} strokeWidth={1.75} aria-hidden />}
                label="All projects"
                count={boards.length}
                selected={memberId === null}
                onSelect={() => setMemberId(null)}
              />

              <ul className="mt-0.5 space-y-0.5">
                {members.map((member) => (
                  <li key={member.id}>
                    <MemberRow
                      icon={
                        <Avatar
                          initials={initials(displayName(member.name, member.email))}
                          size={18}
                        />
                      }
                      label={displayName(member.name, member.email)}
                      count={boards.filter((b) => b.ownerId === member.id).length}
                      selected={memberId === member.id}
                      onSelect={() => setMemberId(member.id)}
                    />
                  </li>
                ))}
              </ul>

              {invites.length > 0 && (
                <div className="mt-4">
                  <div className="px-1 pb-2">
                    <SectionLabel>Invited</SectionLabel>
                  </div>
                  <ul className="space-y-0.5">
                    {invites.map((invite) => (
                      <li key={invite.id}>
                        <PendingInvite invite={invite} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-border-subtle p-2">
              {inviting ? (
                <InviteForm onDone={() => setInviting(false)} />
              ) : (
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => setInviting(true)}
                >
                  <UserPlus size={12} strokeWidth={2} aria-hidden />
                  Invite member
                </Button>
              )}
            </div>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
            <div className="relative w-64 max-w-full">
              <Search
                size={12}
                strokeWidth={1.75}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-2 my-auto text-ink-faint"
              />
              <input
                className={`${inputClass} pl-7`}
                type="search"
                placeholder={admin ? "Search projects and people" : "Search projects"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="flex-1" />

            <Segmented
              label="View mode"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "list",
                  title: "List",
                  label: <List size={12} strokeWidth={1.75} aria-hidden />,
                },
                {
                  value: "grid",
                  title: "Grid",
                  label: <LayoutGrid size={12} strokeWidth={1.75} aria-hidden />,
                },
              ]}
            />

            {!admin && viewer.ownsWorkspace && (
              <Button
                variant="ghost"
                aria-expanded={sharing}
                onClick={() => setSharing((open) => !open)}
              >
                <UserPlus size={12} strokeWidth={2} aria-hidden />
                Share
              </Button>
            )}

            {!admin && (
              <>
                <input
                  ref={importInput}
                  type="file"
                  multiple
                  // Directory pick aren't standardized; every Chromium build
                  // and Firefox accept these attributes.
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) void importBoard(files);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="ghost"
                  disabled={importing}
                  onClick={() => importInput.current?.click()}
                >
                  <Upload size={12} strokeWidth={2} aria-hidden />
                  {importing ? "Importing…" : "Import board"}
                </Button>
                <Button
                  variant="primary"
                  disabled={creating}
                  onClick={() => void createBoard()}
                >
                  <Plus size={12} strokeWidth={2} aria-hidden />
                  {creating ? "Creating…" : "New project"}
                </Button>
              </>
            )}
          </div>

          {!admin && viewer.ownsWorkspace && sharing && (
            <SharePanel
              viewer={viewer}
              members={members}
              invites={invites}
              onClose={() => setSharing(false)}
            />
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {projects.length === 0 ? (
              <EmptyState
                searching={query.trim() !== ""}
                admin={admin}
                creating={creating}
                onCreate={() => void createBoard()}
              />
            ) : view === "list" ? (
              <ProjectList
                projects={projects}
                owners={byId}
                showOwner={admin}
                deletingId={deletingId}
                onOpen={open}
                onDelete={(b) => void deleteBoard(b)}
              />
            ) : (
              <ProjectGrid
                projects={projects}
                owners={byId}
                showOwner={admin}
                deletingId={deletingId}
                onOpen={open}
                onDelete={(b) => void deleteBoard(b)}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border-subtle bg-surface px-3 py-1.5 text-[10px] text-ink-faint">
            <span>
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
            <span aria-hidden>·</span>
            <span>{conceptTotal} concepts</span>
            {admin && memberId === null && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {members.length} member{members.length === 1 ? "" : "s"}
                </span>
                <span aria-hidden>·</span>
                <span>read-only</span>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * An invitation to a different workspace. Placement gives every account one of
 * its own, so an invitation that arrives afterwards has to be taken by hand —
 * and only from an empty workspace, since the one being left is dropped.
 */
function InvitationBar({
  invitation,
  hasBoards,
}: {
  invitation: PendingInvitation;
  hasBoards: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-accent-soft px-3 py-2 text-[11px]">
      <UserPlus size={12} strokeWidth={1.75} className="text-accent" aria-hidden />
      <span className="text-ink">
        You’ve been invited to <span className="font-medium">{invitation.orgName}</span> as{" "}
        {invitation.role === "admin" ? "an admin" : "a user"}.
      </span>
      <span className="text-ink-faint">
        {hasBoards
          ? "Joining means leaving this workspace, which your boards live in — delete them first, or stay put."
          : "Your current workspace is empty, so joining will replace it."}
      </span>

      {error && <span className="text-danger">{error}</span>}

      <div className="ml-auto">
        <Button
          variant="primary"
          disabled={pending || hasBoards}
          onClick={() =>
            start(async () => {
              const result = await acceptInvitation();
              if (result?.error) setError(result.error);
            })
          }
        >
          {pending ? "Joining…" : "Join"}
        </Button>
      </div>
    </div>
  );
}

/**
 * How a user adds the admin who reads their work. Invitations are the same
 * mechanism an admin uses from the rail; the difference is only that RLS lets
 * the workspace's owner send them too, so this is the owner's view of it.
 */
function SharePanel({
  viewer,
  members,
  invites,
  onClose,
}: {
  viewer: PlacedViewer;
  members: Member[];
  invites: Invite[];
  onClose: () => void;
}) {
  const others = members.filter((member) => member.id !== viewer.id);

  return (
    <div className="shrink-0 border-b border-border-subtle bg-surface-raised px-3 py-3">
      <div className="flex max-w-xl flex-col gap-3 sm:flex-row sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <SectionLabel>Who can see your work</SectionLabel>
          {others.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-ink-muted">
              Only you. Invite someone as an admin and they’ll be able to read every
              board in this workspace — but not edit one.
            </p>
          ) : (
            <ul className="space-y-1">
              {others.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-2 text-[11px] text-ink-muted"
                >
                  <Avatar initials={initials(displayName(member.name, member.email))} size={18} />
                  <span className="min-w-0 flex-1 truncate">
                    {displayName(member.name, member.email)}
                  </span>
                  <RoleBadge role={member.role} />
                </li>
              ))}
            </ul>
          )}

          {invites.length > 0 && (
            <div className="space-y-1 pt-2">
              <SectionLabel>Invited</SectionLabel>
              <ul>
                {invites.map((invite) => (
                  <li key={invite.id}>
                    <PendingInvite invite={invite} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="w-full sm:w-56">
          <InviteForm onDone={onClose} defaultRole="admin" />
        </div>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const admin = role === "admin";
  return (
    <span
      title={admin ? "Admins can read every board in the workspace, but not edit them" : undefined}
      className={`rounded-sm border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.09em] ${
        admin
          ? "border-accent bg-accent-soft text-accent"
          : "border-border-subtle text-ink-faint"
      }`}
    >
      {role}
    </span>
  );
}

function InviteForm({ onDone, defaultRole = "user" }: { onDone: () => void; defaultRole?: Role }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="space-y-1.5"
      action={(formData) =>
        start(async () => {
          const result = await inviteMember(formData);
          if (result?.error) setError(result.error);
          else onDone();
        })
      }
    >
      <SectionLabel>Invite by email</SectionLabel>
      <input
        autoFocus
        required
        name="email"
        type="email"
        className={inputClass}
        placeholder="colleague@company.com"
      />
      <select name="role" className={inputClass} defaultValue={defaultRole}>
        <option value="admin">Joins as an admin — reads every board</option>
        <option value="user">Joins as a user — keeps their own boards</option>
      </select>
      {error && <p className="text-[11px] leading-relaxed text-danger">{error}</p>}
      <div className="flex gap-1.5">
        <Button type="submit" variant="primary" className="flex-1" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p className="text-[10px] leading-relaxed text-ink-faint">
        They join the workspace when they sign in with this address.
      </p>
    </form>
  );
}

function PendingInvite({ invite }: { invite: Invite }) {
  const [pending, start] = useTransition();

  return (
    <form
      action={(formData) => start(async () => void (await revokeInvite(formData)))}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-[11px] text-ink-muted"
    >
      <input type="hidden" name="id" value={invite.id} />
      <span className="min-w-0 flex-1 truncate" title={invite.email}>
        {invite.email}
      </span>
      <span className="shrink-0 text-[10px] text-ink-faint">{invite.role}</span>
      <button
        type="submit"
        disabled={pending}
        title="Revoke invitation"
        aria-label={`Revoke the invitation to ${invite.email}`}
        className="shrink-0 text-ink-faint hover:text-danger disabled:opacity-45"
      >
        <X size={12} strokeWidth={2} aria-hidden />
      </button>
    </form>
  );
}

function MemberRow({
  icon,
  label,
  count,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-[11px] transition-colors ${
        selected
          ? "border-border-subtle bg-accent-soft text-ink"
          : "border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink"
      }`}
    >
      <span className="flex w-[18px] shrink-0 justify-center text-ink-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-[10px] text-ink-faint">{count}</span>
    </button>
  );
}

/** Folder glyph tinted with the board's own colour, so rows stay scannable. */
function ProjectIcon({ color, size = 13 }: { color: BoardSummary["color"]; size?: number }) {
  const tint = swatch(color);
  return (
    <Folder
      size={size}
      strokeWidth={1.75}
      aria-hidden
      className="shrink-0"
      style={tint ? { color: tint.border, fill: tint.fill } : { color: "var(--ink-faint)" }}
    />
  );
}

type ListProps = {
  projects: BoardSummary[];
  owners: Map<string, Member>;
  showOwner: boolean;
  /** The board a delete is currently running against, if any. */
  deletingId: string | null;
  onOpen: (id: string) => void;
  onDelete: (board: BoardSummary) => void;
};

function ProjectList({ projects, owners, showOwner, deletingId, onOpen, onDelete }: ListProps) {
  // Written out in full rather than composed, so Tailwind sees both literals.
  const cols = showOwner
    ? "grid-cols-[minmax(0,1fr)_150px_80px_60px_104px_28px]"
    : "grid-cols-[minmax(0,1fr)_80px_60px_104px_28px]";

  return (
    <div className="px-3 py-3">
      <div
        className={`grid ${cols} items-center gap-3 border-b border-border-subtle px-2 pb-1.5 text-[10px] uppercase tracking-[0.09em] text-ink-faint`}
      >
        <span>Name</span>
        {showOwner && <span>Owner</span>}
        <span className="text-right">Concepts</span>
        <span className="text-right">Files</span>
        <span className="text-right">Modified</span>
        <span />
      </div>

      <ul>
        {projects.map((project) => {
          const owner = owners.get(project.ownerId);
          return (
            <li key={project.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpen(project.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(project.id);
                  }
                }}
                className={`group grid w-full ${cols} cursor-pointer items-center gap-3 border border-transparent px-2 py-2 text-left text-xs transition-colors hover:border-border-subtle hover:bg-surface-raised`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProjectIcon color={project.color} />
                  <span className="truncate text-ink">{project.name}</span>
                </span>

                {showOwner && (
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
                    <Avatar initials={initials(ownerName(owner))} size={18} />
                    <span className="truncate">{ownerName(owner)}</span>
                  </span>
                )}

                <span className="text-right tabular-nums text-[11px] text-ink-muted">
                  {project.conceptCount}
                </span>
                <span className="text-right tabular-nums text-[11px] text-ink-muted">
                  {project.fileCount}
                </span>
                <span className="text-right text-[11px] text-ink-faint">
                  {formatDate(project.updatedAt)}
                </span>
                <span className="flex justify-end">
                  <button
                    type="button"
                    disabled={deletingId === project.id}
                    title="Delete project"
                    aria-label={`Delete ${project.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project);
                    }}
                    className="text-ink-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-45"
                  >
                    <Trash2 size={12} strokeWidth={2} aria-hidden />
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectGrid({ projects, owners, showOwner, deletingId, onOpen, onDelete }: ListProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2 p-3">
      {projects.map((project) => {
        const owner = owners.get(project.ownerId);
        return (
          <li key={project.id} className="group relative">
            <button
              type="button"
              onClick={() => onOpen(project.id)}
              className="flex h-full w-full flex-col items-start gap-2 border border-border-subtle bg-surface-raised p-3 pr-8 text-left transition-colors hover:border-accent"
            >
              <ProjectIcon color={project.color} size={20} />
              <span className="line-clamp-2 text-xs text-ink">{project.name}</span>

              {showOwner && (
                <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[10px] text-ink-muted">
                  <Avatar initials={initials(ownerName(owner))} size={16} />
                  <span className="truncate">{ownerName(owner)}</span>
                </span>
              )}

              <span className="mt-auto pt-1 text-[10px] text-ink-faint">
                {project.conceptCount} concepts · {formatDate(project.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              disabled={deletingId === project.id}
              title="Delete project"
              aria-label={`Delete ${project.name}`}
              onClick={() => onDelete(project)}
              className="absolute right-2 top-2 text-ink-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-45"
            >
              <Trash2 size={12} strokeWidth={2} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A board's owner is always in the org, but the rail is only fetched for admins. */
function ownerName(owner: Member | undefined): string {
  return owner ? displayName(owner.name, owner.email) : "Unknown";
}

function EmptyState({
  searching,
  admin,
  creating,
  onCreate,
}: {
  searching: boolean;
  admin: boolean;
  creating: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
        {searching
          ? "No projects match that search."
          : admin
            ? "Nobody in this workspace has made a board yet. Invite someone, and their boards will show up here."
            : "No projects here yet. A project is one board — a whole field, branched into concepts."}
      </p>
      {!searching && !admin && (
        <Button variant="primary" disabled={creating} onClick={onCreate}>
          <Plus size={12} strokeWidth={2} aria-hidden />
          {creating ? "Creating…" : "New project"}
        </Button>
      )}
    </div>
  );
}
