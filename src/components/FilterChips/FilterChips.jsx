import './FilterChips.css';

export default function FilterChips({ onOpenAll, activeCount }) {
  return (
    <div className="chips" role="toolbar" aria-label="Filters">
      <button className="chips__all" onClick={onOpenAll}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M6 12h12M10 18h4" />
        </svg>
        Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
      </button>
    </div>
  );
}
