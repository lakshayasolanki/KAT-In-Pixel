import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import defaultPortraitSrc from '../assets/kat-portrait.png';
import {
  createBlinkController,
  getDebugBlinkMask,
  type BlinkController,
  type BlinkPhase,
  type DebugBlinkMaskId,
} from './eyeBlink';
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
  /**
   * Temporary DEBUG BLINK: when true, click-blink is disabled, phase stays OPEN,
   * and optional mask overlay is drawn from the real blink masks.
   */
  debugBlink?: boolean;
  debugMaskId?: DebugBlinkMaskId;
  debugPixelGrid?: boolean;
};

/**
 * KatPixelPortrait — reusable React + Canvas pixel-art portrait.
 * Preserves the original vanilla visual output and rendering pipeline.
 * Click the portrait to trigger one blink (disabled while DEBUG BLINK is on).
 */
export function KatPixelPortrait({
  theme = 'red',
  size = null,
  background = null,
  pixelScale = 1,
  src = defaultPortraitSrc,
  className,
  debugBlink = false,
  debugMaskId = 'OPEN',
  debugPixelGrid = false,
}: KatPixelPortraitProps) {
  const portraitRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<PortraitRenderCache>(createPortraitRenderCache());
  const loadTokenRef = useRef(0);
  const blinkRef = useRef<BlinkController | null>(null);
  const blinkPhaseRef = useRef<BlinkPhase>('OPEN');
  const debugBlinkRef = useRef(debugBlink);
  debugBlinkRef.current = debugBlink;

  const optionsRef = useRef<PortraitPaintOptions>({
    theme,
    background,
    pixelScale: 1,
    size,
    blinkPhase: 'OPEN',
    debugMaskOverlay: null,
  });

  const resolvedTheme = resolveTheme(theme);
  const resolvedBg = background || resolvedTheme.background;
  const safePixelScale = Math.max(1, Math.round(pixelScale));

  const debugSpans = debugBlink ? getDebugBlinkMask(debugMaskId) : [];
  optionsRef.current = {
    theme,
    background,
    pixelScale: safePixelScale,
    size,
    // Debug mode: never run the blink frame path — OPEN portrait + overlay only.
    blinkPhase: debugBlink ? 'OPEN' : blinkPhaseRef.current,
    debugMaskOverlay: debugBlink
      ? {
          spans: debugSpans,
          pixelGrid: debugPixelGrid,
          gridX0: 450,
          gridX1: 525,
          gridY0: 640,
          gridY1: 690,
        }
      : null,
  };

  const paint = () => {
    const canvas = canvasRef.current;
    const portraitEl = portraitRef.current;
    if (!canvas || !portraitEl) return;
    if (!debugBlinkRef.current) {
      optionsRef.current.blinkPhase = blinkPhaseRef.current;
      optionsRef.current.debugMaskOverlay = null;
    }
    paintPortrait(canvas, portraitEl, cacheRef.current, optionsRef.current);
  };

  // Blink controller: phase changes repaint via refs (no React re-renders).
  useEffect(() => {
    const controller = createBlinkController({
      onPhaseChange: (phase) => {
        blinkPhaseRef.current = phase;
        if (!debugBlinkRef.current) paint();
      },
    });
    blinkRef.current = controller;
    return () => {
      controller.dispose();
      blinkRef.current = null;
      blinkPhaseRef.current = 'OPEN';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entering debug: cancel any in-flight blink; stay on OPEN + overlay.
  useEffect(() => {
    if (debugBlink) {
      blinkRef.current?.dispose();
      blinkPhaseRef.current = 'OPEN';
    }
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugBlink, debugMaskId, debugPixelGrid]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, background, safePixelScale, size]);

  const handlePortraitClick = () => {
    if (debugBlinkRef.current) return;
    blinkRef.current?.trigger();
  };

  const handlePortraitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (debugBlinkRef.current) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      blinkRef.current?.trigger();
    }
  };

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
        onClick={handlePortraitClick}
        onKeyDown={handlePortraitKeyDown}
        role="button"
        tabIndex={0}
        aria-label={debugBlink ? 'Blink debug overlay' : 'Play eye blink'}
      >
        <canvas ref={canvasRef} className="kat-pixel-portrait__canvas" />
      </div>
    </div>
  );
}

export default KatPixelPortrait;
