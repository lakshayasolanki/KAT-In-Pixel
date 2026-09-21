export type ThemeId = 'red' | 'blue';

export type Rgb = readonly [number, number, number];

export type ColorStop = {
  readonly t: number;
  readonly rgb: Rgb;
};

export type ThemeDefinition = {
  readonly id: ThemeId;
  readonly background: string;
  readonly text: string;
  readonly textMuted: string;
  readonly recolor: boolean;
  readonly stops?: readonly ColorStop[];
};

/**
 * Theme definitions. Red keeps source artwork identity.
 * Blue remaps by luminance onto a deep-blue palette (no CSS filters).
 */
export const THEMES: Readonly<Record<ThemeId, ThemeDefinition>> = Object.freeze({
  red: Object.freeze({
    id: 'red',
    background: '#3e0001',
    text: '#e23a3a',
    textMuted: '#9a2a2a',
    recolor: false,
  }),
  blue: Object.freeze({
    id: 'blue',
    background: '#020b28',
    text: '#3db0ff',
    textMuted: '#1a6aaa',
    recolor: true,
    stops: Object.freeze([
      Object.freeze({ t: 0.0, rgb: [2, 8, 28] as const }),
      Object.freeze({ t: 0.18, rgb: [4, 16, 48] as const }),
      Object.freeze({ t: 0.32, rgb: [10, 36, 96] as const }),
      Object.freeze({ t: 0.5, rgb: [24, 84, 176] as const }),
      Object.freeze({ t: 0.68, rgb: [40, 140, 220] as const }),
      Object.freeze({ t: 0.84, rgb: [90, 186, 245] as const }),
      Object.freeze({ t: 1.0, rgb: [168, 220, 255] as const }),
    ]),
  }),
});

export function resolveTheme(name: string | null | undefined): ThemeDefinition {
  return name === 'blue' ? THEMES.blue : THEMES.red;
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map a 0–1 value through ordered RGB stops. */
export function sampleStops(stops: readonly ColorStop[], t: number): [number, number, number] {
  const x = clamp01(t);
  if (x <= stops[0].t) return [stops[0].rgb[0], stops[0].rgb[1], stops[0].rgb[2]];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (x <= b.t) {
      const u = (x - a.t) / (b.t - a.t || 1);
      return [
        Math.round(lerp(a.rgb[0], b.rgb[0], u)),
        Math.round(lerp(a.rgb[1], b.rgb[1], u)),
        Math.round(lerp(a.rgb[2], b.rgb[2], u)),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.rgb[0], last.rgb[1], last.rgb[2]];
}
