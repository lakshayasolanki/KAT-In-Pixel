import {
  applyEyeBlinkToImageData,
  type BlinkPhase,
  type PixelSpan,
} from './eyeBlink';
import { clamp01, resolveTheme, sampleStops, type ThemeId } from './themes';

/** Optional per-source-pixel overlay for blink-mask debugging (no-op when omitted). */
export type DebugMaskOverlayOptions = {
  spans: readonly PixelSpan[];
  pixelGrid?: boolean;
  gridX0?: number;
  gridX1?: number;
  gridY0?: number;
  gridY1?: number;
};

export type PortraitPaintOptions = {
  theme: ThemeId;
  background: string | null;
  pixelScale: number;
  size: number | null;
  /** Current eye blink phase; OPEN leaves the themed bitmap untouched. */
  blinkPhase?: BlinkPhase;
  /**
   * Temporary DEBUG BLINK overlay. Drawn after the OPEN/blink frame in source
   * coordinates mapped through the same contain transform. Omitted = no change.
   */
  debugMaskOverlay?: DebugMaskOverlayOptions | null;
};

/** Mutable cache for source / themed bitmaps across paints. */
export type PortraitRenderCache = {
  image: HTMLImageElement | null;
  sourceCanvas: HTMLCanvasElement | null;
  themedCanvas: HTMLCanvasElement | null;
  themedThemeId: ThemeId | null;
  /** Scratch canvas for blink frames (never mutates themedCanvas). */
  blinkCanvas: HTMLCanvasElement | null;
};

export function createPortraitRenderCache(): PortraitRenderCache {
  return {
    image: null,
    sourceCanvas: null,
    themedCanvas: null,
    themedThemeId: null,
    blinkCanvas: null,
  };
}

export function invalidateThemedCache(cache: PortraitRenderCache): void {
  cache.themedCanvas = null;
  cache.themedThemeId = null;
}

export function resetImageCache(cache: PortraitRenderCache): void {
  cache.image = null;
  cache.sourceCanvas = null;
  invalidateThemedCache(cache);
}

function ensureSourceCanvas(cache: PortraitRenderCache): HTMLCanvasElement | null {
  const image = cache.image;
  if (!image || image.naturalWidth <= 0) return null;

  if (
    cache.sourceCanvas &&
    cache.sourceCanvas.width === image.naturalWidth &&
    cache.sourceCanvas.height === image.naturalHeight
  ) {
    return cache.sourceCanvas;
  }

  const c = document.createElement('canvas');
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  cache.sourceCanvas = c;
  return c;
}

/** Build (or reuse) a themed bitmap from the single source asset. */
function ensureThemedCanvas(cache: PortraitRenderCache, themeId: ThemeId): HTMLCanvasElement | null {
  const source = ensureSourceCanvas(cache);
  if (!source) return null;

  const theme = resolveTheme(themeId);
  if (cache.themedCanvas && cache.themedThemeId === theme.id) {
    return cache.themedCanvas;
  }

  const w = source.width;
  const h = source.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;

  if (!theme.recolor) {
    ctx.drawImage(source, 0, 0);
  } else {
    const srcCtx = source.getContext('2d', { willReadFrequently: true });
    if (!srcCtx || !theme.stops) return null;
    const imageData = srcCtx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let minV = 255;
    let maxV = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const span = Math.max(1, maxV - minV);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a === 0) continue;
      const value = Math.max(r, g, b);
      const t = clamp01((value - minV) / span);
      const [nr, ng, nb] = sampleStops(theme.stops, t);
      data[i] = nr;
      data[i + 1] = ng;
      data[i + 2] = nb;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  cache.themedCanvas = out;
  cache.themedThemeId = theme.id;
  return out;
}

/**
 * Build a blink frame from the OPEN themed bitmap without mutating the cache.
 */
function ensureBlinkFrame(
  cache: PortraitRenderCache,
  themed: HTMLCanvasElement,
  phase: BlinkPhase,
): HTMLCanvasElement | null {
  if (phase === 'OPEN') return themed;

  const w = themed.width;
  const h = themed.height;
  let blink = cache.blinkCanvas;
  if (!blink || blink.width !== w || blink.height !== h) {
    blink = document.createElement('canvas');
    blink.width = w;
    blink.height = h;
    cache.blinkCanvas = blink;
  }

  const openCtx = themed.getContext('2d', { willReadFrequently: true });
  const blinkCtx = blink.getContext('2d', { willReadFrequently: true });
  if (!openCtx || !blinkCtx) return themed;

  blinkCtx.imageSmoothingEnabled = false;
  blinkCtx.clearRect(0, 0, w, h);
  blinkCtx.drawImage(themed, 0, 0);

  const openData = openCtx.getImageData(0, 0, w, h);
  const blinkData = blinkCtx.getImageData(0, 0, w, h);
  applyEyeBlinkToImageData(blinkData, openData, phase, w);
  blinkCtx.putImageData(blinkData, 0, 0);
  return blink;
}

/**
 * Paint the portrait into `canvas` using nearest-neighbor scaling.
 * Preserves the original vanilla rendering pipeline.
 */
export function paintPortrait(
  canvas: HTMLCanvasElement,
  portraitEl: HTMLElement,
  cache: PortraitRenderCache,
  options: PortraitPaintOptions,
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) return;

  const theme = resolveTheme(options.theme);
  const bg = options.background || theme.background;
  const blinkPhase: BlinkPhase = options.blinkPhase ?? 'OPEN';

  const rect = portraitEl.getBoundingClientRect();
  const cssSize = Math.max(
    1,
    Math.round(Math.min(rect.width, rect.height) || options.size || 1),
  );
  const pixelScale = options.pixelScale;
  const bufferSize = Math.max(1, Math.round(cssSize / pixelScale));

  if (canvas.width !== bufferSize || canvas.height !== bufferSize) {
    canvas.width = bufferSize;
    canvas.height = bufferSize;
  }

  ctx.imageSmoothingEnabled = false;
  if (typeof ctx.imageSmoothingQuality === 'string') {
    ctx.imageSmoothingQuality = 'low';
  }

  ctx.clearRect(0, 0, bufferSize, bufferSize);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, bufferSize, bufferSize);

  const themed = ensureThemedCanvas(cache, options.theme);
  if (!themed) return;

  const frame = ensureBlinkFrame(cache, themed, blinkPhase);
  if (!frame) return;

  const scale = Math.min(bufferSize / frame.width, bufferSize / frame.height);
  const drawW = Math.max(1, Math.round(frame.width * scale));
  const drawH = Math.max(1, Math.round(frame.height * scale));
  const dx = Math.floor((bufferSize - drawW) / 2);
  const dy = Math.floor((bufferSize - drawH) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, dx, dy, drawW, drawH);

  const overlay = options.debugMaskOverlay;
  if (overlay) {
    paintDebugMaskOverlay(ctx, frame.width, frame.height, dx, dy, drawW, drawH, overlay);
  }
}

/** Highlight exact source texels from a blink mask (1 fillRect per source pixel). */
function paintDebugMaskOverlay(
  ctx: CanvasRenderingContext2D,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
  drawW: number,
  drawH: number,
  overlay: DebugMaskOverlayOptions,
): void {
  const sx = drawW / srcW;
  const sy = drawH / srcH;

  if (overlay.spans.length > 0) {
    ctx.fillStyle = 'rgba(255, 0, 255, 0.72)';
    for (const { y, x0, x1 } of overlay.spans) {
      for (let x = x0; x <= x1; x++) {
        ctx.fillRect(dx + x * sx, dy + y * sy, sx, sy);
      }
    }
  }

  if (!overlay.pixelGrid) return;

  const gx0 = overlay.gridX0 ?? 450;
  const gx1 = overlay.gridX1 ?? 525;
  const gy0 = overlay.gridY0 ?? 640;
  const gy1 = overlay.gridY1 ?? 690;

  ctx.strokeStyle = 'rgba(0, 255, 255, 0.35)';
  ctx.lineWidth = Math.max(1, Math.min(sx, sy) * 0.08);
  ctx.beginPath();
  for (let x = gx0; x <= gx1 + 1; x++) {
    const px = dx + x * sx;
    ctx.moveTo(px, dy + gy0 * sy);
    ctx.lineTo(px, dy + (gy1 + 1) * sy);
  }
  for (let y = gy0; y <= gy1 + 1; y++) {
    const py = dy + y * sy;
    ctx.moveTo(dx + gx0 * sx, py);
    ctx.lineTo(dx + (gx1 + 1) * sx, py);
  }
  ctx.stroke();
}

export function loadPortraitImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}
