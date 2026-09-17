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

/** Grid cell in board units, doubled or halved so it stays legible at any zoom. */
const GRID_CELL = 24;
const GRID_MIN_PX = 14;
const GRID_MAX_PX = 96;

export type BoardHandle = {
  /** Frames the whole tree in the viewport. */
  fit: () => void;
  /** Shifts the board horizontally, in screen px. Called in the same frame the
   * panel width changes, so the nodes stay visually still during the slide. */
  shift: (dx: number) => void;
};

type Props = {
  roots: ConceptNodeType[];
  collapsed: Set<string>;
  selectedId: string | null;
  handleRef: RefObject<BoardHandle | null>;
  onSelect: (id: string | null) => void;
  onEdit: (id: string) => void;
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
  onEdit,
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

  useImperativeHandle(
    handleRef,
    () => ({
      fit,
      shift: (dx: number) =>
        setTransform((t) => ({ ...t, x: t.x - dx })),
    }),
    [fit],
  );

  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);

  // Keep the board framed while it's being built, so a concept added at the
  // edge doesn't land off-screen. Stops as soon as the user takes the wheel.
  //
  // Keyed on the tree's geometry rather than on `layout` itself: editing a
  // concept produces a fresh layout object with identical measurements, and
  // re-framing the board out from under someone mid-edit is disorienting.
  const geometry = `${layout.nodes.length}:${Math.round(layout.width)}:${Math.round(
    layout.height,
  )}`;
  useEffect(() => {
    if (userMoved.current || layout.nodes.length === 0) return;
    fitRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  // Panel-driven viewport resizing is compensated by BoardApp calling `shift`
  // in the same animation frame as the width change, which avoids the
  // frame-lag jitter an async ResizeObserver produced.

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
      className={`relative h-full w-full select-none overflow-hidden bg-canvas ${
        panning ? "cursor-grabbing" : "cursor-grab"
      }`}
      // The grid lives on the viewport rather than the transformed layer so it
      // extends past the tree, but it is offset and scaled with the transform so
      // it still reads as ground the board sits on.
      style={{ touchAction: "none", ...gridStyle(transform) }}
    >
      {/* Transparent to the pointer, so a drag that starts anywhere but on a
          node's own controls still reaches the viewport and pans the board. */}
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          width: layout.width || 1,
          height: layout.height || 1,
        }}
      >
        <svg
          className="absolute overflow-visible"
          width={layout.width || 1}
          height={layout.height || 1}
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.d}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={1.25}
              strokeLinecap="round"
            />
          ))}
        </svg>

        {layout.nodes.map((placed) => (
          <ConceptNode
            key={placed.node.id}
            placed={placed}
            selected={placed.node.id === selectedId}
            onSelect={onSelect}
            onEdit={onEdit}
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

/** Faint square grid, kept between 14px and 96px on screen at any zoom. */
function gridStyle({ x, y, k }: Transform): React.CSSProperties {
  let step = GRID_CELL * k;
  while (step < GRID_MIN_PX) step *= 2;
  while (step > GRID_MAX_PX) step /= 2;

  return {
    backgroundImage:
      "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), " +
      "linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${x}px ${y}px`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
