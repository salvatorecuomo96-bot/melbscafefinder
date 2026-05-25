import './SuburbPicker.css';

export default function SuburbPicker({ active, onSelect, suburbs }) {
  const sorted = [...suburbs].sort((a, b) => a.localeCompare(b));

  return (
    <div className="suburb-picker">
      <select
        className={`suburb-picker__select${active ? ' is-active' : ''}`}
        value={active || ''}
        onChange={(e) => onSelect(e.target.value || null)}
      >
        <option value="">All suburbs</option>
        {sorted.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <span className="suburb-picker__chevron" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </div>
  );
}
