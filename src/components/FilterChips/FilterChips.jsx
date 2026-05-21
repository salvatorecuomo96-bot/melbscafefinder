import { BOOLEAN_FILTERS } from '../../constants/filters.js';
import './FilterChips.css';

/**
 * Horizontal scrolling row of quick-toggle filter chips.
 * The user can tap "All filters" for the full drawer.
 */
export default function FilterChips({ activeBooleans, onToggle, onOpenAll, activeCount }) {
  return (
    <div className="chips" role="toolbar" aria-label="Quick filters">
      <button
        className="chips__all"
        onClick={onOpenAll}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M6 12h12M10 18h4" />
        </svg>
        All filters{activeCount > 0 ? ` · ${activeCount}` : ''}
      </button>

      <div className="chips__scroll">
        {BOOLEAN_FILTERS.map((f) => {
          const isOn = !!activeBooleans[f.key];
          return (
            <button
              key={f.key}
              className={`chips__chip ${isOn ? 'is-on' : ''}`}
              onClick={() => onToggle(f.key)}
              aria-pressed={isOn}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
