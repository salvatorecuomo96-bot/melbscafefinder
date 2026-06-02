import { useState, useRef, useEffect } from 'react';
import './BottomSheet.css';

const PEEK_PX     = 60;
const MEDIUM_FRAC = 0.46; // fraction of window height for snap 1

export default function BottomSheet({ snap, onSnap, onClose, children }) {
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const sheetRef = useRef(null);
  
  // Track actual height of the sheet
  const [sheetH, setSheetH] = useState(0);

  useEffect(() => {
    if (sheetRef.current) setSheetH(sheetRef.current.offsetHeight);
    const handleResize = () => {
      if (sheetRef.current) setSheetH(sheetRef.current.offsetHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [snap]); // Re-measure if snap changes (just in case content affects height)

  // Fallback to a safe estimate before first measure
  const effectiveH = sheetH || (window.innerHeight * 0.7);

  const base = 
    snap === 0 ? effectiveH - PEEK_PX :
    snap === 1 ? effectiveH - (window.innerHeight * MEDIUM_FRAC) :
    0; // snap 2 = fully expanded

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
      ref={sheetRef}
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
        <button
          className="bottom-sheet__close"
          onClick={onClose}
          aria-label="Close list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="bottom-sheet__body">
        {children}
      </div>
    </div>
  );
}
