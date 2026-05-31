import { useEffect, useRef, useState } from 'react';
import './Lightbox.css';

const MAX_SCALE = 4;

export default function Lightbox({ images, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({});
  const lastTap = useRef(0);

  const resetZoom = () => setT({ scale: 1, x: 0, y: 0 });
  const prev = () => { setIdx((i) => (i - 1 + images.length) % images.length); resetZoom(); };
  const next = () => { setIdx((i) => (i + 1) % images.length); resetZoom(); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dist = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      gesture.current = { mode: 'pinch', startDist: dist(e.touches), startScale: t.scale };
    } else if (e.touches.length === 1) {
      gesture.current = {
        mode: t.scale > 1 ? 'pan' : 'swipe',
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startT: t,
      };
    }
  };

  const onTouchMove = (e) => {
    const g = gesture.current;
    if (g.mode === 'pinch' && e.touches.length === 2) {
      const scale = Math.min(MAX_SCALE, Math.max(1, g.startScale * (dist(e.touches) / g.startDist)));
      setT((p) => ({ ...p, scale }));
    } else if (g.mode === 'pan' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      setT({ scale: g.startT.scale, x: g.startT.x + dx, y: g.startT.y + dy });
    }
  };

  const onTouchEnd = (e) => {
    const g = gesture.current;
    const tx = e.changedTouches[0]?.clientX ?? 0;
    const ty = e.changedTouches[0]?.clientY ?? 0;
    const moved = Math.abs(tx - g.startX) + Math.abs(ty - g.startY);

    if (g.mode === 'swipe' && Math.abs(tx - g.startX) > 50) {
      tx - g.startX < 0 ? next() : prev();
    } else if (g.mode === 'pinch' && t.scale <= 1.05) {
      resetZoom();
    } else if ((g.mode === 'swipe' || g.mode === 'pan') && moved < 10) {
      // tap — detect double-tap to toggle zoom
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setT((p) => (p.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }));
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
    gesture.current = {};
  };

  const single = images.length === 1;
  const zoomed = t.scale > 1;

  return (
    <div
      className="lb"
      onClick={zoomed ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
    >
      <button className="lb__close" onClick={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div
        className="lb__stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img
          key={idx}
          className="lb__img"
          src={images[idx]}
          alt={`Photo ${idx + 1}`}
          draggable={false}
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
            transition: gesture.current.mode ? 'none' : 'transform 160ms ease',
            cursor: zoomed ? 'grab' : 'zoom-in',
          }}
        />
      </div>

      {!single && !zoomed && (
        <>
          <button className="lb__nav lb__nav--prev" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous photo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button className="lb__nav lb__nav--next" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next photo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div className="lb__counter">{idx + 1} / {images.length}</div>
        </>
      )}
    </div>
  );
}
