import SearchBar from '../SearchBar/SearchBar.jsx';
import ExploreSection from '../ExploreSection/ExploreSection.jsx';
import EmptyState from '../EmptyState/EmptyState.jsx';
import { getActiveFilterChips } from '../../utils/filterChips.js';
import './MobileExplore.css';

export default function MobileExplore({
  cafes,
  isSaved,
  onToggleSave,
  onOpen,
  onOpenFilters,
  api,
  hidden,
  geoStatus,
  nearMeActive,
  onNearMe,
}) {
  const byRating  = (a, b) => (b.rating ?? -1) - (a.rating ?? -1);
  const byDist    = (a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
  const hasCoords = cafes.some((c) => c.distanceKm != null);

  const filtersOrSearch = api.activeCount > 0 || api.filters.query;

  const nearYou      = hasCoords ? [...cafes].sort(byDist).slice(0, 10) : [];
  const topRated     = [...cafes].sort(byRating).slice(0, 12);
  const specialty    = cafes.filter((c) => c.specialtyCoffee).sort(byRating).slice(0, 10);
  const bestWork     = cafes.filter((c) => c.hasWifi && c.laptopFriendly).sort(byRating).slice(0, 10);
  const dogFriendly  = cafes.filter((c) => c.dogFriendly).sort(byRating).slice(0, 10);
const matchaPastry = cafes.filter((c) => c.matcha && c.pastries).sort(byRating).slice(0, 10);
  const outdoor      = cafes.filter((c) => c.outdoorSeating).sort(byRating).slice(0, 10);
  const savedCafes   = cafes.filter((c) => isSaved(c.id));

  return (
    <div className={`mobile-explore${hidden ? ' mobile-explore--hidden' : ''}`}>
      <header className="mobile-explore__header">
        <span className="mobile-explore__logo" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#1a1a1a" />
            <path d="M20 22h22a6 6 0 0 1 0 12h-2v4a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V22zm22 4v6a2 2 0 0 0 0-6z" fill="#e8c39e" />
          </svg>
        </span>
        <span className="mobile-explore__wordmark">Melbourne <em>Cafe</em> Finder</span>
      </header>

      <div className="mobile-explore__search">
        <SearchBar
          value={api.filters.query}
          onChange={api.setQuery}
          placeholder="Search cafe, suburb..."
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
          className={`mexplore__btn${nearMeActive ? ' is-active' : ''}`}
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

      <div className="mobile-explore__feed">
        {filtersOrSearch && api.visibleCafes.length === 0 ? (
          <div style={{ padding: '0 14px' }}>
            <EmptyState
              onReset={api.reset}
              activeFilters={getActiveFilterChips(api)}
            />
          </div>
        ) : filtersOrSearch ? (
          <ExploreSection
            title={`${api.visibleCafes.length} ${api.visibleCafes.length === 1 ? 'cafe' : 'cafes'} found`}
            cafes={api.visibleCafes.slice(0, 30)}
            isSaved={isSaved}
            onToggleSave={onToggleSave}
            onOpen={onOpen}
          />
        ) : (
          <>
            {nearYou.length > 0 && (
              <ExploreSection title="Near you" cafes={nearYou} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            )}
            <ExploreSection title="Top rated" cafes={topRated} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            <ExploreSection title="Specialty coffee" cafes={specialty} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
<ExploreSection title="Work-friendly" cafes={bestWork} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            <ExploreSection title="Dog friendly" cafes={dogFriendly} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            <ExploreSection title="Matcha + pastry" cafes={matchaPastry} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            <ExploreSection title="Outdoor seating" cafes={outdoor} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            {savedCafes.length > 0 && (
              <ExploreSection title="Your saved spots" cafes={savedCafes} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
            )}
          </>
        )}
      </div>
    </div>
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
