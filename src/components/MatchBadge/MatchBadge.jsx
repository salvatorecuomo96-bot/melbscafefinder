import './MatchBadge.css';

// Compact tag row for grid cards — confirmed matches only, no score
export function MatchBadge({ match }) {
  if (!match || match.confirmed.length === 0) return null;
  const tags = match.confirmed.slice(0, 3);
  return (
    <div className="match-tags">
      {tags.map((t, i) => (
        <span key={t}>
          <span className="match-tag">{t}</span>
          {i < tags.length - 1 && <span className="match-tag__dot">·</span>}
        </span>
      ))}
    </div>
  );
}

// Reasons panel for CafeDetail — confirmed + unverified, no percentage
export function MatchPanel({ match }) {
  if (!match) return null;
  if (match.confirmed.length === 0 && match.unverified.length === 0) return null;
  return (
    <div className="match-panel">
      {match.confirmed.map(r => (
        <span key={r} className="match-panel__chip match-panel__chip--confirmed">
          <CheckIcon /> {r}
        </span>
      ))}
      {match.unverified.map(r => (
        <span key={r} className="match-panel__chip match-panel__chip--unverified">
          ~ {r}
        </span>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
