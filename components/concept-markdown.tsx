"use client";

import { AtSign } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseReferenceHref } from "@/lib/references";

type Props = {
  children: string;
  /** Current name for each concept on the board, so references show renames. */
  names: Map<string, string>;
  /** Brings a referenced concept into view. Without it, references are inert chips. */
  onJump?: (id: string) => void;
};

/**
 * A description rendered as markdown, with `#concept:<id>` links turned into
 * chips that show the target's current name and jump to it on the board.
 */
export function ConceptMarkdown({ children, names, onJump }: Props) {
  const components: Components = {
    a: ({ href, title, children: label }) => {
      const id = parseReferenceHref(href);
      if (id === null) {
        return (
          <a href={href} title={title}>
            {label}
          </a>
        );
      }

      const name = names.get(id);
      if (name === undefined) {
        return (
          <span
            title="This concept has been deleted"
            className="concept-ref is-missing"
          >
            <AtSign size={10} strokeWidth={2} aria-hidden />
            missing concept
          </span>
        );
      }

      return (
        <button
          type="button"
          title={onJump ? `Go to ${name}` : name}
          disabled={!onJump}
          onClick={() => onJump?.(id)}
          className="concept-ref"
        >
          <AtSign size={10} strokeWidth={2} aria-hidden />
          {name}
        </button>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
