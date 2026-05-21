import { useState } from 'react';
import SearchBar from '../../components/SearchBar/SearchBar.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import SortBar from '../../components/SortBar/SortBar.jsx';
import CafeCard from '../../components/CafeCard/CafeCard.jsx';
import CafeDetail from '../../components/CafeDetail/CafeDetail.jsx';
import CafePreviewCard from '../../components/CafePreviewCard/CafePreviewCard.jsx';
import FilterDrawer from '../../components/FilterDrawer/FilterDrawer.jsx';
import MapView from '../../components/MapView/MapView.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import MoodPresets from '../../components/MoodPresets/MoodPresets.jsx';
import { useCafeFilters } from '../../hooks/useCafeFilters.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { useSavedCafes } from '../../hooks/useSavedCafes.js';
import './Home.css';

export default function Home() {
  const [previewCafe, setPreviewCafe]   = useState(null);
  const [detailCafe, setDetailCafe]     = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [savedView, setSavedView]       = useState(false);
  const [activePreset, setActivePreset] = useState(null);

  const { coords, status: geoStatus } = useGeolocation();
  const api = useCafeFilters({ userCoords: coords, activePreset });
  const { isSaved, toggleSave, savedCount } = useSavedCafes();

  // Toggle a mood preset. Selecting the active one clears it.
  // Uses preset.required as hard filters; ranking is handled inside useCafeFilters.
  const handlePresetSelect = (preset) => {
    if (activePreset?.id === preset.id) {
      setActivePreset(null);
      api.setBooleans({});
    } else {
      setActivePreset(preset);
      api.setBooleans(preset.required || {});
    }
  };

  // Near Me = just switch sort to distance (geolocation runs on mount).
  const nearMeActive = api.sort === 'distance';
  const handleNearMe = () => api.setSort(nearMeActive ? 'rating' : 'distance');

  // In saved view show only saved cafes (other filters still apply).
  const displayCafes = savedView
    ? api.visibleCafes.filter((c) => isSaved(c.id))
    : api.visibleCafes;

  return (
    <div className={`layout${savedView ? ' layout--saved' : ''}`}>

      {/* ===== Left / floating panel ===== */}
      <aside className="layout__panel">

        {/* Brand row + Saved toggle */}
        <div className="layout__brand">
          <button
            className="layout__home-btn"
            onClick={() => setSavedView(false)}
            aria-label="Go to discover"
          >
            <span className="layout__logo" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 64 64">
                <rect width="64" height="64" rx="14" fill="#1a1a1a" />
                <path d="M20 22h22a6 6 0 0 1 0 12h-2v4a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V22zm22 4v6a2 2 0 0 0 0-6z" fill="#e8c39e" />
              </svg>
            </span>
            <span className="layout__wordmark">Melbourne <em>Cafe</em> Finder</span>
          </button>
          <button
            className={`layout__saved-tab${savedView ? ' is-active' : ''}`}
            onClick={() => setSavedView((v) => !v)}
            aria-label={savedView ? 'Back to discover' : 'View saved cafes'}
          >
            <HeartIcon filled={savedView} size={13} />
            {savedCount > 0 ? savedCount : 'Saved'}
          </button>
        </div>

        {/* Discover controls — hidden in saved view */}
        {!savedView && (
          <>
            <SearchBar
              value={api.filters.query}
              onChange={api.setQuery}
              placeholder="Search cafe, suburb, or vibe"
            />

            <MoodPresets
              activePresetId={activePreset?.id}
              onSelect={handlePresetSelect}
            />
            {activePreset && (
              <p className="layout__preset-desc">{activePreset.description}</p>
            )}

            <FilterChips
              activeBooleans={api.filters.booleans}
              onToggle={api.toggleBoolean}
              onOpenAll={() => setDrawerOpen(true)}
              activeCount={api.activeCount}
            />

            {/* Near Me */}
            <div className="layout__near-me">
              <button
                className={`near-me-btn${nearMeActive ? ' is-active' : ''}`}
                onClick={handleNearMe}
                disabled={geoStatus === 'asking'}
              >
                <LocIcon />
                {geoStatus === 'asking'
                  ? 'Getting location…'
                  : nearMeActive
                  ? 'Near me · Clear'
                  : 'Near me'}
              </button>
              {geoStatus === 'denied' && !nearMeActive && (
                <span className="near-me-note">
                  Location blocked — enable in browser settings
                </span>
              )}
            </div>
          </>
        )}

        {/* Cafe list (desktop always; mobile only in saved view) */}
        <div className="layout__list-wrap">
          <SortBar
            sort={api.sort}
            onChange={api.setSort}
            count={displayCafes.length}
          />

          {displayCafes.length === 0 ? (
            <EmptyState
              onReset={savedView ? () => setSavedView(false) : api.reset}
            />
          ) : (
            <ul className="layout__list">
              {displayCafes.map((cafe) => (
                <li key={cafe.id}>
                  <CafeCard
                    cafe={cafe}
                    isSaved={isSaved(cafe.id)}
                    onToggleSave={toggleSave}
                    onOpen={() => {
                      setPreviewCafe(cafe);
                      setDetailCafe(cafe);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* ===== Right / map ===== */}
      <main className="layout__map">
        <MapView
          cafes={api.visibleCafes}
          selectedId={previewCafe?.id}
          onSelect={setPreviewCafe}
          userCoords={coords}
        />

        {previewCafe && (
          <CafePreviewCard
            cafe={previewCafe}
            isSaved={isSaved(previewCafe.id)}
            onToggleSave={toggleSave}
            onOpen={() => setDetailCafe(previewCafe)}
            onClose={() => setPreviewCafe(null)}
          />
        )}
      </main>

      {/* ===== Filter FAB (hidden in saved view) ===== */}
      {!savedView && (
        <button
          className="layout__fab"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open filters"
        >
          <FilterIcon />
          Filters
          {api.activeCount > 0 && (
            <span className="layout__fab-badge">{api.activeCount}</span>
          )}
        </button>
      )}

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        api={api}
      />

      <CafeDetail
        cafe={detailCafe}
        onClose={() => setDetailCafe(null)}
      />
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export function HeartIcon({ filled, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
