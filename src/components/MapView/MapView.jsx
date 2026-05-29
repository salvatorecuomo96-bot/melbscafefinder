import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MapView.css';

const MELBOURNE = { lng: 144.9631, lat: -37.8136, zoom: 13.5 };
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLES = {
  map:       'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

// Module-level image cache — loaded once, reused across style reloads
let _cupImg     = null;
let _clusterImg = null;

function loadHTMLImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function ensureImagesLoaded() {
  if (_cupImg && _clusterImg) return;
  [_cupImg, _clusterImg] = await Promise.all([
    loadHTMLImage('/cup.png'),
    loadHTMLImage('/cluster.png'),
  ]);
}

// Cup pin icon — map-pin shape with coffee cup
function makeCupIconData() {
  const S = 80; // 80px canvas @pixelRatio:2 → 40px logical
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(_cupImg, 0, 0, S, S);
  return ctx.getImageData(0, 0, S, S);
}

// Cluster icon — mokapot with count number drawn into the badge circle
function makeClusterIconData(count) {
  const S = 140; // 140px canvas @pixelRatio:2 → 70px logical
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');

  // Draw base mokapot image
  ctx.drawImage(_clusterImg, 0, 0, S, S);

  // Badge circle position — bottom-right of mokapot in cluster.png
  // Measured at ~75% from left, ~82% from top, radius ~10.5% of image
  const bx = Math.round(S * 0.75);
  const by = Math.round(S * 0.82);
  const br = Math.round(S * 0.105) + 1; // +1 to fully cover the decorative circle

  // Fill badge with white
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();

  // Count label
  const label = count > 999 ? '999+' : String(count);
  const fs = label.length > 2
    ? Math.round(br * 0.75)
    : Math.round(br * 1.0);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `800 ${fs}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx, by);

  return ctx.getImageData(0, 0, S, S);
}

function buildGeoJSON(cafes) {
  return {
    type: 'FeatureCollection',
    features: cafes.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
      properties: { id: c.id, rating: c.rating },
    })),
  };
}

async function addLayers(map, cafes) {
  if (map.getSource('cafes')) return;

  await ensureImagesLoaded();

  // Register cup icon
  if (!map.hasImage('pin-cup')) {
    map.addImage('pin-cup', makeCupIconData(), { pixelRatio: 2 });
  }

  // Dynamic cluster icons: generated on demand via styleimagemissing
  if (!map._clusterIconListenerAdded) {
    map.on('styleimagemissing', (e) => {
      if (!e.id.startsWith('cluster-n-')) return;
      const count = parseInt(e.id.replace('cluster-n-', ''), 10);
      if (isNaN(count) || map.hasImage(e.id)) return;
      map.addImage(e.id, makeClusterIconData(count), { pixelRatio: 2 });
    });
    map._clusterIconListenerAdded = true;
  }

  map.addSource('cafes', {
    type: 'geojson',
    data: buildGeoJSON(cafes),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 40,
  });

  // Cluster layer — mokapot icon with count in badge
  map.addLayer({
    id: 'clusters',
    type: 'symbol',
    source: 'cafes',
    filter: ['has', 'point_count'],
    layout: {
      'icon-image': ['concat', 'cluster-n-', ['to-string', ['get', 'point_count']]],
      'icon-size': 1.0,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  // Individual cafe pin — cup icon
  map.addLayer({
    id: 'pins',
    type: 'symbol',
    source: 'cafes',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': 'pin-cup',
      'icon-size': 1.0,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

export default function MapView({ cafes, selectedId, onSelect, userCoords }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const cafesRef      = useRef(cafes);
  const userMarkerRef = useRef(null);
  const [ready, setReady]         = useState(false);
  const [satellite, setSatellite] = useState(false);

  useEffect(() => { cafesRef.current = cafes; }, [cafes]);

  // Init map once
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES.map,
      center: [MELBOURNE.lng, MELBOURNE.lat],
      zoom: MELBOURNE.zoom,
      minZoom: 9,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.on('click', 'clusters', (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        map.getSource('cafes').getClusterExpansionZoom(feature.properties.cluster_id, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: feature.geometry.coordinates, zoom });
        });
      });

      map.on('click', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (cafe && typeof onSelect === 'function') onSelect(cafe);
      });

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });

      let hoverPopup = null;
      map.on('mouseenter', 'pins', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (!cafe) return;
        hoverPopup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 20,
          className: 'map-pin-tooltip',
        })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<strong>${cafe.name}</strong><span>${cafe.suburb}</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'pins', () => {
        map.getCanvas().style.cursor = '';
        hoverPopup?.remove();
        hoverPopup = null;
      });

      setReady(true);
    });

    mapRef.current = map;
    return () => map.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle satellite
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.setStyle(satellite ? STYLES.satellite : STYLES.map);
    map.once('style.load', () => {
      // Re-add cup image after style reload (custom images are cleared)
      if (_cupImg && !map.hasImage('pin-cup')) {
        map.addImage('pin-cup', makeCupIconData(), { pixelRatio: 2 });
      }
      addLayers(map, cafesRef.current).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite]);

  // Add/update layers when cafes change
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (map.getSource('cafes')) {
      map.getSource('cafes').setData(buildGeoJSON(cafes));
    } else if (cafes.length > 0) {
      addLayers(map, cafes).catch(() => {});
    }
  }, [cafes, ready]);

  // Fly to selected cafe
  useEffect(() => {
    if (!ready || !selectedId) return;
    const cafe = cafes.find((c) => c.id === selectedId);
    if (!cafe) return;
    mapRef.current.flyTo({
      center: [cafe.longitude, cafe.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      speed: 0.8,
      essential: true,
    });
  }, [selectedId, ready, cafes]);

  // User location dot
  useEffect(() => {
    if (!ready || !userCoords) return;
    if (userMarkerRef.current) userMarkerRef.current.remove();
    const el = document.createElement('div');
    el.className = 'simple-user-dot';
    userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([userCoords.longitude, userCoords.latitude])
      .addTo(mapRef.current);
  }, [userCoords, ready]);

  if (!TOKEN) return <NoTokenFallback />;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={containerRef} className="mapview" />
      <button
        className={`map-style-toggle${satellite ? ' is-satellite' : ''}`}
        onClick={() => setSatellite((s) => !s)}
        aria-label={satellite ? 'Switch to map view' : 'Switch to satellite view'}
      >
        {satellite ? (<><MapIcon />Map</>) : (<><SatelliteIcon />Satellite</>)}
      </button>
    </div>
  );
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

function SatelliteIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a13 13 0 0 0 0 17M20.5 3.5a13 13 0 0 1 0 17"/>
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
      <line x1="9" y1="3" x2="9" y2="18"/>
      <line x1="15" y1="6" x2="15" y2="21"/>
    </svg>
  );
}
