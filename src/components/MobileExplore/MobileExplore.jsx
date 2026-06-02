import SearchBar from '../SearchBar/SearchBar.jsx';
import EmptyState from '../EmptyState/EmptyState.jsx';
import SuburbPicker from '../SuburbPicker/SuburbPicker.jsx';
import { getActiveFilterChips } from '../../utils/filterChips.js';
import { formatDistance } from '../../utils/distance.js';
import './MobileExplore.css';

const GRID_CAP = 80;

function reviewBucket(n) {
  if (!n || n < 10) return null;
  if (n >= 1000) return '1000+';
  if (n >= 500) return '500+';
  if (n >= 100) return '100+';
  if (n >= 50) return '50+';
  return '10+';
}

export default function MobileExplore({
  cafes,
  isSaved,
  onToggleSave,
  onOpen,
  onOpenFilters,
  onOpenSubmit,
  api,
  hidden,
  geoStatus,
  nearMeActive,
  onNearMe,
}) {
  const suburbs = [...new Set(cafes.map((c) => c.suburb).filter(Boolean))];
  const filtersOrSearch = api.activeCount > 0 || api.filters.query || api.filters.suburb;

  const sorted = api.visibleCafes.slice(0, GRID_CAP);
  const total  = api.visibleCafes.length;

  return (
    <div className={`mobile-explore${hidden ? ' mobile-explore--hidden' : ''}`}>
      <header className="mobile-explore__header">
        <img src="/logo-icon.png" className="mobile-explore__logo-icon" alt="" aria-hidden="true" />
        <span className="mobile-explore__wordmark"><span className="mobile-explore__wm-brown">Kooka</span>brew</span>
      </header>

      <div className="mobile-explore__search">
        <SearchBar
          value={api.filters.query}
          onChange={api.setQuery}
          placeholder="Search cafe or suburb"
        />
      </div>

      <div className="mobile-explore__actions">
        <button
          className={`mexplore__btn${api.activeCount > 0 ? ' is-active' : ''}`}
          onClick={onOpenFilters}
        >
          <FilterIcon />
          Filters
          {api.activeCount > 0 && (
            <span className="mexplore__badge">{api.activeCount}</span>
          )}
        </button>
        <button
          className={`mexplore__btn${api.filters.openNow ? ' is-active' : ''}`}
          onClick={api.toggleOpenNow}
        >
          Open now
        </button>
        <button
          className="mexplore__btn"
          onClick={onNearMe}
          disabled={geoStatus === 'asking'}
        >
          <LocIcon />
          {geoStatus === 'asking' ? 'Locating…' : 'Near me'}
        </button>
        {filtersOrSearch && (
          <button className="mexplore__reset" onClick={api.reset}>
            Clear
          </button>
        )}
      </div>

      <div className="mobile-explore__suburbs">
        <SuburbPicker active={api.filters.suburb} onSelect={api.setSuburb} suburbs={suburbs} />
      </div>

      <div className="mobile-explore__meta">
        <span className="mobile-explore__count">
          {total} {total === 1 ? 'cafe' : 'cafes'}
          {api.filters.suburb ? ` in ${api.filters.suburb}` : ''}
        </span>
        <button className="mexplore__submit" onClick={onOpenSubmit}>+ Submit a cafe</button>
      </div>

      <div className="mobile-explore__feed">
        {filtersOrSearch && api.visibleCafes.length === 0 ? (
          <div style={{ padding: '0 14px' }}>
            <EmptyState
              onReset={api.reset}
              activeFilters={getActiveFilterChips(api)}
            />
          </div>
        ) : (
          <div className="cafe-grid">
            {sorted.map((cafe) => (
              <GridCard
                key={cafe.id}
                cafe={cafe}
                isSaved={isSaved(cafe.id)}
                onToggleSave={onToggleSave}
                onOpen={() => onOpen(cafe)}
                showDist={nearMeActive}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GridCard({ cafe, isSaved, onToggleSave, onOpen, showDist }) {
  const bucket = reviewBucket(cafe.userRatingsTotal ?? cafe.reviewCount);
  return (
    <article className="grid-card" onClick={onOpen}>
      <div className="grid-card__photo">
        {cafe.images?.[0] ? (
          <img src={cafe.images[0]} alt={cafe.name} loading="lazy" />
        ) : (
          <div className="grid-card__placeholder" />
        )}
        <div className="grid-card__overlay">
          <div className="grid-card__info">
            <span className="grid-card__name">{cafe.name}</span>
            <div className="grid-card__bottom-row">
              <span className="grid-card__sub">
                {showDist && cafe.distanceKm != null
                  ? formatDistance(cafe.distanceKm)
                  : cafe.suburb}
              </span>
              {cafe.rating != null && (
                <span className="grid-card__rating">
                  <StarIcon />
                  {cafe.rating.toFixed(1)}
                  {bucket && <span className="grid-card__rcount">{bucket}</span>}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <button
        className={`grid-card__save${isSaved ? ' is-saved' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSave(cafe.id); }}
        aria-label={isSaved ? 'Unsave' : 'Save'}
      >
        <HeartIcon filled={isSaved} />
      </button>
    </article>
  );
}

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="7" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

function LocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}
