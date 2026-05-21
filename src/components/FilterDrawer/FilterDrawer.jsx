import { useEffect } from 'react';
import {
  BOOLEAN_FILTERS,
  PLANT_MILK_OPTIONS,
  PRICE_LEVELS
} from '../../constants/filters.js';
import './FilterDrawer.css';

/**
 * Bottom-sheet style drawer holding every filter.
 * Receives the full filter API from useCafeFilters().
 */
export default function FilterDrawer({ open, onClose, api }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const {
    filters,
    toggleBoolean,
    togglePlantMilk,
    togglePriceLevel,
    setMinRating,
    setMinCoffeeQuality,
    reset,
    activeCount,
    visibleCafes
  } = api;

  return (
    <div className="drawer" onClick={onClose} role="dialog" aria-modal="true" aria-label="Filters">
      <div className="drawer__sheet" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <div className="drawer__handle" aria-hidden="true" />
          <h2>Filters</h2>
          <button className="drawer__close" onClick={onClose} aria-label="Close filters">×</button>
        </header>

        <div className="drawer__body">
          <section className="drawer__group">
            <h3>Amenities &amp; vibe</h3>
            <div className="drawer__pills">
              {BOOLEAN_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`drawer__pill ${filters.booleans[f.key] ? 'is-on' : ''}`}
                  onClick={() => toggleBoolean(f.key)}
                  aria-pressed={!!filters.booleans[f.key]}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          <section className="drawer__group">
            <h3>Plant milk</h3>
            <div className="drawer__pills">
              {PLANT_MILK_OPTIONS.map((m) => (
                <button
                  key={m}
                  className={`drawer__pill ${filters.plantMilk.includes(m) ? 'is-on' : ''}`}
                  onClick={() => togglePlantMilk(m)}
                >
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </section>

          <section className="drawer__group">
            <h3>Price</h3>
            <div className="drawer__pills">
              {PRICE_LEVELS.map((p) => (
                <button
                  key={p.value}
                  className={`drawer__pill ${filters.priceLevels.includes(p.value) ? 'is-on' : ''}`}
                  onClick={() => togglePriceLevel(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </section>

          <section className="drawer__group">
            <h3>Minimum overall rating</h3>
            <SliderRow
              value={filters.minRating}
              onChange={setMinRating}
              max={5}
              step={0.5}
              format={(v) => (v ? `${v}+ stars` : 'Any')}
            />
          </section>

          <section className="drawer__group">
            <h3>Minimum coffee quality</h3>
            <SliderRow
              value={filters.minCoffeeQuality}
              onChange={setMinCoffeeQuality}
              max={5}
              step={1}
              format={(v) => (v ? `${v}+ / 5` : 'Any')}
            />
          </section>
        </div>

        <footer className="drawer__foot">
          <button className="drawer__reset" onClick={reset} disabled={activeCount === 0}>
            Clear all{activeCount ? ` (${activeCount})` : ''}
          </button>
          <button className="drawer__apply" onClick={onClose}>
            Show {visibleCafes.length} {visibleCafes.length === 1 ? 'cafe' : 'cafes'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SliderRow({ value, onChange, max, step, format }) {
  return (
    <div className="slider">
      <input
        type="range"
        min="0"
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider__value">{format(value)}</span>
    </div>
  );
}
