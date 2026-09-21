/**
 * KatPixelPortrait — self-contained canvas pixel-art portrait.
 *
 * Usage (custom element):
 *   <kat-pixel-portrait theme="red" pixel-scale="1"></kat-pixel-portrait>
 *
 * Usage (programmatic):
 *   import { createKatPixelPortrait } from './KatPixelPortrait.js';
 *   const el = createKatPixelPortrait({ theme: 'blue', pixelScale: 1 });
 *   document.body.appendChild(el);
 *
 * Theme API: theme = 'red' | 'blue'
 */

const DEFAULTS = Object.freeze({
  /** Display size in CSS pixels for the portrait column. Null = fluid. */
  size: null,
  /** Explicit background override; null uses the active theme background. */
  background: null,
  /**
   * CSS pixels per logical pixel. The canvas bitmap is sized to
   * displaySize / pixelScale, then CSS-upscaled with nearest-neighbor.
   */
  pixelScale: 1,
  /** Visual theme: 'red' (default) or 'blue'. */
  theme: 'red',
  /** Path to the local portrait asset (single source of truth). */
  src: new URL('../assets/kat-portrait.png', import.meta.url).href,
});

/**
 * Theme definitions. Red keeps source artwork identity.
 * Blue remaps by luminance onto a deep-blue palette (no CSS filters).
 */
const THEMES = Object.freeze({
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
      Object.freeze({ t: 0.0, rgb: [2, 8, 28] }),
      Object.freeze({ t: 0.18, rgb: [4, 16, 48] }),
      Object.freeze({ t: 0.32, rgb: [10, 36, 96] }),
      Object.freeze({ t: 0.5, rgb: [24, 84, 176] }),
      Object.freeze({ t: 0.68, rgb: [40, 140, 220] }),
      Object.freeze({ t: 0.84, rgb: [90, 186, 245] }),
      Object.freeze({ t: 1.0, rgb: [168, 220, 255] }),
    ]),
  }),
});

const STYLE = `
:host {
  --kat-bg: ${THEMES.red.background};
  --kat-text: ${THEMES.red.text};
  --kat-text-muted: ${THEMES.red.textMuted};

  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.25fr);
  align-items: center;
  gap: clamp(1rem, 4vw, 2.5rem);
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background: transparent;
  color: var(--kat-text);
  font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
}

.identity {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.35em;
  min-width: 0;
  padding-inline: 0.15rem;
  line-height: 1.15;
  user-select: text;
}

.name {
  margin: 0;
  font-size: clamp(1.15rem, 2.6vw, 2rem);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--kat-text);
  text-wrap: balance;
}

.aka {
  margin: 0;
  font-size: clamp(0.75rem, 1.5vw, 1rem);
  font-weight: 500;
  letter-spacing: 0.14em;
  color: var(--kat-text-muted);
}

.portrait {
  position: relative;
  width: 100%;
  max-width: 100%;
  aspect-ratio: 1 / 1;
  line-height: 0;
  background: var(--kat-bg);
  justify-self: stretch;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

@media (max-width: 640px) {
  :host {
    grid-template-columns: 1fr;
    justify-items: stretch;
    gap: 1.25rem;
  }

  .identity {
    text-align: left;
    order: 0;
  }

  .portrait {
    order: 1;
    width: min(100%, 420px);
    justify-self: center;
  }
}
`;

function parsePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Map a 0–1 value through ordered RGB stops. */
function sampleStops(stops, t) {
  const x = clamp01(t);
  if (x <= stops[0].t) return stops[0].rgb.slice();
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
  return stops[stops.length - 1].rgb.slice();
}

function resolveTheme(name) {
  return THEMES[name] || THEMES.red;
}

export class KatPixelPortrait extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'background', 'pixel-scale', 'src', 'theme'];
  }

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._style = document.createElement('style');
    this._style.textContent = STYLE;

    this._identity = document.createElement('div');
    this._identity.className = 'identity';
    this._identity.innerHTML = `
      <p class="name">Krishhna Atul Tupe</p>
      <p class="aka">(KAT)</p>
    `;

    this._portrait = document.createElement('div');
    this._portrait.className = 'portrait';
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: false });
    this._portrait.appendChild(this._canvas);

    this._root.append(this._style, this._identity, this._portrait);

    this._image = null;
    this._sourceCanvas = null;
    this._themedCanvas = null;
    this._themedThemeId = null;
    this._loadToken = 0;
    this._ro = null;
    this._options = { ...DEFAULTS };
  }

  connectedCallback() {
    this._syncFromAttributes();
    this._ro = new ResizeObserver(() => this._paint());
    this._ro.observe(this._portrait);
    this._loadImage();
  }

  disconnectedCallback() {
    this._ro?.disconnect();
    this._ro = null;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._syncFromAttributes();
    if (name === 'src') {
      this._loadImage();
    } else if (name === 'theme') {
      this._themedThemeId = null;
      this._paint();
    } else {
      this._paint();
    }
  }

  /**
   * Imperative API.
   * @param {{ size?: number, background?: string, pixelScale?: number, src?: string, theme?: 'red'|'blue' }} [options]
   */
  configure(options = {}) {
    if (options.size != null) this.setAttribute('size', String(options.size));
    if (options.background != null) this.setAttribute('background', options.background);
    if (options.pixelScale != null) this.setAttribute('pixel-scale', String(options.pixelScale));
    if (options.src != null) this.setAttribute('src', options.src);
    if (options.theme != null) this.setAttribute('theme', options.theme);
    return this;
  }

  get size() {
    return this._options.size;
  }

  set size(value) {
    if (value == null) this.removeAttribute('size');
    else this.setAttribute('size', String(value));
  }

  get background() {
    return this._options.background ?? resolveTheme(this._options.theme).background;
  }

  set background(value) {
    this.setAttribute('background', value);
  }

  get pixelScale() {
    return this._options.pixelScale;
  }

  set pixelScale(value) {
    this.setAttribute('pixel-scale', String(value));
  }

  get src() {
    return this._options.src;
  }

  set src(value) {
    this.setAttribute('src', value);
  }

  get theme() {
    return this._options.theme;
  }

  set theme(value) {
    this.setAttribute('theme', value === 'blue' ? 'blue' : 'red');
  }

  _syncFromAttributes() {
    const sizeAttr = this.getAttribute('size');
    this._options.size = sizeAttr != null ? parsePositiveNumber(sizeAttr, null) : null;

    const bgAttr = this.getAttribute('background');
    this._options.background = bgAttr || null;

    this._options.pixelScale = Math.max(
      1,
      Math.round(parsePositiveNumber(this.getAttribute('pixel-scale'), DEFAULTS.pixelScale)),
    );

    this._options.src = this.getAttribute('src') || DEFAULTS.src;

    const themeAttr = (this.getAttribute('theme') || DEFAULTS.theme).toLowerCase();
    this._options.theme = themeAttr === 'blue' ? 'blue' : 'red';

    const theme = resolveTheme(this._options.theme);
    const bg = this._options.background || theme.background;
    this.style.setProperty('--kat-bg', bg);
    this.style.setProperty('--kat-text', theme.text);
    this.style.setProperty('--kat-text-muted', theme.textMuted);

    if (this._options.size != null) {
      this._portrait.style.width = `${this._options.size}px`;
    } else {
      this._portrait.style.width = '';
    }
  }

  async _loadImage() {
    const token = ++this._loadToken;
    const src = this._options.src;
    const image = new Image();
    image.decoding = 'async';

    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;
      });
      if (token !== this._loadToken) return;
      this._image = image;
      this._sourceCanvas = null;
      this._themedCanvas = null;
      this._themedThemeId = null;
      this._ensureSourceCanvas();
      this._paint();
    } catch (err) {
      if (token !== this._loadToken) return;
      console.error('[KatPixelPortrait]', err);
    }
  }

  _ensureSourceCanvas() {
    const image = this._image;
    if (!image || image.naturalWidth <= 0) return null;

    if (
      this._sourceCanvas &&
      this._sourceCanvas.width === image.naturalWidth &&
      this._sourceCanvas.height === image.naturalHeight
    ) {
      return this._sourceCanvas;
    }

    const c = document.createElement('canvas');
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    this._sourceCanvas = c;
    return c;
  }

  /** Build (or reuse) a themed bitmap from the single source asset. */
  _ensureThemedCanvas() {
    const source = this._ensureSourceCanvas();
    if (!source) return null;

    const theme = resolveTheme(this._options.theme);
    if (this._themedCanvas && this._themedThemeId === theme.id) {
      return this._themedCanvas;
    }

    const w = source.width;
    const h = source.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;

    if (!theme.recolor) {
      ctx.drawImage(source, 0, 0);
    } else {
      const srcCtx = source.getContext('2d', { willReadFrequently: true });
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

    this._themedCanvas = out;
    this._themedThemeId = theme.id;
    return out;
  }

  _paint() {
    const ctx = this._ctx;
    const canvas = this._canvas;
    if (!ctx) return;

    const theme = resolveTheme(this._options.theme);
    const bg = this._options.background || theme.background;

    const rect = this._portrait.getBoundingClientRect();
    const cssSize = Math.max(
      1,
      Math.round(Math.min(rect.width, rect.height) || this._options.size || 1),
    );
    const pixelScale = this._options.pixelScale;
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

    const themed = this._ensureThemedCanvas();
    if (!themed) return;

    const scale = Math.min(bufferSize / themed.width, bufferSize / themed.height);
    const drawW = Math.max(1, Math.round(themed.width * scale));
    const drawH = Math.max(1, Math.round(themed.height * scale));
    const dx = Math.floor((bufferSize - drawW) / 2);
    const dy = Math.floor((bufferSize - drawH) / 2);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(themed, dx, dy, drawW, drawH);
  }
}

if (!customElements.get('kat-pixel-portrait')) {
  customElements.define('kat-pixel-portrait', KatPixelPortrait);
}

/**
 * Factory helper for non-declarative use.
 * @param {{ size?: number, background?: string, pixelScale?: number, src?: string, theme?: 'red'|'blue' }} [options]
 * @returns {KatPixelPortrait}
 */
export function createKatPixelPortrait(options = {}) {
  const el = document.createElement('kat-pixel-portrait');
  el.configure(options);
  return el;
}

export { THEMES };
export default KatPixelPortrait;
