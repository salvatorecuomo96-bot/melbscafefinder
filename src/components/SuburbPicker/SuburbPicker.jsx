import { TOP_SUBURBS } from '../../constants/filters.js';
import './SuburbPicker.css';

export default function SuburbPicker({ active, onSelect }) {
  return (
    <div className="suburb-picker">
      {TOP_SUBURBS.map((suburb) => (
        <button
          key={suburb}
          className={`suburb-picker__pill${active === suburb ? ' is-on' : ''}`}
          onClick={() => onSelect(suburb)}
        >
          {suburb}
        </button>
      ))}
    </div>
  );
}
