"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { layoutForest } from "@/lib/layout-tree";
import type { ConceptNode as ConceptNodeType } from "@/lib/types";
import { ConceptNode } from "./concept-node";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const PADDING = 80;

export type BoardHandle = {
  /** Frames the whole tree in the viewport. */
  fit: () => void;
};

type Props = {
  roots: ConceptNodeType[];
  collapsed: Set<string>;
  selectedId: string | null;
  handleRef: RefObject<BoardHandle | null>;
  onSelect: (id: string | null) => void;
  onToggleCollapse: (id: string) => void;
  onAddChild: (id: string) => void;
};

type Transform = { x: number; y: number; k: number };

export function BoardCanvas({
  roots,
  collapsed,
  selectedId,
  handleRef,
  onSelect,
  onToggleCollapse,
  onAddChild,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });

  const layout = useMemo(() => layoutForest(roots, collapsed), [roots, collapsed]);

  // Once the user pans or zooms they own the view, and the board stops
  // re-framing itself underneath them. "Fit" hands control back.
  const userMoved = useRef(false);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    const { width, height } = layout;
    if (!viewport || width === 0 || height === 0) return;
    userMoved.current = false;

    const k = Math.min(
      Math.min(
        (viewport.clientWidth - PADDING * 2) / width,
        (viewport.clientHeight - PADDING * 2) / height,
      ),
      1,
    );
    const scale = Math.max(MIN_ZOOM, k);

    setTransform({
      x: (viewport.clientWidth - width * scale) / 2,
      y: Math.max(PADDING / 2, (viewport.clientHeight - height * scale) / 2),
      k: scale,
    });
  }, [layout]);

  useImperativeHandle(handleRef, () => ({ fit }), [fit]);

  // Keep the board framed while it's being built, so a concept added at the
  // edge doesn't land off-screen. Stops as soon as the user takes the wheel.
  useEffect(() => {
    if (userMoved.current || layout.nodes.length === 0) return;
    fit();
  }, [fit, layout]);

  // Wheel-to-zoom, anchored on the pointer. Registered natively because React's
  // wheel listener is passive, so it can't preventDefault the page scroll.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userMoved.current = true;
      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      setTransform((t) => {
        const k = clamp(t.k * Math.exp(-event.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
        const ratio = k / t.k;
        // Hold the point under the cursor still while the scale changes.
        return { k, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio };
      });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  const panState = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only drag from empty canvas, so clicks on nodes still register.
    if (event.target !== event.currentTarget) return;
    if (event.button !== 0 && event.button !== 1) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    panState.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    userMoved.current = true;
    setPanning(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panState.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panState.current?.pointerId !== event.pointerId) return;
    panState.current = null;
    setPanning(false);
  };

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
      className={`relative h-full w-full overflow-hidden bg-canvas ${
        panning ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          width: layout.width || 1,
          height: layout.height || 1,
        }}
      >
        <svg
          className="pointer-events-none absolute overflow-visible"
          width={layout.width || 1}
          height={layout.height || 1}
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={elbow(edge.from, edge.to)}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
          ))}
        </svg>

        {layout.nodes.map((placed) => (
          <ConceptNode
            key={placed.node.id}
            placed={placed}
            selected={placed.node.id === selectedId}
            onSelect={onSelect}
            onToggleCollapse={onToggleCollapse}
            onAddChild={onAddChild}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 rounded-sm border border-border-subtle bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
        {Math.round(transform.k * 100)}%
      </div>
    </div>
  );
}

/** Vertical S-curve between a parent's bottom edge and a child's top edge. */
function elbow(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const mid = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} C ${from.x} ${mid}, ${to.x} ${mid}, ${to.x} ${to.y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
