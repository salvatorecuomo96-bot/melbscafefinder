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

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();

    cafes.forEach(cafe => {
      const el = document.createElement('div');
      el.className = 'simple-pin';
      el.style.pointerEvents = 'auto';
      el.innerHTML = `<div class="simple-pin__inner"><span class="simple-pin__rating">${cafe.rating.toFixed(1)}</span></div>`;

      // More reliable click
      const handleClick = (e) => {
        e.stopImmediatePropagation();
        console.log('%c[Map] Pin clicked:', 'color: lime', cafe.name);
        if (typeof onSelect === 'function') {
          onSelect(cafe);
        }
      };

      el.addEventListener('click', handleClick, true);

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([cafe.longitude, cafe.latitude])
        .addTo(map);

      markersRef.current.set(cafe.id, marker);
    });
  }, [cafes, ready, onSelect]);

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

  useEffect(() => {
    if (!ready || !userCoords) return;
    if (userMarkerRef.current) userMarkerRef.current.remove();

    const el = document.createElement('div');
    el.className = 'simple-user-dot';

    userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([userCoords.longitude, userCoords.latitude])
      .addTo(mapRef.current);
  }, [userCoords, ready]);

  if (!TOKEN) {
    return <NoTokenFallback />;
  }

  return <div ref={containerRef} className="mapview" />;
}

function NoTokenFallback() {
  return (
    <div className="mapview mapview--fallback">
      <div className="mapview__notoken">
        <span className="mapview__notoken-badge">Setup needed</span>
        <h3>Add Mapbox token</h3>
        <p>The list works without it.</p>
      </div>
    </div>
  );
}
