import { useState, useRef } from 'react';
import './BottomSheet.css';

const SHEET_FRAC  = 0.92;
const PEEK_PX     = 88;
const MEDIUM_FRAC = 0.46;

function snapToTranslate(snapIdx) {
  const sheetH = window.innerHeight * SHEET_FRAC;
  if (snapIdx === 0) return sheetH - PEEK_PX;
  if (snapIdx === 1) return sheetH - window.innerHeight * MEDIUM_FRAC;
  return 0;
}

export default function BottomSheet({ snap, onSnap, count, children }) {
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);

  const base = snapToTranslate(snap);
  const live = isDragging ? Math.max(0, base + dragDelta) : base;

  function onTouchStart(e) {
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  }

  function onTouchMove(e) {
    setDragDelta(e.touches[0].clientY - startYRef.current);
  }

  function onTouchEnd() {
    setIsDragging(false);
    const d = dragDelta;
    let next = snap;
    if (d < -60 && snap < 2) next = snap + 1;
    else if (d > 60 && snap > 0) next = snap - 1;
    onSnap(next);
    setDragDelta(0);
  }

  return (
    <div
      className={`bottom-sheet${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: `translateY(${live}px)` }}
    >
      <div
        className="bottom-sheet__handle-area"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="bottom-sheet__pill" />
        {snap === 0 && count > 0 && (
          <span className="bottom-sheet__peek-label">{count} cafes in view</span>
        )}
        {snap > 0 && (
          <button
            className="bottom-sheet__close"
            onClick={() => onSnap(0)}
            aria-label="Collapse list"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      <div className="bottom-sheet__body">
        {children}
      </div>
    </div>
  );
}
