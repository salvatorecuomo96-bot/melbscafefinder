import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MapView.css';

const MELBOURNE = { lng: 144.9631, lat: -37.8136, zoom: 12.4 };
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

export default function MapView({ cafes, selectedId, onSelect, userCoords }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Create map once
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [MELBOURNE.lng, MELBOURNE.lat],
      zoom: MELBOURNE.zoom,
      minZoom: 9,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => setReady(true));
    mapRef.current = map;

    return () => map.remove();
  }, []);

  // Manage cafe markers - more robust version
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;

    // Remove all existing markers first
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current.clear();

    // Create new markers
    cafes.forEach(cafe => {
      const el = createCafePin(cafe);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(cafe);
      });

      const marker = new mapboxgl.Marker({
        element: el,
        anchor: 'bottom',
        offset: [0, 6]
      })
        .setLngLat([cafe.longitude, cafe.latitude])
        .addTo(map);

      if (cafe.id === selectedId) {
        el.classList.add('is-active');
      }

      markersRef.current.set(cafe.id, marker);
    });
  }, [cafes, selectedId, ready, onSelect]);

  // Fly to selected
  useEffect(() => {
    if (!ready || !selectedId) return;
    const cafe = cafes.find(c => c.id === selectedId);
    if (!cafe) return;

    mapRef.current.flyTo({
      center: [cafe.longitude, cafe.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      speed: 0.8,
      essential: true
    });
  }, [selectedId, ready, cafes]);

  // User location marker - simplified and stable
  useEffect(() => {
    if (!ready || !userCoords) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    const el = document.createElement('div');
    el.className = 'pin pin--user';
    el.innerHTML = `<div class="pin__dot"></div>`;

    userMarkerRef.current = new mapboxgl.Marker({
      element: el,
      anchor: 'center'
    })
      .setLngLat([userCoords.longitude, userCoords.latitude])
      .addTo(mapRef.current);
  }, [userCoords, ready]);

  if (!TOKEN) {
    return <NoTokenFallback />;
  }

  return <div ref={containerRef} className="mapview" />;
}

function createCafePin(cafe) {
  const el = document.createElement('button');
  el.className = 'pin';
  el.type = 'button';
  el.setAttribute('aria-label', cafe.name);

  el.innerHTML = `
    <span class="pin__inner">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
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
        <span className="mapview__notoken-badge">Setup needed</span>
        <h3>Add Mapbox token</h3>
        <p>List works without token. Map needs valid token.</p>
      </div>
    </div>
  );
}
