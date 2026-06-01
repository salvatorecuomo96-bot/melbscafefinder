import { useEffect } from 'react';
import {
  FILTER_SECTIONS,
  COFFEE_BRANDS,
  PRICE_LEVELS,
} from '../../constants/filters.js';
import './FilterDrawer.css';

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
    toggleCoffeeBrand, togglePriceLevel, setMinRating,
    toggleOpenNow, toggleOpenLate, reset, activeCount, visibleCafes,
  } = api;

  const brandCount = (brand) => filterCounts.brands[brand] || 0;
  const brandOptions = [
    ...new Set([
      ...COFFEE_BRANDS,
      ...Object.keys(filterCounts.brands || {}),
    ]),
  ].filter((brand) => brandCount(brand) > 0 || filters.coffeeBrands.includes(brand));

  brandOptions.sort((a, b) => {
    const byCount = brandCount(b) - brandCount(a);
    return byCount || a.localeCompare(b);
  });

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
          <div className="drawer__group-header">
            <span className="drawer__group-label">Reliable filters</span>
            <span className="drawer__group-sub">Hours, rating, price, and coffee brand</span>
          </div>

          <section className="drawer__group">
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
            <SectionBody
              key={section.id}
              section={section}
              filters={filters}
              toggleCoffeeBrand={toggleCoffeeBrand}
              togglePriceLevel={togglePriceLevel}
              brandCount={brandCount}
              brandOptions={brandOptions}
            />
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

function SectionBody({ section, filters, toggleCoffeeBrand, togglePriceLevel, brandCount, brandOptions }) {
  const hasContent = section.brands || section.price;
  if (!hasContent) return null;
  return (
    <section className="drawer__group">
      {section.label && <h3>{section.label}</h3>}
      {section.brands && (
        <div className="drawer__enum">
          <span className="drawer__enum-label">Roaster / coffee supplier</span>
          {brandOptions.length ? (
            <div className="drawer__pills">
              {brandOptions.map((brand) => (
                <button
                  key={brand}
                  className={`drawer__pill ${filters.coffeeBrands.includes(brand) ? 'is-on' : ''}`}
                  onClick={() => toggleCoffeeBrand(brand)}
                  aria-pressed={filters.coffeeBrands.includes(brand)}
                >
                  {brand}
                  <span className="drawer__pill-count">{brandCount(brand)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="drawer__empty-note">Coffee-brand data is being curated.</p>
          )}
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
