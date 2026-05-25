import { useEffect } from 'react';
import {
  FILTER_SECTIONS,
  PLANT_MILK_OPTIONS,
  COFFEE_BRANDS,
  PRICE_LEVELS,
} from '../../constants/filters.js';
import './FilterDrawer.css';

const SPARSE_THRESHOLD = 40;

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
    filters, filterCounts,
    toggleBoolean, toggleEnum, toggleCoffeeBrand,
    togglePlantMilk, togglePriceLevel, setMinRating,
    toggleOpenNow, toggleOpenLate, reset, activeCount, visibleCafes,
  } = api;

  const boolCount = (key) => filterCounts.booleans[key] || 0;
  const enumCount = (key, val) => filterCounts.enums?.[key]?.[val] || 0;
  const brandCount = (brand) => filterCounts.brands[brand] || 0;
  const milkCount = (milk) => filterCounts.plantMilk[milk] || 0;

  return (
    <div className="drawer" onClick={onClose} role="dialog" aria-modal="true" aria-label="Filters">
      <div className="drawer__sheet" onClick={(e) => e.stopPropagation()}>
        <header className="drawer__head">
          <div className="drawer__handle" aria-hidden="true" />
          <div className="drawer__head-row">
            <h2>Filters</h2>
            <button className="drawer__close" onClick={onClose} aria-label="Close filters">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="drawer__body">
          <section className="drawer__group drawer__group--open">
            <div className="drawer__pills">
              <button
                className={`drawer__pill drawer__pill--open ${filters.openNow ? 'is-on' : ''}`}
                onClick={toggleOpenNow}
                aria-pressed={filters.openNow}
              >
                Open now
                <span className="drawer__pill-count">{filterCounts.openNow || 0}</span>
              </button>
              <button
                className={`drawer__pill drawer__pill--open ${filters.openLate ? 'is-on' : ''}`}
                onClick={toggleOpenLate}
                aria-pressed={filters.openLate}
              >
                Open late
                <span className="drawer__pill-count">{filterCounts.openLate || 0}</span>
              </button>
            </div>
          </section>

          {FILTER_SECTIONS.map((section) => (
            <section key={section.id} className="drawer__group">
              <h3>{section.label}</h3>

              {section.booleans?.length > 0 && (
                <div className="drawer__pills">
                  {section.booleans.map((f) => {
                    const count = boolCount(f.key);
                    const sparse = count < SPARSE_THRESHOLD;
                    return (
                      <button
                        key={f.key}
                        className={`drawer__pill ${filters.booleans[f.key] ? 'is-on' : ''} ${sparse ? 'is-sparse' : ''}`}
                        onClick={() => toggleBoolean(f.key)}
                        aria-pressed={!!filters.booleans[f.key]}
                      >
                        {f.label}
                        <span className="drawer__pill-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {section.enums?.map((enumDef) => {
                const options = enumDef.options.map((o) =>
                  typeof o === 'string' ? { value: o, label: o[0].toUpperCase() + o.slice(1) } : o
                );
                return (
                  <div key={enumDef.key} className="drawer__enum">
                    <span className="drawer__enum-label">{enumDef.label}</span>
                    <div className="drawer__pills">
                      {options.map((o) => {
                        const count = enumCount(enumDef.key, o.value);
                        const sparse = count < SPARSE_THRESHOLD;
                        return (
                          <button
                            key={o.value}
                            className={`drawer__pill ${filters.enums[enumDef.key] === o.value ? 'is-on' : ''} ${sparse ? 'is-sparse' : ''}`}
                            onClick={() => toggleEnum(enumDef.key, o.value)}
                            aria-pressed={filters.enums[enumDef.key] === o.value}
                          >
                            {o.label}
                            <span className="drawer__pill-count">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {section.brands && (
                <div className="drawer__enum">
                  <span className="drawer__enum-label">Coffee brand</span>
                  <div className="drawer__pills">
                    {COFFEE_BRANDS.map((brand) => {
                      const count = brandCount(brand);
                      const sparse = count < SPARSE_THRESHOLD;
                      return (
                        <button
                          key={brand}
                          className={`drawer__pill ${filters.coffeeBrands.includes(brand) ? 'is-on' : ''} ${sparse ? 'is-sparse' : ''}`}
                          onClick={() => toggleCoffeeBrand(brand)}
                          aria-pressed={filters.coffeeBrands.includes(brand)}
                        >
                          {brand}
                          <span className="drawer__pill-count">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {section.plantMilk && (
                <div className="drawer__enum">
                  <span className="drawer__enum-label">Plant milk</span>
                  <div className="drawer__pills">
                    {PLANT_MILK_OPTIONS.map((m) => {
                      const count = milkCount(m);
                      const sparse = count < SPARSE_THRESHOLD;
                      return (
                        <button
                          key={m}
                          className={`drawer__pill ${filters.plantMilk.includes(m) ? 'is-on' : ''} ${sparse ? 'is-sparse' : ''}`}
                          onClick={() => togglePlantMilk(m)}
                          aria-pressed={filters.plantMilk.includes(m)}
                        >
                          {m[0].toUpperCase() + m.slice(1)}
                          <span className="drawer__pill-count">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {section.price && (
                <div className="drawer__enum">
                  <span className="drawer__enum-label">Price</span>
                  <div className="drawer__pills">
                    {PRICE_LEVELS.map((p) => (
                      <button
                        key={p.value}
                        className={`drawer__pill drawer__pill--price ${filters.priceLevels.includes(p.value) ? 'is-on' : ''}`}
                        onClick={() => togglePriceLevel(p.value)}
                        aria-pressed={filters.priceLevels.includes(p.value)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}

          <section className="drawer__group">
            <h3>Minimum rating</h3>
            <SliderRow
              value={filters.minRating}
              onChange={setMinRating}
              max={5}
              step={0.5}
              format={(v) => (v ? `${v}+ ★` : 'Any')}
            />
          </section>
        </div>

        <footer className="drawer__foot">
          <button className="drawer__reset" onClick={reset} disabled={activeCount === 0}>
            Clear{activeCount ? ` (${activeCount})` : ''}
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
        type="range" min="0" max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider__value">{format(value)}</span>
    </div>
  );
}
