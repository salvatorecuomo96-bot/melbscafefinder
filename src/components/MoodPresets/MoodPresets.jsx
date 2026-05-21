import { MOOD_PRESETS } from '../../constants/moodPresets.js';
import './MoodPresets.css';

export default function MoodPresets({ activePresetId, onSelect }) {
  return (
    <div className="presets">
      <div className="presets__scroll" role="list" aria-label="Mood presets">
        {MOOD_PRESETS.map((preset) => {
          const active = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              role="listitem"
              className={`presets__btn${active ? ' is-active' : ''}`}
              onClick={() => onSelect(preset)}
              aria-pressed={active}
            >
              <span className="presets__emoji" aria-hidden="true">{preset.emoji}</span>
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
