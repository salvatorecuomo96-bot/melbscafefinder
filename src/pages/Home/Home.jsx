import { useEffect, useMemo, useRef, useState } from 'react';
import SearchBar from '../../components/SearchBar/SearchBar.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import SortBar from '../../components/SortBar/SortBar.jsx';
import CafeCard from '../../components/CafeCard/CafeCard.jsx';
import CafeDetail from '../../components/CafeDetail/CafeDetail.jsx';
import CafePreviewCard from '../../components/CafePreviewCard/CafePreviewCard.jsx';
import FilterDrawer from '../../components/FilterDrawer/FilterDrawer.jsx';
import MapView from '../../components/MapView/MapView.jsx';
import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import BottomSheet from '../../components/BottomSheet/BottomSheet.jsx';
import BottomNav from '../../components/BottomNav/BottomNav.jsx';
import MobileExplore from '../../components/MobileExplore/MobileExplore.jsx';
import MobileSaved from '../../components/MobileSaved/MobileSaved.jsx';
import LoadingState from '../../components/LoadingState/LoadingState.jsx';
import SuburbPicker from '../../components/SuburbPicker/SuburbPicker.jsx';
import AiSearch from '../../components/AiSearch/AiSearch.jsx';
import SubmitCafe from '../../components/SubmitCafe/SubmitCafe.jsx';
import { useCafeFilters } from '../../hooks/useCafeFilters.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { useSavedCafes } from '../../hooks/useSavedCafes.js';
import { useCafes } from '../../hooks/useCafes.js';
import { useCafesMatch } from '../../hooks/useCafeMatch.js';
import { haversineKm } from '../../utils/distance.js';
import { getActiveFilterChips } from '../../utils/filterChips.js';
import './Home.css';

export default function Home() {
  const [previewCafe, setPreviewCafe]   = useState(null);
  const [detailCafe, setDetailCafe]     = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [submitOpen, setSubmitOpen]     = useState(false);
  const [savedView, setSavedView]       = useState(false);
  const [sheetSnap, setSheetSnap]       = useState(0);
  const handleSheetSnap = (snap) => {
    setSheetSnap(snap);
    if (snap >= 1) setPreviewCafe(null);
  };
  const [activeTab, setActiveTab]       = useState('explore');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'map') {
      setPreviewCafe(null);
      setSheetSnap(0);
    }
  };

  const { cafes: rawCafes, loading } = useCafes();
  const { coords, status: geoStatus } = useGeolocation();
  const api = useCafeFilters({ cafes: rawCafes, userCoords: coords });
  const { isSaved, toggleSave, savedCount, getShareUrl } = useSavedCafes();
  const matchMap = useCafesMatch(allCafes, api.filters, coords);

  const allCafes = useMemo(() =>
    rawCafes.map((cafe) => ({
      ...cafe,
      distanceKm: coords ? haversineKm(coords, cafe) : null,
    })),
    [rawCafes, coords]
  );

  const suburbs = useMemo(() =>
    [...new Set(rawCafes.map((c) => c.suburb).filter(Boolean))],
    [rawCafes]
  );

  const savedCafes = allCafes.filter((c) => isSaved(c.id));

  const nearMeActive = api.sort === 'distance';
  const handleNearMe = () => api.setSort(nearMeActive ? 'rating' : 'distance');

  // Deep-link: open cafe from ?cafe=<id> on initial load
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!rawCafes.length || deepLinked.current) return;
    deepLinked.current = true;
    const id = new URLSearchParams(window.location.search).get('cafe');
    if (!id) return;
    const cafe = rawCafes.find((c) => c.id === id);
    if (cafe) setDetailCafe(cafe);
  }, [rawCafes]);

  const LIST_CAP = 100;
  const allDisplay = savedView
    ? api.visibleCafes.filter((c) => isSaved(c.id))
    : api.visibleCafes;
  const displayCafes = allDisplay.slice(0, LIST_CAP);

  const handleSavedView = (val) => {
    setSavedView(val);
    setSheetSnap(val ? 1 : 0);
  };

  const cafeList = loading ? (
    <LoadingState count={6} />
  ) : (
    <>
      <SortBar sort={api.sort} onChange={api.setSort} count={allDisplay.length} shown={displayCafes.length} cap={LIST_CAP} />
      {displayCafes.length === 0 ? (
        <EmptyState
          onReset={savedView ? () => handleSavedView(false) : api.reset}
          activeFilters={savedView ? [] : getActiveFilterChips(api)}
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
    </>
  );

  return (
    <div className={`layout layout--tab-${activeTab}`}>

      <MobileExplore
        cafes={allCafes}
        isSaved={isSaved}
        onToggleSave={toggleSave}
        onOpen={(cafe) => setDetailCafe(cafe)}
        onOpenFilters={() => setDrawerOpen(true)}
        onOpenSubmit={() => setSubmitOpen(true)}
        api={api}
        matchMap={matchMap}
        hidden={activeTab !== 'explore'}
        geoStatus={geoStatus}
        nearMeActive={nearMeActive}
        onNearMe={handleNearMe}
      />

      {activeTab === 'saved' && (
        <MobileSaved
          cafes={allCafes}
          savedCafes={savedCafes}
          isSaved={isSaved}
          onToggleSave={toggleSave}
          onOpen={(cafe) => setDetailCafe(cafe)}
          getShareUrl={getShareUrl}
        />
      )}

      <aside className="layout__panel">
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

        {!savedView && (
          <>
            <SearchBar
              value={api.filters.query}
              onChange={api.setQuery}
              placeholder="Search cafe, suburb, or vibe"
            />

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

            <div className="layout__chips-wrap">
              <FilterChips
                activeBooleans={api.filters.booleans}
                onToggle={api.toggleBoolean}
                onOpenAll={() => setDrawerOpen(true)}
                activeCount={api.activeCount}
              />
            </div>

            <div className="layout__near-me">
              <button
                className={`near-me-btn${nearMeActive ? ' is-active' : ''}`}
                onClick={handleNearMe}
                disabled={geoStatus === 'asking'}
              >
                <LocIcon />
                {geoStatus === 'asking' ? 'Locating…' : 'Near me'}
                {geoStatus === 'denied' && !nearMeActive && (
                  <span className="near-me-note">Location blocked</span>
                )}
              </button>
              <button
                className={`near-me-btn${api.filters.openNow ? ' is-active' : ''}`}
                onClick={api.toggleOpenNow}
              >
                Open now
              </button>
            </div>

            <div className="layout__desktop-suburb">
              <SuburbPicker active={api.filters.suburb} onSelect={api.setSuburb} suburbs={suburbs} />
            </div>

            <AiSearch onApply={api.applyAiFilters} />
            <button className="layout__submit-btn" onClick={() => setSubmitOpen(true)}>
              + Submit a cafe
            </button>
          </>
        )}

        <div className="layout__list-wrap">
          {cafeList}
        </div>
      </aside>

      <main className="layout__map">
        <MapView
          cafes={api.visibleCafes}
          selectedId={previewCafe?.id}
          onSelect={(cafe) => {
            setPreviewCafe(cafe);
            setDetailCafe(cafe); // Open detail when clicking map pin
          }}
          userCoords={coords}
        />
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

      {activeTab === 'map' && (
        <BottomSheet snap={sheetSnap} onSnap={handleSheetSnap} count={displayCafes.length}>
          {cafeList}
        </BottomSheet>
      )}

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
      <CafeDetail cafe={detailCafe} match={detailCafe ? matchMap.get(detailCafe.id) : null} onClose={() => setDetailCafe(null)} />
      <SubmitCafe open={submitOpen} onClose={() => setSubmitOpen(false)} />

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
