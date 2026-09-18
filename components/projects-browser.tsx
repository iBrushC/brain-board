"use client";

import { useMemo, useState, type ReactNode } from "react";
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
  UserPlus,
  Users,
} from "lucide-react";
import { swatch } from "@/lib/colors";
import {
  formatDate,
  initials,
  MOCK_ACCOUNTS,
  MOCK_PROJECTS,
  MOCK_VIEWER,
  MOCK_WORKSPACE,
  type ProjectSummary,
  type Role,
} from "@/lib/accounts";
import { Avatar, Button, inputClass, SectionLabel, Segmented } from "./ui";

type View = "list" | "grid";

/** Everyone in the workspace, by id, for resolving a project's owner. */
const BY_ID = new Map(MOCK_ACCOUNTS.map((account) => [account.id, account]));

/**
 * The file view a signed-in account lands on. A user sees their own boards; an
 * admin sees every board in the workspace, filterable down to one member.
 *
 * Fed by fixtures for now — see `lib/accounts.ts`.
 */
export function ProjectsBrowser() {
  const router = useRouter();
  // No session yet, so the role is a preview switch rather than something the
  // server told us. It goes away with the first real sign-in.
  const [role, setRole] = useState<Role>("user");
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  /** Admin rail selection; `null` is the whole workspace. */
  const [memberId, setMemberId] = useState<string | null>(null);

  const admin = role === "admin";
  const viewer = MOCK_VIEWER[role];
  const members = useMemo(
    () => MOCK_ACCOUNTS.filter((account) => account.role === "user"),
    [],
  );

  const projects = useMemo(() => {
    const scope = admin
      ? MOCK_PROJECTS.filter((p) => memberId === null || p.ownerId === memberId)
      : MOCK_PROJECTS.filter((p) => p.ownerId === viewer.id);

    const q = query.trim().toLowerCase();
    if (!q) return scope;
    return scope.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (BY_ID.get(p.ownerId)?.name.toLowerCase().includes(q) ?? false),
    );
  }, [admin, memberId, query, viewer.id]);

  const conceptTotal = projects.reduce((sum, p) => sum + p.conceptCount, 0);
  const open = () => router.push("/");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <span className="text-xs font-semibold tracking-tight">Brain Board</span>
        <ChevronRight size={12} strokeWidth={1.75} className="text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          {admin ? MOCK_WORKSPACE : "Your projects"}
        </span>

        {/* Preview control: stands in for whichever role the session carries. */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.09em] text-ink-faint">
            Preview as
          </span>
          <Segmented
            label="Preview account type"
            value={role}
            onChange={(next) => {
              setRole(next);
              setMemberId(null);
            }}
            options={[
              { value: "user", label: "User" },
              { value: "admin", label: "Admin" },
            ]}
          />
        </div>

        <div className="flex items-center gap-2 border-l border-border-subtle pl-3">
          <Avatar initials={initials(viewer.name)} />
          <div className="leading-tight">
            <div className="text-[11px] text-ink">{viewer.name}</div>
            <div className="text-[10px] text-ink-faint">{viewer.email}</div>
          </div>
          <RoleBadge role={viewer.role} />
        </div>

        <Button variant="ghost" onClick={() => router.push("/login")} title="Sign out">
          <LogOut size={12} strokeWidth={2} aria-hidden />
          Sign out
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {admin && (
          <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface">
            <div className="space-y-1.5 border-b border-border-subtle px-3 py-3">
              <SectionLabel>Workspace</SectionLabel>
              <div className="flex items-center gap-1.5 text-xs text-ink">
                <Building2 size={12} strokeWidth={1.75} className="text-ink-faint" aria-hidden />
                <span className="truncate">{MOCK_WORKSPACE}</span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              <div className="px-1 pb-2">
                <SectionLabel>Members</SectionLabel>
              </div>

              <MemberRow
                icon={<Users size={12} strokeWidth={1.75} aria-hidden />}
                label="All projects"
                count={MOCK_PROJECTS.length}
                selected={memberId === null}
                onSelect={() => setMemberId(null)}
              />

              <ul className="mt-0.5 space-y-0.5">
                {members.map((member) => (
                  <li key={member.id}>
                    <MemberRow
                      icon={<Avatar initials={initials(member.name)} size={18} />}
                      label={member.name}
                      count={MOCK_PROJECTS.filter((p) => p.ownerId === member.id).length}
                      selected={memberId === member.id}
                      onSelect={() => setMemberId(member.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border-subtle p-2">
              <Button variant="ghost" className="w-full justify-start">
                <UserPlus size={12} strokeWidth={2} aria-hidden />
                Invite member
              </Button>
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

            <Button variant="primary">
              <Plus size={12} strokeWidth={2} aria-hidden />
              New project
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {projects.length === 0 ? (
              <EmptyState searching={query.trim() !== ""} />
            ) : view === "list" ? (
              <ProjectList projects={projects} showOwner={admin} onOpen={open} />
            ) : (
              <ProjectGrid projects={projects} showOwner={admin} onOpen={open} />
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
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const admin = role === "admin";
  return (
    <span
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
function ProjectIcon({ color, size = 13 }: { color: ProjectSummary["color"]; size?: number }) {
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
  projects: ProjectSummary[];
  showOwner: boolean;
  onOpen: (id: string) => void;
};

function ProjectList({ projects, showOwner, onOpen }: ListProps) {
  // Written out in full rather than composed, so Tailwind sees both literals.
  const cols = showOwner
    ? "grid-cols-[minmax(0,1fr)_150px_80px_60px_104px]"
    : "grid-cols-[minmax(0,1fr)_80px_60px_104px]";

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
      </div>

      <ul>
        {projects.map((project) => {
          const owner = BY_ID.get(project.ownerId);
          return (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onOpen(project.id)}
                className={`grid w-full ${cols} items-center gap-3 border border-transparent px-2 py-2 text-left text-xs transition-colors hover:border-border-subtle hover:bg-surface-raised`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ProjectIcon color={project.color} />
                  <span className="truncate text-ink">{project.name}</span>
                </span>

                {showOwner && (
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted">
                    <Avatar initials={initials(owner?.name ?? "?")} size={18} />
                    <span className="truncate">{owner?.name ?? "Unknown"}</span>
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
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectGrid({ projects, showOwner, onOpen }: ListProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2 p-3">
      {projects.map((project) => {
        const owner = BY_ID.get(project.ownerId);
        return (
          <li key={project.id}>
            <button
              type="button"
              onClick={() => onOpen(project.id)}
              className="flex h-full w-full flex-col items-start gap-2 border border-border-subtle bg-surface-raised p-3 text-left transition-colors hover:border-accent"
            >
              <ProjectIcon color={project.color} size={20} />
              <span className="line-clamp-2 text-xs text-ink">{project.name}</span>

              {showOwner && (
                <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[10px] text-ink-muted">
                  <Avatar initials={initials(owner?.name ?? "?")} size={16} />
                  <span className="truncate">{owner?.name ?? "Unknown"}</span>
                </span>
              )}

              <span className="mt-auto pt-1 text-[10px] text-ink-faint">
                {project.conceptCount} concepts · {formatDate(project.updatedAt)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-ink-muted">
        {searching
          ? "No projects match that search."
          : "No projects here yet. A project is one board — a whole field, branched into concepts."}
      </p>
      {!searching && (
        <Button variant="primary">
          <Plus size={12} strokeWidth={2} aria-hidden />
          New project
        </Button>
      )}
    </div>
  );
}
