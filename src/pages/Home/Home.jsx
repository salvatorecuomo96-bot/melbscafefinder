import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import SearchBar from '../../components/SearchBar/SearchBar.jsx';
import FilterChips from '../../components/FilterChips/FilterChips.jsx';
import SortBar from '../../components/SortBar/SortBar.jsx';
import CafeCard from '../../components/CafeCard/CafeCard.jsx';
import CafeDetail from '../../components/CafeDetail/CafeDetail.jsx';
import CafePreviewCard from '../../components/CafePreviewCard/CafePreviewCard.jsx';
import FilterDrawer from '../../components/FilterDrawer/FilterDrawer.jsx';

import EmptyState from '../../components/EmptyState/EmptyState.jsx';
import BottomSheet from '../../components/BottomSheet/BottomSheet.jsx';
import BottomNav from '../../components/BottomNav/BottomNav.jsx';
import MobileExplore from '../../components/MobileExplore/MobileExplore.jsx';
import MobileSaved from '../../components/MobileSaved/MobileSaved.jsx';
import LoadingState from '../../components/LoadingState/LoadingState.jsx';
import SuburbPicker from '../../components/SuburbPicker/SuburbPicker.jsx';
import SubmitCafe from '../../components/SubmitCafe/SubmitCafe.jsx';
import { useCafeFilters } from '../../hooks/useCafeFilters.js';
import { useGeolocation } from '../../hooks/useGeolocation.js';
import { useSavedCafes } from '../../hooks/useSavedCafes.js';
import { useCafes } from '../../hooks/useCafes.js';
import { haversineKm } from '../../utils/distance.js';
import { getActiveFilterChips } from '../../utils/filterChips.js';
import './Home.css';

const MapView = lazy(() => import('../../components/MapView/MapView.jsx'));

export default function Home() {

  const [previewCafe, setPreviewCafe]   = useState(null);
  const [detailCafe, setDetailCafe]     = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);
  const [flyTrigger, setFlyTrigger]     = useState(0);
  const [submitOpen, setSubmitOpen]     = useState(false);
  const [savedView, setSavedView]       = useState(false);
  const [mapBounds, setMapBounds]       = useState(null);
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

  const allCafes = useMemo(() =>
    rawCafes.map((cafe) => ({
      ...cafe,
      distanceKm: coords ? haversineKm(coords, cafe) : null,
    })),
    [rawCafes, coords]
  );

  const nearMeActive = api.sort === 'distance';
  const handleNearMe = () => { api.setSort('distance'); setFlyTrigger((n) => n + 1); };

  const suburbs = useMemo(() =>
    [...new Set(rawCafes.map((c) => c.suburb).filter(Boolean))],
    [rawCafes]
  );

  const savedCafes = allCafes.filter((c) => isSaved(c.id));

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

  // Desktop sidebar list (all filtered cafes)
  const LIST_CAP = 100;
  const allDisplay = savedView
    ? api.visibleCafes.filter((c) => isSaved(c.id))
    : api.visibleCafes;
  const displayCafes = allDisplay.slice(0, LIST_CAP);

  // Map bottom sheet list (cafes visible in current map viewport)
  const viewportCafes = useMemo(() => {
    if (!mapBounds) return api.visibleCafes;
    const { north, south, east, west } = mapBounds;
    return api.visibleCafes.filter((cafe) =>
      cafe.latitude  >= south && cafe.latitude  <= north &&
      cafe.longitude >= west  && cafe.longitude <= east
    );
  }, [api.visibleCafes, mapBounds]);
  const SHEET_CAP = 100;
  const sheetCafes = viewportCafes.slice(0, SHEET_CAP);

  const handleSavedView = (val) => {
    setSavedView(val);
    setSheetSnap(val ? 1 : 0);
  };

  // Desktop sidebar list content
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

  // Map bottom sheet list content
  const sheetList = loading ? (
    <LoadingState count={4} />
  ) : (
    <>
      <SortBar sort={api.sort} onChange={api.setSort} count={viewportCafes.length} shown={sheetCafes.length} cap={SHEET_CAP} />
      {sheetCafes.length === 0 ? (
        <div style={{ padding: '0 16px' }}>
          <EmptyState onReset={api.reset} activeFilters={getActiveFilterChips(api)} />
        </div>
      ) : (
        <ul className="layout__list" style={{ padding: '0 12px 12px' }}>
          {sheetCafes.map((cafe) => (
            <li key={cafe.id}>
              <CafeCard
                cafe={cafe}
                isSaved={isSaved(cafe.id)}
                onToggleSave={toggleSave}
                onOpen={() => setDetailCafe(cafe)}
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
            onClick={() => { handleSavedView(false); setDetailCafe(null); api.reset(); }}
            aria-label="Go to discover"
          >
            <img src="/logo-icon.png" className="layout__logo-icon" alt="" aria-hidden="true" />
            <span className="layout__wordmark"><span className="layout__wm-brown">Kooka</span>brew</span>
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
              placeholder="Search cafe or suburb"
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
                className={`layout__action-btn${api.filters.openNow ? ' is-active' : ''}`}
                onClick={api.toggleOpenNow}
              >
                Open now
              </button>
              <button
                className="layout__action-btn"
                onClick={handleNearMe}
                disabled={geoStatus === 'asking'}
              >
                <LocIcon />
                {geoStatus === 'asking' ? 'Locating…' : 'Near me'}
              </button>
            </div>

            <div className="layout__near-me">
              <button className="near-me-btn" onClick={() => setDrawerOpen(true)}>
                <FilterIcon />
                Filters
                {api.activeCount > 0 && (
                  <span className="layout__action-badge">{api.activeCount}</span>
                )}
              </button>
              <button
                className={`near-me-btn${api.filters.openNow ? ' is-active' : ''}`}
                onClick={api.toggleOpenNow}
              >
                Open now
              </button>
              <button
                className="near-me-btn"
                onClick={handleNearMe}
                disabled={geoStatus === 'asking'}
              >
                <LocIcon />
                {geoStatus === 'asking' ? 'Locating…' : 'Near me'}
              </button>
            </div>

            <div className="layout__chips-wrap">
              <FilterChips
                onOpenAll={() => setDrawerOpen(true)}
                activeCount={api.activeCount}
              />
            </div>

            <div className="layout__desktop-suburb">
              <SuburbPicker active={api.filters.suburb} onSelect={api.setSuburb} suburbs={suburbs} />
            </div>

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
        <Suspense fallback={<div className="map-loading">Loading map…</div>}>
          <MapView
            cafes={api.visibleCafes}
            selectedId={previewCafe?.id}
            onSelect={(cafe) => setPreviewCafe(cafe)}
            onDeselect={() => setPreviewCafe(null)}
            onBoundsChange={setMapBounds}
            userCoords={coords}
            flyTrigger={flyTrigger}
          />
        </Suspense>

        {previewCafe && activeTab === 'map' && (
          <CafePreviewCard
            cafe={previewCafe}
            onOpen={() => { setPreviewCafe(null); setDetailCafe(previewCafe); }}
          />
        )}
      </main>

      {activeTab === 'map' && (
        <BottomSheet snap={sheetSnap} onSnap={handleSheetSnap} count={viewportCafes.length}>
          {sheetList}
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
      <CafeDetail cafe={detailCafe} onClose={() => setDetailCafe(null)} isSaved={detailCafe ? isSaved(detailCafe.id) : false} onToggleSave={toggleSave} />
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

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}
