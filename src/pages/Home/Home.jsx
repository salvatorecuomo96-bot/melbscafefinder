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
import { useCafeFilters } from '../../hooks/useCafeFilters.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import './Home.css';

/**
 * Map-first layout:
 *  - Mobile: full-screen map with floating search + filter controls,
 *            and a floating preview card when a pin is tapped.
 *  - Desktop: sidebar (search, filters, scrollable cafe list) + map on the right.
 *
 * The state lives here so both the sidebar list and the map share it.
 */
export default function Home() {
  const { coords } = useGeolocation();
  const api = useCafeFilters({ userCoords: coords });

  const [previewCafe, setPreviewCafe] = useState(null); // selected on map
  const [detailCafe, setDetailCafe]   = useState(null); // open in modal
  const [drawerOpen, setDrawerOpen]   = useState(false);

  // When a card or pin is tapped: highlight on map AND show preview.
  const handleSelect = (cafe) => {
    setPreviewCafe(cafe);
  };
  // Full detail (modal / bottom sheet) is a separate action.
  const handleOpenDetail = (cafe) => {
    setDetailCafe(cafe);
  };

  return (
    <div className="layout">
      {/* ===== Left / floating panel ===== */}
      <aside className="layout__panel">
        <div className="layout__brand">
          <span className="layout__logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="14" fill="#1a1a1a" />
              <path d="M20 22h22a6 6 0 0 1 0 12h-2v4a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V22zm22 4v6a2 2 0 0 0 0-6z" fill="#e8c39e" />
            </svg>
          </span>
          <span className="layout__wordmark">Melbourne <em>Cafe</em> Finder</span>
        </div>

        <SearchBar
          value={api.filters.query}
          onChange={api.setQuery}
          placeholder="Search cafe, suburb, or vibe"
        />

        <FilterChips
          activeBooleans={api.filters.booleans}
          onToggle={api.toggleBoolean}
          onOpenAll={() => setDrawerOpen(true)}
          activeCount={api.activeCount}
        />

        <div className="layout__list-wrap">
          <SortBar
            sort={api.sort}
            onChange={api.setSort}
            count={api.visibleCafes.length}
          />

          {api.visibleCafes.length === 0 ? (
            <EmptyState onReset={api.reset} />
          ) : (
            <ul className="layout__list">
              {api.visibleCafes.map((cafe) => (
                <li key={cafe.id}>
                  <CafeCard
                    cafe={cafe}
                    onOpen={() => {
                      handleSelect(cafe);
                      handleOpenDetail(cafe);
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
          onSelect={handleSelect}
          userCoords={coords}
        />

        {previewCafe && (
          <CafePreviewCard
            cafe={previewCafe}
            onOpen={() => handleOpenDetail(previewCafe)}
            onClose={() => setPreviewCafe(null)}
          />
        )}
      </main>

      {/* ===== Floating filter button (mobile primary, desktop secondary) ===== */}
      <button
        className="layout__fab"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open filters"
      >
        <FilterIcon />
        Filters
        {api.activeCount > 0 && <span className="layout__fab-badge">{api.activeCount}</span>}
      </button>

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
