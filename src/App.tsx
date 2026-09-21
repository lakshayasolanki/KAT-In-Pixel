import { useEffect, useState } from 'react';
import { KatPixelPortrait, type ThemeId } from './components';
import { BlinkMaskDebug } from './components/BlinkMaskDebug';
import type { DebugBlinkMaskId } from './components/eyeBlink';
import './App.css';

export default function App() {
  const [theme, setTheme] = useState<ThemeId>('red');
  const [debugBlink, setDebugBlink] = useState(false);
  const [debugMaskId, setDebugMaskId] = useState<DebugBlinkMaskId>('HALF');
  const [debugPixelGrid, setDebugPixelGrid] = useState(false);
  const [debugZoomEye, setDebugZoomEye] = useState(true);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="frame">
      <KatPixelPortrait
        theme={theme}
        pixelScale={1}
        debugBlink={debugBlink}
        debugMaskId={debugMaskId}
        debugPixelGrid={debugPixelGrid}
      />

      <div className="toolbar" role="group" aria-label="Theme">
        <button
          type="button"
          aria-pressed={theme === 'red'}
          onClick={() => setTheme('red')}
        >
          Red
        </button>
        <button
          type="button"
          aria-pressed={theme === 'blue'}
          onClick={() => setTheme('blue')}
        >
          Blue
        </button>
        <button
          type="button"
          aria-pressed={debugBlink}
          onClick={() => setDebugBlink((v) => !v)}
        >
          Debug Blink
        </button>
      </div>

      {debugBlink && (
        <BlinkMaskDebug
          theme={theme}
          maskId={debugMaskId}
          onMaskIdChange={setDebugMaskId}
          pixelGrid={debugPixelGrid}
          onPixelGridChange={setDebugPixelGrid}
          zoomEye={debugZoomEye}
          onZoomEyeChange={setDebugZoomEye}
        />
      )}

      <p className="hint">
        {debugBlink
          ? 'DEBUG BLINK on · click-blink disabled · magenta = mask pixels'
          : 'kat-pixel-portrait · canvas · nearest-neighbor · red/blue theme'}
      </p>
    </div>
  );
}
