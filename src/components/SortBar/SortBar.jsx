import { SORT_OPTIONS } from '../../constants/filters.js';
import './SortBar.css';

export default function SortBar({ sort, onChange, count }) {
  return (
    <div className="sortbar">
      <div className="sortbar__count">
        <strong>{count}</strong> {count === 1 ? 'cafe' : 'cafes'}
      </div>

      <label className="sortbar__sort">
        <span>Sort</span>
        <select value={sort} onChange={(e) => onChange(e.target.value)}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
