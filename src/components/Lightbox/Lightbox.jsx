import { useEffect, useRef, useState } from 'react';
import './Lightbox.css';

export default function Lightbox({ images, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const touchX = useRef(null);

  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setIdx((i) => (i + 1) % images.length);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   prev();
      if (e.key === 'ArrowRight')  next();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) dx < 0 ? next() : prev();
    touchX.current = null;
  };

  const single = images.length === 1;

  return (
    <div
      className="lb"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
    >
      <button className="lb__close" onClick={onClose} aria-label="Close">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="lb__stage" onClick={(e) => e.stopPropagation()}>
        <img
          key={idx}
          className="lb__img"
          src={images[idx]}
          alt={`Photo ${idx + 1}`}
        />
      </div>

      {!single && (
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
