/**
 * The sixteen pastels a concept can be tagged with. Concepts store the *key*
 * rather than a hex value, so the palette can be retuned later without
 * rewriting every markdown file on disk.
 *
 * Each colour is derived from a single hue, which keeps the whole set
 * consistently muted next to the board's warm-neutral chrome.
 */
export const CONCEPT_COLORS = [
  { key: "rose", label: "Rose", hue: 350 },
  { key: "red", label: "Red", hue: 8 },
  { key: "orange", label: "Orange", hue: 26 },
  { key: "amber", label: "Amber", hue: 40 },
  { key: "yellow", label: "Yellow", hue: 52 },
  { key: "lime", label: "Lime", hue: 78 },
  { key: "green", label: "Green", hue: 130 },
  { key: "emerald", label: "Emerald", hue: 158 },
  { key: "teal", label: "Teal", hue: 176 },
  { key: "cyan", label: "Cyan", hue: 192 },
  { key: "sky", label: "Sky", hue: 205 },
  { key: "blue", label: "Blue", hue: 222 },
  { key: "indigo", label: "Indigo", hue: 244 },
  { key: "violet", label: "Violet", hue: 264 },
  { key: "purple", label: "Purple", hue: 286 },
  { key: "pink", label: "Pink", hue: 324 },
] as const;

export type ConceptColor = (typeof CONCEPT_COLORS)[number]["key"];

/** A resolved colour, ready to drop into inline styles. */
export type Swatch = {
  /** Node background. */
  fill: string;
  /** Node border, and the dot in the picker. */
  border: string;
  /** Text that stays legible on `fill`. */
  ink: string;
};

const BY_KEY = new Map<string, (typeof CONCEPT_COLORS)[number]>(
  CONCEPT_COLORS.map((color) => [color.key, color]),
);

export function isConceptColor(value: unknown): value is ConceptColor {
  return typeof value === "string" && BY_KEY.has(value);
}

/** `null` for an untinted concept, which keeps the board's default surface. */
export function swatch(key: string | null | undefined): Swatch | null {
  const color = key ? BY_KEY.get(key) : undefined;
  if (!color) return null;

  return {
    fill: `hsl(${color.hue} 58% 93%)`,
    border: `hsl(${color.hue} 36% 74%)`,
    ink: `hsl(${color.hue} 32% 26%)`,
  };
}
