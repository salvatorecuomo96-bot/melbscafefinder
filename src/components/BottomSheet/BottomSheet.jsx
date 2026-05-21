import { useState, useRef, useCallback } from 'react';
import './BottomSheet.css';

const SHEET_FRAC  = 0.92;  // sheet height as % of viewport
const PEEK_PX     = 88;    // collapsed: pixels of sheet visible
const MEDIUM_FRAC = 0.46;  // medium: % of viewport visible

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
          <span className="bottom-sheet__peek-label">{count} cafes nearby</span>
        )}
      </div>

      <div className="bottom-sheet__body">
        {children}
      </div>
    </div>
  );
}
