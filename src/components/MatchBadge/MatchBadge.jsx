import './MatchBadge.css';

// Compact badge for grid cards
export function MatchBadge({ match }) {
  if (!match) return null;
  return (
    <span
      className="match-badge"
      style={{ color: match.text, background: match.bg, borderColor: match.border }}
    >
      {match.score}% match
    </span>
  );
}

// Full panel for CafeDetail
export function MatchPanel({ match }) {
  if (!match) return null;
  return (
    <div
      className="match-panel"
      style={{ borderColor: match.border, background: match.bg }}
    >
      <div className="match-panel__score" style={{ color: match.text }}>
        {match.score}%
        <span className="match-panel__label">match</span>
      </div>
      <div className="match-panel__reasons">
        {match.confirmed.map(r => (
          <span key={r} className="match-panel__reason match-panel__reason--confirmed">
            <CheckIcon color={match.text} /> {r}
          </span>
        ))}
        {match.unverified.map(r => (
          <span key={r} className="match-panel__reason match-panel__reason--unverified">
            <TildeIcon /> {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function CheckIcon({ color }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TildeIcon() {
  return (
    <span aria-hidden="true" style={{ flexShrink: 0, fontSize: '11px', lineHeight: 1, color: '#9a9088' }}>~</span>
  );
}
