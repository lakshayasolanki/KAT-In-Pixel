import { clamp01, resolveTheme, sampleStops, type ThemeId } from './themes';

export type PortraitPaintOptions = {
  theme: ThemeId;
  background: string | null;
  pixelScale: number;
  size: number | null;
};

/** Mutable cache for source / themed bitmaps across paints. */
export type PortraitRenderCache = {
  image: HTMLImageElement | null;
  sourceCanvas: HTMLCanvasElement | null;
  themedCanvas: HTMLCanvasElement | null;
  themedThemeId: ThemeId | null;
};

export function createPortraitRenderCache(): PortraitRenderCache {
  return {
    image: null,
    sourceCanvas: null,
    themedCanvas: null,
    themedThemeId: null,
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

  const scale = Math.min(bufferSize / themed.width, bufferSize / themed.height);
  const drawW = Math.max(1, Math.round(themed.width * scale));
  const drawH = Math.max(1, Math.round(themed.height * scale));
  const dx = Math.floor((bufferSize - drawW) / 2);
  const dy = Math.floor((bufferSize - drawH) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(themed, dx, dy, drawW, drawH);
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
