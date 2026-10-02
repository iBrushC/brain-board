"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TextareaHTMLAttributes } from "react";
import { referenceMarkdown } from "@/lib/references";
import type { Concept } from "@/lib/types";

const MAX_SUGGESTIONS = 8;
const MAX_QUERY = 60;

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** Every concept on the board, the pool `@` suggestions are drawn from. */
  concepts: Concept[];
  /** The concept being edited, which never suggests itself. */
  selfId: string;
};

type Trigger = { start: number; query: string };

/**
 * A markdown textarea where typing `@` offers the board's concepts by name and
 * inserts a reference link to the one picked.
 */
export function ReferenceTextarea({
  value,
  onChange,
  concepts,
  selfId,
  className = "",
  onKeyDown,
  onBlur,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  // Escape closes the list for the `@` it was opened on; a new `@` reopens it.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  // Where the caret should land once an insertion has re-rendered.
  const pendingCaret = useRef<number | null>(null);

  const byId = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);

  const trigger = caret === null ? null : findTrigger(value, caret);
  const query = trigger?.query ?? null;

  const suggestions = (() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const pool = concepts.filter((c) => c.id !== selfId && c.name.toLowerCase().includes(q));
    // Prefix hits first: they're almost always what's being typed.
    pool.sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) ||
        a.name.localeCompare(b.name),
    );
    return pool.slice(0, MAX_SUGGESTIONS);
  })();

  // A multi-word query that matches nothing is just prose after an `@`, so the
  // list gets out of the way instead of shouting "no matches" at every word.
  const open =
    trigger !== null &&
    trigger.start !== dismissedAt &&
    (suggestions.length > 0 || !trigger.query.includes(" "));
  const highlighted = Math.min(active, Math.max(suggestions.length - 1, 0));

  useLayoutEffect(() => {
    const at = pendingCaret.current;
    const textarea = ref.current;
    if (at === null || !textarea) return;
    pendingCaret.current = null;
    textarea.setSelectionRange(at, at);
    setCaret(at);
  }, [value]);

  const syncCaret = () => {
    const textarea = ref.current;
    if (!textarea) return;
    setCaret(textarea.selectionStart === textarea.selectionEnd ? textarea.selectionStart : null);
  };

  const insert = (concept: Concept) => {
    if (!trigger || caret === null) return;
    const after = value.slice(caret);
    const link = referenceMarkdown(concept);
    const spacer = /^\s/.test(after) ? "" : " ";
    const next = value.slice(0, trigger.start) + link + spacer + after;
    pendingCaret.current = trigger.start + link.length + spacer.length;
    setActive(0);
    onChange(next);
  };

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          syncCaret();
        }}
        onSelect={syncCaret}
        onClick={syncCaret}
        onBlur={(e) => {
          setCaret(null);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown" && suggestions.length > 0) {
              e.preventDefault();
              setActive((highlighted + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp" && suggestions.length > 0) {
              e.preventDefault();
              setActive((highlighted - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && suggestions[highlighted]) {
              e.preventDefault();
              insert(suggestions[highlighted]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDismissedAt(trigger.start);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        aria-autocomplete="list"
        className={className}
      />

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto border border-border-subtle bg-surface-raised shadow-lg"
        >
          {suggestions.length === 0 ? (
            <li className="px-2.5 py-2 text-[11px] text-ink-faint">No matching concepts.</li>
          ) : (
            suggestions.map((concept, index) => {
              const parent = concept.parentId ? byId.get(concept.parentId) : undefined;
              return (
                <li key={concept.id} role="option" aria-selected={index === highlighted}>
                  <button
                    type="button"
                    // Keeps focus (and the caret) in the textarea through the click.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(concept)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full min-w-0 flex-col items-start gap-0.5 px-2.5 py-1.5 text-left ${
                      index === highlighted ? "bg-accent-soft" : ""
                    }`}
                  >
                    <span className="w-full truncate text-[11px] text-ink">{concept.name}</span>
                    {parent && (
                      <span className="w-full truncate text-[10px] text-ink-faint">
                        in {parent.name}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * The `@query` the caret is sitting at the end of, if any. The `@` must start
 * the text or follow whitespace, so an email address never triggers it.
 */
function findTrigger(value: string, caret: number): Trigger | null {
  const before = value.slice(Math.max(0, caret - MAX_QUERY - 1), caret);
  const match = /(^|\s)@([^\n@[\]()]*)$/.exec(before);
  // "@ " is punctuation, not the start of a reference.
  if (!match || /^\s/.test(match[2])) return null;
  const start = caret - match[2].length - 1;
  // The window cut the text mid-line; only trust a match that truly starts a word.
  if (start > 0 && !/\s/.test(value[start - 1])) return null;
  return { start, query: match[2] };
}
