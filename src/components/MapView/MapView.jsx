import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MapView.css';

/**
 * Mapbox-based map of Melbourne cafes.
 *
 * Props:
 *  - cafes:        array of cafe objects (already filtered by useCafeFilters)
 *  - selectedId:   id of the currently selected cafe (highlighted pin, fly-to)
 *  - onSelect:     callback when a pin is clicked
 *  - userCoords:   {latitude, longitude} for an optional "you are here" dot
 *
 * Beginner notes:
 *  - We use a `ref` (containerRef) to give Mapbox a DOM element to mount into.
 *  - mapRef holds the Mapbox map instance so subsequent effects can re-use it.
 *  - markersRef keeps track of pins by cafe id so we can diff cheaply when
 *    the cafe list changes (instead of wiping every pin every render).
 */

const MELBOURNE = { lng: 144.9631, lat: -37.8136, zoom: 12.4 };
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// "Light" feels closer to a premium cafe-finder than the default streets style.
// Swap this with a custom Mapbox Studio style URL when you have one.
const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

export default function MapView({ cafes, selectedId, onSelect, userCoords }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // 1. Create the map ONCE.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [MELBOURNE.lng, MELBOURNE.lat],
      zoom: MELBOURNE.zoom,
      attributionControl: false,
      cooperativeGestures: false
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(
      new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }),
      'top-right'
    );

    map.on('load', () => setReady(true));
    mapRef.current = map;

    return () => map.remove();
  }, []);

  // 2. Sync markers with the cafe list whenever it changes.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const visibleIds = new Set(cafes.map((c) => c.id));

    // Remove stale markers
    for (const [id, marker] of markersRef.current.entries()) {
      if (!visibleIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Add new ones / refresh active state
    for (const cafe of cafes) {
      let marker = markersRef.current.get(cafe.id);
      if (!marker) {
        const el = createMarkerEl(cafe);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(cafe);
        });
        marker = new mapboxgl.Marker({ element: el, anchor: 'bottom', offset: [0, 4] })
          .setLngLat([cafe.longitude, cafe.latitude])
          .addTo(map);
        markersRef.current.set(cafe.id, marker);
      }
      marker.getElement().classList.toggle('is-active', cafe.id === selectedId);
    }
  }, [cafes, selectedId, ready, onSelect]);

  // 3. Fly to the selected cafe whenever it changes.
  useEffect(() => {
    if (!ready || !selectedId) return;
    const cafe = cafes.find((c) => c.id === selectedId);
    if (!cafe) return;
    mapRef.current.flyTo({
      center: [cafe.longitude, cafe.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 14.5),
      speed: 0.9,
      essential: true
    });
  }, [selectedId, ready, cafes]);

  // 4. Draw a "you are here" dot if we have geolocation.
  useEffect(() => {
    if (!ready || !userCoords) return;
    if (userMarkerRef.current) userMarkerRef.current.remove();
    const el = document.createElement('div');
    el.className = 'pin pin--user';
    el.innerHTML = '<span class="pin__pulse"></span><span class="pin__dot"></span>';
    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userCoords.longitude, userCoords.latitude])
      .addTo(mapRef.current);
  }, [userCoords, ready]);

  if (!TOKEN) {
    return <NoTokenFallback />;
  }

  return <div ref={containerRef} className="mapview" aria-label="Map of Melbourne cafes" />;
}

/**
 * Builds the DOM for a custom pin.
 * Using innerHTML directly because Mapbox expects a plain DOM node, not React.
 */
function createMarkerEl(cafe) {
  const el = document.createElement('button');
  el.className = 'pin';
  el.type = 'button';
  el.setAttribute('aria-label', `${cafe.name}, rated ${cafe.rating}`);
  el.innerHTML = `
    <span class="pin__inner">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z"/>
      </svg>
      <span>${cafe.rating.toFixed(1)}</span>
    </span>
    <span class="pin__tail"></span>
  `;
  return el;
}

function NoTokenFallback() {
  return (
    <div className="mapview mapview--fallback">
      <div className="mapview__notoken">
        <span className="mapview__notoken-badge">Set up needed</span>
        <h3>Add your Mapbox token to see the map.</h3>
        <ol>
          <li>Create a free token at <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">account.mapbox.com</a>.</li>
          <li>Copy <code>.env.example</code> to <code>.env</code>.</li>
          <li>Paste your token after <code>VITE_MAPBOX_TOKEN=</code>.</li>
          <li>Restart the dev server (<code>npm run dev</code>).</li>
        </ol>
        <p>The list works without a token - you'll just see this panel where the map would be.</p>
      </div>
    </div>
  );
}
