import { useEffect, useState } from 'react';
import { KatPixelPortrait, type ThemeId } from './components';
import './App.css';

export default function App() {
  const [theme, setTheme] = useState<ThemeId>('red');

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="frame">
      <KatPixelPortrait theme={theme} pixelScale={1} />

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
      </div>
      <p className="hint">kat-pixel-portrait · canvas · nearest-neighbor · red/blue theme</p>
    </div>
  );
}
