import { useEffect, useState } from 'react';
import { COFFEE_BRANDS } from '../../constants/filters.js';
import './FilterDrawer.css';

export default function FilterDrawer({ open, onClose, api }) {
  const [brandsOpen, setBrandsOpen] = useState(false);

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
    toggleCoffeeBrand, setMinRating, setMinReviews,
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

          <section className="drawer__group">
            <h3>Number of reviews</h3>
            <div className="drawer__segment">
              {[0, 100, 200, 500].map((val) => (
                <button
                  key={val}
                  className={`drawer__seg-btn${filters.minReviews === val ? ' is-on' : ''}`}
                  onClick={() => setMinReviews(val)}
                  aria-pressed={filters.minReviews === val}
                >
                  {val === 0 ? 'Any' : `${val}+`}
                </button>
              ))}
            </div>
          </section>

          {/* ── Coffee brand (collapsed by default) ── */}
          <button
            className={`drawer__clues-toggle${brandsOpen ? ' is-open' : ''}`}
            onClick={() => setBrandsOpen((o) => !o)}
            aria-expanded={brandsOpen}
          >
            <span className="drawer__clues-toggle-label">
              <span className="drawer__clues-toggle-title">Coffee brand</span>
              <span className="drawer__clues-toggle-sub">limited coverage</span>
            </span>
            <ChevronIcon />
          </button>

          {brandsOpen && (
            <div className="drawer__clue-sections">
              <section className="drawer__group">
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
              </section>
            </div>
          )}
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

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
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
