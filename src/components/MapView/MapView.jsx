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

// ─── SDF pin icon ─────────────────────────────────────────────────────────────
// Classic teardrop map pin with circular window.
// White on transparent → Mapbox tints with icon-color at runtime → infinitely sharp.
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="120" height="156">
  <path fill="white" fill-rule="evenodd"
    d="M20 1C9.5 1 1 9.5 1 20 1 33.5 20 51 20 51S39 33.5 39 20C39 9.5 30.5 1 20 1Z
       M20 11.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17z"/>
</svg>`;

const PIN_RENDER_W = 120;   // high-res render (SVG width attr)
const PIN_DISPLAY  = 48;    // on-screen px at icon-size 1.0

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

function loadSDF(svgStr, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image(w, h);
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
  });
}

async function ensureImages(map) {
  if (!map.hasImage('cafe-pin')) {
    const h = Math.round(PIN_RENDER_W * 156 / 120);
    const img = await loadSDF(PIN_SVG, PIN_RENDER_W, h);
    map.addImage('cafe-pin', img, {
      sdf: true,
      pixelRatio: PIN_RENDER_W / PIN_DISPLAY,
    });
  }
}

async function addLayers(map, cafes) {
  if (map.getSource('cafes')) return;

  await ensureImages(map);

  map.addSource('cafes', {
    type: 'geojson',
    data: buildGeoJSON(cafes),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 42,
    promoteId: 'id',
  });

  // ── Clusters ──────────────────────────────────────────────────────────────
  map.addLayer({
    id: 'clusters',
    type: 'circle',
    source: 'cafes',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#1a1a1a',
      'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.addLayer({
    id: 'cluster-count',
    type: 'symbol',
    source: 'cafes',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 13,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff' },
  });

  // ── Individual pins (SDF, hover-aware) ────────────────────────────────────
  map.addLayer({
    id: 'pins',
    type: 'symbol',
    source: 'cafes',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': 'cafe-pin',
      'icon-anchor': 'bottom',
      'icon-size': ['interpolate', ['linear'], ['zoom'],
        9,  0.55,
        12, 0.78,
        14, 1.0,
        17, 1.2,
      ],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      // Warm espresso brown; lights up on hover
      'icon-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#c06020',
        '#5c2d0e',
      ],
      // White outline for map separation; thicker on hover
      'icon-halo-color': '#ffffff',
      'icon-halo-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        3,
        1.5,
      ],
    },
  });
}

function expandCluster(map, feature) {
  const coords = feature.geometry.coordinates.slice();
  map.getSource('cafes').getClusterExpansionZoom(
    feature.properties.cluster_id,
    (err, zoom) => { if (!err) map.easeTo({ center: coords, zoom }); }
  );
}

export default function MapView({ cafes, selectedId, onSelect, userCoords }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const cafesRef      = useRef(cafes);
  const userMarkerRef = useRef(null);
  const hoveredIdRef  = useRef(null);
  const [ready, setReady]         = useState(false);
  const [satellite, setSatellite] = useState(false);

  useEffect(() => { cafesRef.current = cafes; }, [cafes]);

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

    map.on('load', async () => {

      // ── Clicks ──────────────────────────────────────────────────────────
      map.on('click', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (cafe && typeof onSelect === 'function') onSelect(cafe);
      });

      map.on('click', 'clusters', (e) => expandCluster(map, e.features[0]));
      map.on('click', 'cluster-count', (e) => expandCluster(map, e.features[0]));

      // ── Cursor ──────────────────────────────────────────────────────────
      ['clusters', 'cluster-count', 'pins'].forEach((l) => {
        map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
      });

      // ── Hover state (SDF color change) ──────────────────────────────────
      map.on('mousemove', 'pins', (e) => {
        if (!e.features.length) return;
        const id = e.features[0].id;
        if (hoveredIdRef.current === id) return;
        if (hoveredIdRef.current !== null) {
          map.setFeatureState({ source: 'cafes', id: hoveredIdRef.current }, { hover: false });
        }
        hoveredIdRef.current = id;
        map.setFeatureState({ source: 'cafes', id }, { hover: true });
      });
      map.on('mouseleave', 'pins', () => {
        if (hoveredIdRef.current !== null) {
          map.setFeatureState({ source: 'cafes', id: hoveredIdRef.current }, { hover: false });
          hoveredIdRef.current = null;
        }
      });

      // ── Tooltip ─────────────────────────────────────────────────────────
      let hoverPopup = null;
      map.on('mouseenter', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (!cafe) return;
        hoverPopup = new mapboxgl.Popup({
          closeButton: false, closeOnClick: false, offset: 28,
          className: 'map-pin-tooltip',
        })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(`<strong>${cafe.name}</strong><span>${cafe.suburb}</span>`)
          .addTo(map);
      });
      map.on('mouseleave', 'pins', () => {
        hoverPopup?.remove();
        hoverPopup = null;
      });

      await addLayers(map, cafesRef.current);
      setReady(true);
    });

    mapRef.current = map;
    return () => {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle satellite
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.setStyle(satellite ? STYLES.satellite : STYLES.map);
    map.once('style.load', () => addLayers(map, cafesRef.current).catch(() => {}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite]);

  // Update data
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (map.getSource('cafes')) {
      map.getSource('cafes').setData(buildGeoJSON(cafes));
    } else {
      addLayers(map, cafes).catch(() => {});
    }
  }, [cafes, ready]);

  // Fly to selected
  useEffect(() => {
    if (!ready || !selectedId) return;
    const cafe = cafes.find((c) => c.id === selectedId);
    if (!cafe) return;
    mapRef.current.flyTo({
      center: [cafe.longitude, cafe.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      speed: 0.8, essential: true,
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
