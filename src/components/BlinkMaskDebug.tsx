/**
 * Temporary DEBUG BLINK mask inspector.
 * Isolated UI — remove this file (+ App wiring) when no longer needed.
 * Consumes HALF_CLOSED_MASK / CLOSED_MASK via getDebugBlinkMask (single source of truth).
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import defaultPortraitSrc from '../assets/kat-portrait.png';
import {
  buildMaskPixelSet,
  countMaskPixels,
  getDebugBlinkMask,
  type DebugBlinkMaskId,
} from './eyeBlink';
import { loadPortraitImage } from './portraitCanvas';
import { clamp01, resolveTheme, sampleStops, type ThemeId } from './themes';
import './BlinkMaskDebug.css';

export type BlinkMaskDebugProps = {
  theme: ThemeId;
  maskId: DebugBlinkMaskId;
  onMaskIdChange: (id: DebugBlinkMaskId) => void;
  pixelGrid: boolean;
  onPixelGridChange: (on: boolean) => void;
  zoomEye: boolean;
  onZoomEyeChange: (on: boolean) => void;
};

const ZOOM_X0 = 450;
const ZOOM_X1 = 525;
const ZOOM_Y0 = 640;
const ZOOM_Y1 = 690;
const ZOOM_SCALE = 10;

type HoverInfo = { x: number; y: number; masked: boolean } | null;

function themeCropToCanvas(
  image: HTMLImageElement,
  themeId: ThemeId,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): HTMLCanvasElement {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const full = document.createElement('canvas');
  full.width = image.naturalWidth;
  full.height = image.naturalHeight;
  const fctx = full.getContext('2d', { willReadFrequently: true })!;
  fctx.imageSmoothingEnabled = false;
  fctx.drawImage(image, 0, 0);

  const theme = resolveTheme(themeId);
  if (theme.recolor && theme.stops) {
    const imageData = fctx.getImageData(0, 0, full.width, full.height);
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
      if (data[i + 3] === 0) continue;
      const value = Math.max(data[i], data[i + 1], data[i + 2]);
      const t = clamp01((value - minV) / span);
      const [nr, ng, nb] = sampleStops(theme.stops, t);
      data[i] = nr;
      data[i + 1] = ng;
      data[i + 2] = nb;
    }
    fctx.putImageData(imageData, 0, 0);
  }

  const crop = document.createElement('canvas');
  crop.width = w;
  crop.height = h;
  const cctx = crop.getContext('2d')!;
  cctx.imageSmoothingEnabled = false;
  cctx.drawImage(full, x0, y0, w, h, 0, 0, w, h);
  return crop;
}

export function BlinkMaskDebug({
  theme,
  maskId,
  onMaskIdChange,
  pixelGrid,
  onPixelGridChange,
  zoomEye,
  onZoomEyeChange,
}: BlinkMaskDebugProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<HoverInfo>(null);

  const mask = useMemo(() => getDebugBlinkMask(maskId), [maskId]);
  const maskSet = useMemo(() => buildMaskPixelSet(mask), [mask]);
  const pixelCount = useMemo(() => countMaskPixels(mask), [mask]);

  useEffect(() => {
    let cancelled = false;
    loadPortraitImage(defaultPortraitSrc).then((img) => {
      if (!cancelled) setImage(img);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!zoomEye || !image || !canvasRef.current) return;

    const cropW = ZOOM_X1 - ZOOM_X0 + 1;
    const cropH = ZOOM_Y1 - ZOOM_Y0 + 1;
    const canvas = canvasRef.current;
    canvas.width = cropW * ZOOM_SCALE;
    canvas.height = cropH * ZOOM_SCALE;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const crop = themeCropToCanvas(image, theme, ZOOM_X0, ZOOM_Y0, ZOOM_X1, ZOOM_Y1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(crop, 0, 0, canvas.width, canvas.height);

    // Exact mask pixels in source coords → zoom cells
    if (mask.length > 0) {
      ctx.fillStyle = 'rgba(255, 0, 255, 0.65)';
      for (const { y, x0, x1 } of mask) {
        if (y < ZOOM_Y0 || y > ZOOM_Y1) continue;
        for (let x = x0; x <= x1; x++) {
          if (x < ZOOM_X0 || x > ZOOM_X1) continue;
          const lx = x - ZOOM_X0;
          const ly = y - ZOOM_Y0;
          ctx.fillRect(lx * ZOOM_SCALE, ly * ZOOM_SCALE, ZOOM_SCALE, ZOOM_SCALE);
        }
      }
    }

    if (pixelGrid) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= cropW; x++) {
        ctx.moveTo(x * ZOOM_SCALE + 0.5, 0);
        ctx.lineTo(x * ZOOM_SCALE + 0.5, canvas.height);
      }
      for (let y = 0; y <= cropH; y++) {
        ctx.moveTo(0, y * ZOOM_SCALE + 0.5);
        ctx.lineTo(canvas.width, y * ZOOM_SCALE + 0.5);
      }
      ctx.stroke();
    }

    // Axis ticks every 10 source pixels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '9px ui-monospace, Menlo, monospace';
    for (let x = ZOOM_X0; x <= ZOOM_X1; x += 10) {
      const lx = (x - ZOOM_X0) * ZOOM_SCALE + 2;
      ctx.fillText(String(x), lx, 10);
    }
    for (let y = ZOOM_Y0; y <= ZOOM_Y1; y += 10) {
      const ly = (y - ZOOM_Y0) * ZOOM_SCALE + 10;
      ctx.fillText(String(y), 2, ly);
    }
  }, [zoomEye, image, theme, mask, pixelGrid]);

  const pointerToSource = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (event.clientX - rect.left) * scaleX;
    const cy = (event.clientY - rect.top) * scaleY;
    const x = ZOOM_X0 + Math.floor(cx / ZOOM_SCALE);
    const y = ZOOM_Y0 + Math.floor(cy / ZOOM_SCALE);
    if (x < ZOOM_X0 || x > ZOOM_X1 || y < ZOOM_Y0 || y > ZOOM_Y1) return null;
    return { x, y, masked: maskSet.has(`${x},${y}`) };
  };

  const handlePointer = (event: PointerEvent<HTMLCanvasElement>) => {
    setHover(pointerToSource(event));
  };

  return (
    <section className="blink-mask-debug" aria-label="Blink mask debug">
      <div className="blink-mask-debug__row" role="group" aria-label="Mask state">
        {(['OPEN', 'HALF', 'CLOSED'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={maskId === id}
            onClick={() => onMaskIdChange(id)}
          >
            {id}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={pixelGrid}
          onClick={() => onPixelGridChange(!pixelGrid)}
        >
          Pixel Grid
        </button>
        <button
          type="button"
          aria-pressed={zoomEye}
          onClick={() => onZoomEyeChange(!zoomEye)}
        >
          Zoom Eye
        </button>
      </div>

      <p className="blink-mask-debug__stats">
        DEBUG: {maskId}
        <br />
        Mask pixels: {pixelCount}
      </p>

      {hover && (
        <p className="blink-mask-debug__hover">
          source: ({hover.x}, {hover.y})
          <br />
          masked: {hover.masked ? 'YES' : 'NO'}
        </p>
      )}

      {zoomEye && (
        <div className="blink-mask-debug__zoom-wrap">
          <canvas
            ref={canvasRef}
            className="blink-mask-debug__zoom"
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setHover(null)}
          />
          <p className="blink-mask-debug__zoom-caption">
            ZOOM ×{ZOOM_SCALE} · source x{ZOOM_X0}..{ZOOM_X1} y{ZOOM_Y0}..{ZOOM_Y1} · magenta =
            mask
          </p>
        </div>
      )}
    </section>
  );
}

export default BlinkMaskDebug;
