import './EmptyState.css';

export default function EmptyState({ onReset }) {
  return (
    <div className="empty">
      <div className="empty__cup" aria-hidden="true">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <path d="M14 22h32a8 8 0 0 1 0 16h-2v4a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10V22zm32 6v8a2 2 0 0 0 0-8z" stroke="currentColor" strokeWidth="2" />
          <path d="M22 8c0 3 3 4 3 7s-3 4-3 7M32 8c0 3 3 4 3 7s-3 4-3 7M42 8c0 3 3 4 3 7s-3 4-3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <h3>No cafes match those filters.</h3>
      <p>Try loosening a filter or two - or clear them all and start fresh.</p>
      <button className="empty__cta" onClick={onReset}>Clear all filters</button>
    </div>
  );
}
