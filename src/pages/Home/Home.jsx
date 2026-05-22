import { useMemo, useState } from 'react';
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
import BottomSheet from '../../components/BottomSheet/BottomSheet.jsx';
import BottomNav from '../../components/BottomNav/BottomNav.jsx';
import MobileExplore from '../../components/MobileExplore/MobileExplore.jsx';
import MobileSaved from '../../components/MobileSaved/MobileSaved.jsx';
import { useCafeFilters } from '../../hooks/useCafeFilters.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { useSavedCafes } from '../../hooks/useSavedCafes.js';
import { CAFES } from '../../data/cafes.js';
import { haversineKm } from '../../utils/distance.js';
import './Home.css';

export default function Home() {
  const [previewCafe, setPreviewCafe]   = useState(null);
  const [detailCafe, setDetailCafe]     = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [savedView, setSavedView]       = useState(false);
  const [sheetSnap, setSheetSnap]       = useState(0);
  const handleSheetSnap = (snap) => {
    setSheetSnap(snap);
    if (snap >= 1) setPreviewCafe(null); // hide preview when list is expanded
  };
  const [activePreset, setActivePreset] = useState(null);
  const [activeTab, setActiveTab]       = useState('explore');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Clear map-specific state when leaving the map tab
    if (tab !== 'map') {
      setPreviewCafe(null);
      setSheetSnap(0);
    }
  };

  const { coords, status: geoStatus } = useGeolocation();
  const api = useCafeFilters({ userCoords: coords, activePreset });
  const { isSaved, toggleSave, savedCount } = useSavedCafes();

  // All cafes decorated with distance — used by the explore feed
  const allCafes = useMemo(() =>
    CAFES.map((cafe) => ({
      ...cafe,
      distanceKm: coords ? haversineKm(coords, cafe) : null,
    })),
    [coords]
  );

  const savedCafes = allCafes.filter((c) => isSaved(c.id));

  const handlePresetSelect = (preset) => {
    if (activePreset?.id === preset.id) {
      setActivePreset(null);
      api.setBooleans({});
    } else {
      setActivePreset(preset);
      api.setBooleans(preset.required || {});
    }
  };

  const nearMeActive = api.sort === 'distance';
  const handleNearMe = () => api.setSort(nearMeActive ? 'rating' : 'distance');

  const displayCafes = savedView
    ? api.visibleCafes.filter((c) => isSaved(c.id))
    : api.visibleCafes;

  const handleSavedView = (val) => {
    setSavedView(val);
    setSheetSnap(val ? 1 : 0);
  };

  // Shared list — rendered in desktop sidebar and mobile bottom sheet
  const cafeList = (
    <>
      <SortBar sort={api.sort} onChange={api.setSort} count={displayCafes.length} />
      {displayCafes.length === 0 ? (
        <EmptyState onReset={savedView ? () => handleSavedView(false) : api.reset} />
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
    </>
  );

  return (
    <div className={`layout layout--tab-${activeTab}`}>

      {/* ===== Mobile explore feed ===== */}
      <MobileExplore
        cafes={allCafes}
        isSaved={isSaved}
        onToggleSave={toggleSave}
        onOpen={(cafe) => setDetailCafe(cafe)}
        activePreset={activePreset}
        onPresetSelect={handlePresetSelect}
        hidden={activeTab !== 'explore'}
      />

      {/* ===== Mobile saved screen ===== */}
      {activeTab === 'saved' && (
        <MobileSaved
          cafes={allCafes}
          savedCafes={savedCafes}
          isSaved={isSaved}
          onToggleSave={toggleSave}
          onOpen={(cafe) => setDetailCafe(cafe)}
        />
      )}

      {/* ===== Panel — floating top bar on mobile (map tab only) / sidebar on desktop ===== */}
      <aside className="layout__panel">

        {/* Brand row */}
        <div className="layout__brand">
          <button
            className="layout__home-btn"
            onClick={() => handleSavedView(false)}
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
            onClick={() => handleSavedView(!savedView)}
            aria-label={savedView ? 'Back to discover' : 'View saved cafes'}
          >
            <HeartIcon filled={savedView} size={13} />
            {savedCount > 0 ? savedCount : 'Saved'}
          </button>
        </div>

        {/* Discover controls */}
        {!savedView && (
          <>
            <SearchBar
              value={api.filters.query}
              onChange={api.setQuery}
              placeholder="Search cafe, suburb, or vibe"
            />

            {/* Mood presets — desktop sidebar only; mobile shows them in the sheet */}
            <div className="layout__presets-wrap">
              <MoodPresets
                activePresetId={activePreset?.id}
                onSelect={handlePresetSelect}
              />
              {activePreset && (
                <p className="layout__preset-desc">{activePreset.description}</p>
              )}
            </div>

            {/* Compact action row — mobile only */}
            <div className="layout__actions">
              <button className="layout__action-btn" onClick={() => setDrawerOpen(true)}>
                <FilterIcon />
                Filters
                {api.activeCount > 0 && (
                  <span className="layout__action-badge">{api.activeCount}</span>
                )}
              </button>
              <button
                className={`layout__action-btn${nearMeActive ? ' is-active' : ''}`}
                onClick={handleNearMe}
                disabled={geoStatus === 'asking'}
              >
                <LocIcon />
                {geoStatus === 'asking' ? 'Locating…' : 'Near me'}
              </button>
            </div>

            {/* FilterChips — desktop only */}
            <div className="layout__chips-wrap">
              <FilterChips
                activeBooleans={api.filters.booleans}
                onToggle={api.toggleBoolean}
                onOpenAll={() => setDrawerOpen(true)}
                activeCount={api.activeCount}
              />
            </div>

            {/* Near Me — desktop only */}
            <div className="layout__near-me">
              <button
                className={`near-me-btn${nearMeActive ? ' is-active' : ''}`}
                onClick={handleNearMe}
                disabled={geoStatus === 'asking'}
              >
                <LocIcon />
                {geoStatus === 'asking' ? 'Getting location…' : nearMeActive ? 'Near me · Clear' : 'Near me'}
              </button>
              {geoStatus === 'denied' && !nearMeActive && (
                <span className="near-me-note">Location blocked — enable in browser settings</span>
              )}
            </div>
          </>
        )}

        {/* Desktop: scrollable cafe list (hidden on mobile — sheet handles it) */}
        <div className="layout__list-wrap">
          {cafeList}
        </div>
      </aside>

      {/* ===== Map ===== */}
      <main className="layout__map">
        <MapView
          cafes={api.visibleCafes}
          selectedId={previewCafe?.id}
          onSelect={setPreviewCafe}
          userCoords={coords}
        />
        {/* Only render preview on map tab and only when sheet is peeked (snap=0) */}
        {previewCafe && activeTab === 'map' && sheetSnap === 0 && (
          <CafePreviewCard
            cafe={previewCafe}
            isSaved={isSaved(previewCafe.id)}
            onToggleSave={toggleSave}
            onOpen={() => { setPreviewCafe(null); setDetailCafe(previewCafe); }}
            onClose={() => setPreviewCafe(null)}
          />
        )}
      </main>

      {/* Mobile: draggable bottom sheet — only on map tab */}
      {activeTab === 'map' && (
        <BottomSheet snap={sheetSnap} onSnap={handleSheetSnap} count={displayCafes.length}>
          {!savedView && (
            <div className="sheet__controls">
              <MoodPresets
                activePresetId={activePreset?.id}
                onSelect={handlePresetSelect}
              />
              {activePreset && (
                <p className="layout__preset-desc">{activePreset.description}</p>
              )}
            </div>
          )}
          {cafeList}
        </BottomSheet>
      )}

      {/* Desktop: filter FAB near the map */}
      {!savedView && (
        <button
          className="layout__fab layout__fab--filters"
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

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} api={api} />
      <CafeDetail cafe={detailCafe} onClose={() => setDetailCafe(null)} />

      {/* Bottom nav — CSS hides on desktop */}
      <BottomNav activeTab={activeTab} onChange={handleTabChange} savedCount={savedCount} />
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
