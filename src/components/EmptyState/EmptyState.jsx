import './EmptyState.css';

export default function EmptyState({ onReset, activeFilters = [] }) {
  return (
    <div className="empty">
      <div className="empty__cup" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
          <path d="M14 22h32a8 8 0 0 1 0 16h-2v4a10 10 0 0 1-10 10H24a10 10 0 0 1-10-10V22zm32 6v8a2 2 0 0 0 0-8z" stroke="currentColor" strokeWidth="2" />
          <path d="M22 8c0 3 3 4 3 7s-3 4-3 7M32 8c0 3 3 4 3 7s-3 4-3 7M42 8c0 3 3 4 3 7s-3 4-3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <h3>No cafes found</h3>

      {activeFilters.length > 1 ? (
        <p>Your filters are a bit too specific together.<br />Try removing one:</p>
      ) : (
        <p>Nothing matches — try loosening a filter or zooming out on the map.</p>
      )}

      {activeFilters.length > 0 && (
        <div className="empty__chips">
          {activeFilters.map((f, i) => (
            <button key={i} className="empty__chip" onClick={f.onRemove}>
              {f.label}
              <span className="empty__chip-x" aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <button className="empty__cta" onClick={onReset}>
        Clear all filters
      </button>
    </div>
  );
}
