import './SuburbPicker.css';

const INNER_SUBURBS = [
  'Melbourne',
  'Southbank', 'Docklands', 'East Melbourne', 'West Melbourne',
  'Carlton', 'North Melbourne', 'Fitzroy', 'Collingwood', 'Richmond', 'South Melbourne', 'Cremorne',
  'Brunswick', 'Parkville', 'Fitzroy North', 'Abbotsford', 'Prahran', 'South Yarra', 'Albert Park', 'Port Melbourne', 'Kensington',
  'St Kilda', 'Windsor', 'Balaclava', 'Flemington', 'Clifton Hill', 'Hawthorn',
];

export default function SuburbPicker({ active, onSelect, suburbs }) {
  const prioritySet = new Set(INNER_SUBURBS);
  const inner = INNER_SUBURBS.filter((s) => suburbs.includes(s));
  const rest  = [...suburbs].filter((s) => !prioritySet.has(s)).sort((a, b) => a.localeCompare(b));
  const sorted = [...inner, ...rest];

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
