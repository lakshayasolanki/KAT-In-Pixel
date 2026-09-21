/**
 * KatPixelPortrait — self-contained canvas pixel-art portrait.
 *
 * Usage (custom element):
 *   <kat-pixel-portrait size="400" background="#3e0001" pixel-scale="1"></kat-pixel-portrait>
 *
 * Usage (programmatic):
 *   import { createKatPixelPortrait } from './KatPixelPortrait.js';
 *   const el = createKatPixelPortrait({ size: 400, background: '#3e0001', pixelScale: 1 });
 *   document.body.appendChild(el);
 */

const DEFAULTS = Object.freeze({
  /** Display size in CSS pixels (square). Ignored when width is 100% via CSS. */
  size: null,
  /** Fill color behind the portrait (dark red/black). */
  background: '#3e0001',
  /**
   * CSS pixels per logical pixel. The canvas bitmap is sized to
   * displaySize / pixelScale, then CSS-upscaled with nearest-neighbor so
   * each texel stays a hard square. Use integers (≥1).
   */
  pixelScale: 1,
  /** Path to the local portrait asset (relative to the consuming page). */
  src: new URL('../assets/kat-portrait.png', import.meta.url).href,
});

const STYLE = `
:host {
  display: block;
  width: 100%;
  max-width: 100%;
  line-height: 0;
  aspect-ratio: 1 / 1;
  background: var(--kat-bg, ${DEFAULTS.background});
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
`;

function parsePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class KatPixelPortrait extends HTMLElement {
  static get observedAttributes() {
    return ['size', 'background', 'pixel-scale', 'src'];
  }

  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._style = document.createElement('style');
    this._style.textContent = STYLE;
    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._root.append(this._style, this._canvas);

    this._image = null;
    this._loadToken = 0;
    this._ro = null;
    this._options = { ...DEFAULTS };
  }

  connectedCallback() {
    this._syncFromAttributes();
    this._ro = new ResizeObserver(() => this._paint());
    this._ro.observe(this);
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
    } else {
      this._paint();
    }
  }

  /** Imperative API for size / background / pixelScale / src. */
  configure(options = {}) {
    if (options.size != null) this.setAttribute('size', String(options.size));
    if (options.background != null) this.setAttribute('background', options.background);
    if (options.pixelScale != null) this.setAttribute('pixel-scale', String(options.pixelScale));
    if (options.src != null) this.setAttribute('src', options.src);
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
    return this._options.background;
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

  _syncFromAttributes() {
    const sizeAttr = this.getAttribute('size');
    this._options.size = sizeAttr != null ? parsePositiveNumber(sizeAttr, null) : null;
    this._options.background =
      this.getAttribute('background') || DEFAULTS.background;
    this._options.pixelScale = Math.max(
      1,
      Math.round(parsePositiveNumber(this.getAttribute('pixel-scale'), DEFAULTS.pixelScale)),
    );
    this._options.src = this.getAttribute('src') || DEFAULTS.src;

    this.style.setProperty('--kat-bg', this._options.background);
    if (this._options.size != null) {
      this.style.width = `${this._options.size}px`;
    } else if (!this.style.width) {
      this.style.width = '100%';
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
      this._paint();
    } catch (err) {
      if (token !== this._loadToken) return;
      console.error('[KatPixelPortrait]', err);
    }
  }

  _paint() {
    const image = this._image;
    const ctx = this._ctx;
    const canvas = this._canvas;
    if (!ctx) return;

    const rect = this.getBoundingClientRect();
    const cssSize = Math.max(
      1,
      Math.round(Math.min(rect.width, rect.height) || this._options.size || 1),
    );

    const pixelScale = this._options.pixelScale;
    const bg = this._options.background;

    // Low-res bitmap → CSS upscale keeps hard square pixels (nearest-neighbor).
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

    if (image && image.naturalWidth > 0) {
      // Contain within the square buffer; source asset is 1:1.
      const scale = Math.min(
        bufferSize / image.naturalWidth,
        bufferSize / image.naturalHeight,
      );
      const drawW = Math.max(1, Math.round(image.naturalWidth * scale));
      const drawH = Math.max(1, Math.round(image.naturalHeight * scale));
      const dx = Math.floor((bufferSize - drawW) / 2);
      const dy = Math.floor((bufferSize - drawH) / 2);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, dx, dy, drawW, drawH);
    }
  }
}

if (!customElements.get('kat-pixel-portrait')) {
  customElements.define('kat-pixel-portrait', KatPixelPortrait);
}

/**
 * Factory helper for non-declarative use.
 * @param {{ size?: number, background?: string, pixelScale?: number, src?: string }} [options]
 * @returns {KatPixelPortrait}
 */
export function createKatPixelPortrait(options = {}) {
  const el = document.createElement('kat-pixel-portrait');
  el.configure(options);
  return el;
}

export default KatPixelPortrait;
