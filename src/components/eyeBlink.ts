/**
 * Eye blink — deterministic eyelid masks in source-image coordinates.
 *
 * Source: kat-portrait.png (1254×1254)
 *
 * Anatomy (source y):
 *   y648..661 = upper eyelid flesh / body
 *   y662      = dark eyelid rim (leading edge) — never overwritten
 *   y663+     = eye opening (mask targets)
 *
 * Covered pixels are filled by translating the existing upper-lid column
 * downward so flesh shading is preserved and the y662 rim stays on the
 * leading edge of the moving lid. Sampling uses the already-themed OPEN
 * ImageData (theme-safe for red and blue).
 *
 * Bottom notch (480..484, 670) is excluded from every mask.
 */

export type BlinkPhase = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING';

/** Inclusive horizontal span on a single source row. */
export type PixelSpan = {
  y: number;
  x0: number;
  x1: number;
};

/** Dark eyelid rim row — leading edge of the lid; never written. */
export const RIM_Y = 662;

/** @deprecated Use RIM_Y. Kept for any external references. */
export const SHELF_Y = RIM_Y;

/** Top of upper-eyelid flesh available for sampling. */
const LID_TOP_Y = 648;

/**
 * HALF-CLOSED eyelid geometry (source coords).
 * Curved descending lid — used for CLOSING and OPENING.
 */
export const HALF_CLOSED_MASK: readonly PixelSpan[] = Object.freeze([
  { y: 663, x0: 473, x1: 502 },
  { y: 664, x0: 474, x1: 501 },
  { y: 665, x0: 476, x1: 499 },
  { y: 666, x0: 479, x1: 496 },
]);

/**
 * CLOSED eyelid geometry (source coords).
 * Excludes bottom-notch pixels (480..484, 670) — never modified.
 * Does not extend into y671..675.
 */
export const CLOSED_MASK: readonly PixelSpan[] = Object.freeze([
  { y: 663, x0: 472, x1: 503 },
  { y: 664, x0: 472, x1: 503 },
  { y: 665, x0: 472, x1: 503 },
  { y: 666, x0: 472, x1: 503 },
  { y: 667, x0: 472, x1: 503 },
  { y: 668, x0: 472, x1: 503 },
  { y: 669, x0: 472, x1: 503 },
  { y: 670, x0: 472, x1: 479 },
  { y: 670, x0: 485, x1: 503 },
]);

/** Fast, subtle blink timings (ms). */
const PHASE_MS: Record<BlinkPhase, number> = {
  OPEN: 0,
  CLOSING: 45,
  CLOSED: 70,
  OPENING: 45,
};

const BLINK_SEQUENCE: readonly BlinkPhase[] = [
  'CLOSING',
  'CLOSED',
  'OPENING',
  'OPEN',
];

function maskForPhase(phase: BlinkPhase): readonly PixelSpan[] {
  switch (phase) {
    case 'CLOSING':
    case 'OPENING':
      return HALF_CLOSED_MASK;
    case 'CLOSED':
      return CLOSED_MASK;
    case 'OPEN':
    default:
      return [];
  }
}

/** Debug UI mask labels — maps onto the same HALF_CLOSED_MASK / CLOSED_MASK constants. */
export type DebugBlinkMaskId = 'OPEN' | 'HALF' | 'CLOSED';

/** Source-of-truth mask lookup for debug overlays (same arrays the blink renderer uses). */
export function getDebugBlinkMask(id: DebugBlinkMaskId): readonly PixelSpan[] {
  switch (id) {
    case 'HALF':
      return HALF_CLOSED_MASK;
    case 'CLOSED':
      return CLOSED_MASK;
    case 'OPEN':
    default:
      return [];
  }
}

export function countMaskPixels(mask: readonly PixelSpan[]): number {
  let n = 0;
  for (const { x0, x1 } of mask) n += x1 - x0 + 1;
  return n;
}

/** Set of `"x,y"` keys for O(1) hover tests in the debug zoom view. */
export function buildMaskPixelSet(mask: readonly PixelSpan[]): Set<string> {
  const set = new Set<string>();
  for (const { y, x0, x1 } of mask) {
    for (let x = x0; x <= x1; x++) set.add(`${x},${y}`);
  }
  return set;
}

/**
 * Per-column leading edge (max masked y). The y662 rim is mapped onto this
 * row so it stays the lower edge of the translated lid.
 */
function leadingEdgeByX(mask: readonly PixelSpan[]): Map<number, number> {
  const lead = new Map<number, number>();
  for (const { y, x0, x1 } of mask) {
    for (let x = x0; x <= x1; x++) {
      const prev = lead.get(x);
      if (prev === undefined || y > prev) lead.set(x, y);
    }
  }
  return lead;
}

/**
 * Source y for a covered destination: translate the lid column so the rim
 * lands on that column's leading edge.
 *   sourceY = destY - (leadY - RIM_Y)
 * Clamped to the upper-lid band [LID_TOP_Y, RIM_Y].
 */
function lidSourceY(destY: number, leadY: number): number {
  const displacement = leadY - RIM_Y;
  const srcY = destY - displacement;
  if (srcY < LID_TOP_Y) return LID_TOP_Y;
  if (srcY > RIM_Y) return RIM_Y;
  return srcY;
}

/**
 * Apply eyelid mask onto a full-resolution themed bitmap copy.
 * Translates upper-lid RGBA from openSource into masked opening pixels.
 * Only masked eye-opening pixels change; y662 and the y670 notch are never written.
 */
export function applyEyeBlinkToImageData(
  dest: ImageData,
  openSource: ImageData,
  phase: BlinkPhase,
  width: number,
): void {
  const mask = maskForPhase(phase);
  if (mask.length === 0) return;

  const d = dest.data;
  const s = openSource.data;
  const leadY = leadingEdgeByX(mask);

  for (const span of mask) {
    const { y, x0, x1 } = span;
    for (let x = x0; x <= x1; x++) {
      const lead = leadY.get(x)!;
      const srcY = lidSourceY(y, lead);
      const srcOff = (srcY * width + x) * 4;
      const off = (y * width + x) * 4;
      d[off] = s[srcOff];
      d[off + 1] = s[srcOff + 1];
      d[off + 2] = s[srcOff + 2];
      d[off + 3] = s[srcOff + 3];
    }
  }
}

export type BlinkControllerCallbacks = {
  /** Called whenever the phase changes so the canvas can repaint. */
  onPhaseChange: (phase: BlinkPhase) => void;
};

/**
 * Imperative blink runner — no React state. Uses timeouts for phase steps.
 * Ignores re-triggers while a blink is in progress.
 */
export function createBlinkController(callbacks: BlinkControllerCallbacks) {
  let phase: BlinkPhase = 'OPEN';
  let busy = false;
  let timers: number[] = [];

  const clearTimers = () => {
    for (const id of timers) window.clearTimeout(id);
    timers = [];
  };

  const setPhase = (next: BlinkPhase) => {
    phase = next;
    callbacks.onPhaseChange(phase);
  };

  return {
    getPhase: () => phase,
    isBusy: () => busy,

    /** Trigger exactly one blink. No-op if already blinking. */
    trigger(): void {
      if (busy) return;
      busy = true;
      clearTimers();

      let elapsed = 0;
      for (const next of BLINK_SEQUENCE) {
        const delay = elapsed;
        const id = window.setTimeout(() => {
          setPhase(next);
          if (next === 'OPEN') {
            busy = false;
            clearTimers();
          }
        }, delay);
        timers.push(id);
        elapsed += PHASE_MS[next] || 0;
      }
    },

    dispose(): void {
      clearTimers();
      busy = false;
      phase = 'OPEN';
    },
  };
}

export type BlinkController = ReturnType<typeof createBlinkController>;
