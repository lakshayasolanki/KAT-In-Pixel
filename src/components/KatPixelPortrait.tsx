import { useEffect, useRef, type CSSProperties } from 'react';
import defaultPortraitSrc from '../assets/kat-portrait.png';
import {
  createPortraitRenderCache,
  invalidateThemedCache,
  loadPortraitImage,
  paintPortrait,
  resetImageCache,
  type PortraitPaintOptions,
  type PortraitRenderCache,
} from './portraitCanvas';
import { resolveTheme, type ThemeId } from './themes';
import './KatPixelPortrait.css';

export type KatPixelPortraitProps = {
  /** Visual theme: 'red' (default) or 'blue'. */
  theme?: ThemeId;
  /** Display size in CSS pixels for the portrait column. Omit for fluid. */
  size?: number | null;
  /** Explicit background override; omit to use the active theme background. */
  background?: string | null;
  /**
   * CSS pixels per logical pixel. The canvas bitmap is sized to
   * displaySize / pixelScale, then CSS-upscaled with nearest-neighbor.
   */
  pixelScale?: number;
  /** Path to the local portrait asset (single source of truth). */
  src?: string;
  className?: string;
};

/**
 * KatPixelPortrait — reusable React + Canvas pixel-art portrait.
 * Preserves the original vanilla visual output and rendering pipeline.
 */
export function KatPixelPortrait({
  theme = 'red',
  size = null,
  background = null,
  pixelScale = 1,
  src = defaultPortraitSrc,
  className,
}: KatPixelPortraitProps) {
  const portraitRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<PortraitRenderCache>(createPortraitRenderCache());
  const loadTokenRef = useRef(0);
  const optionsRef = useRef<PortraitPaintOptions>({
    theme,
    background,
    pixelScale: 1,
    size,
  });

  const resolvedTheme = resolveTheme(theme);
  const resolvedBg = background || resolvedTheme.background;
  const safePixelScale = Math.max(1, Math.round(pixelScale));

  optionsRef.current = {
    theme,
    background,
    pixelScale: safePixelScale,
    size,
  };

  const paint = () => {
    const canvas = canvasRef.current;
    const portraitEl = portraitRef.current;
    if (!canvas || !portraitEl) return;
    paintPortrait(canvas, portraitEl, cacheRef.current, optionsRef.current);
  };

  // Load / reload source image when `src` changes (matches original).
  useEffect(() => {
    const token = ++loadTokenRef.current;
    const cache = cacheRef.current;
    resetImageCache(cache);

    let cancelled = false;
    loadPortraitImage(src)
      .then((image) => {
        if (cancelled || token !== loadTokenRef.current) return;
        cache.image = image;
        paint();
      })
      .catch((err: unknown) => {
        if (cancelled || token !== loadTokenRef.current) return;
        console.error('[KatPixelPortrait]', err);
      });

    return () => {
      cancelled = true;
    };
    // paint reads latest options via optionsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Paint on theme / sizing changes and on portrait resize.
  useEffect(() => {
    const portraitEl = portraitRef.current;
    if (!portraitEl) return;

    invalidateThemedCache(cacheRef.current);
    paint();

    const ro = new ResizeObserver(() => paint());
    ro.observe(portraitEl);

    return () => {
      ro.disconnect();
    };
    // paint reads latest options via optionsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, background, safePixelScale, size]);

  const rootClassName = ['kat-pixel-portrait', className].filter(Boolean).join(' ');

  const themeVars = {
    '--kat-bg': resolvedBg,
    '--kat-text': resolvedTheme.text,
    '--kat-text-muted': resolvedTheme.textMuted,
  } as CSSProperties;

  return (
    <div className={rootClassName} style={themeVars}>
      <div className="kat-pixel-portrait__identity">
        <p className="kat-pixel-portrait__name">Krishhna Atul Tupe</p>
        <p className="kat-pixel-portrait__aka">(KAT)</p>
      </div>
      <div
        ref={portraitRef}
        className="kat-pixel-portrait__frame"
        style={size != null ? { width: `${size}px` } : undefined}
      >
        <canvas ref={canvasRef} className="kat-pixel-portrait__canvas" />
      </div>
    </div>
  );
}

export default KatPixelPortrait;
