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

// cup.png is 1254×1254px; display at 26px logical (1254/26 ≈ 48 pixelRatio)
const CUP_DISPLAY_PX = 26;

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

function loadMapboxImage(map, url) {
  return new Promise((resolve, reject) => {
    map.loadImage(url, (err, img) => (err ? reject(err) : resolve(img)));
  });
}

function makeClusterEl(clusterId, count) {
  const label = count > 999 ? '999+' : String(count);
  const fontSize = label.length === 1 ? 14 : label.length === 2 ? 13 : label.length === 3 ? 11 : 9;
  const el = document.createElement('div');
  el.className = 'cluster-marker';
  el.dataset.clusterId = String(clusterId);
  el.innerHTML = `<span class="cluster-count" style="font-size:${fontSize}px">${label}</span>`;
  return el;
}

function updateClusterMarkers(map, clusterMarkersRef) {
  if (!map.getSource('cafes') || !map.isSourceLoaded('cafes')) return;

  const newIds = new Set();
  const seenIds = new Set();
  const features = map.querySourceFeatures('cafes');

  for (const feature of features) {
    if (!feature.properties.cluster) continue;
    const id = feature.properties.cluster_id;
    const idStr = String(id);
    if (seenIds.has(idStr)) continue;
    seenIds.add(idStr);

    const count = feature.properties.point_count;
    const coords = feature.geometry.coordinates;
    newIds.add(idStr);

    if (clusterMarkersRef.current[idStr]) {
      clusterMarkersRef.current[idStr].setLngLat(coords);
      const countEl = clusterMarkersRef.current[idStr].getElement().querySelector('.cluster-count');
      if (countEl) {
        const label = count > 999 ? '999+' : String(count);
        countEl.textContent = label;
        countEl.style.fontSize = (label.length === 1 ? 14 : label.length === 2 ? 13 : label.length === 3 ? 11 : 9) + 'px';
      }
    } else {
      const el = makeClusterEl(id, count);
      el.addEventListener('click', () => {
        const marker = clusterMarkersRef.current[idStr];
        if (!marker) return;
        const lngLat = marker.getLngLat();
        map.getSource('cafes').getClusterExpansionZoom(id, (err, zoom) => {
          if (!err) map.easeTo({ center: [lngLat.lng, lngLat.lat], zoom });
        });
      });
      clusterMarkersRef.current[idStr] = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map);
    }
  }

  // Remove stale markers
  for (const idStr in clusterMarkersRef.current) {
    if (!newIds.has(idStr)) {
      clusterMarkersRef.current[idStr].remove();
      delete clusterMarkersRef.current[idStr];
    }
  }
}

async function addLayers(map, cafes, clusterMarkersRef) {
  // Register render listener once — persists across style reloads
  if (!map._clusterRenderListenerAdded) {
    map.on('render', () => updateClusterMarkers(map, clusterMarkersRef));
    map._clusterRenderListenerAdded = true;
  }

  if (map.getSource('cafes')) return;

  // Load cup.png via Mapbox's native loader — preserves PNG transparency correctly
  const cupImg = await loadMapboxImage(map, '/cup.png');
  if (!map.hasImage('pin-cup')) {
    const imgW = cupImg.naturalWidth || cupImg.width || 1254;
    map.addImage('pin-cup', cupImg, { pixelRatio: imgW / CUP_DISPLAY_PX });
  }

  map.addSource('cafes', {
    type: 'geojson',
    data: buildGeoJSON(cafes),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 40,
  });

  // Individual cafe pins — symbol layer (GPU-accelerated for 2000+ markers)
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
  const containerRef      = useRef(null);
  const mapRef            = useRef(null);
  const cafesRef          = useRef(cafes);
  const userMarkerRef     = useRef(null);
  const clusterMarkersRef = useRef({});
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
      map.on('click', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (cafe && typeof onSelect === 'function') onSelect(cafe);
      });

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

      addLayers(map, cafesRef.current, clusterMarkersRef).catch(() => {});
      setReady(true);
    });

    mapRef.current = map;
    return () => {
      for (const id in clusterMarkersRef.current) clusterMarkersRef.current[id].remove();
      clusterMarkersRef.current = {};
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle satellite
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    for (const id in clusterMarkersRef.current) clusterMarkersRef.current[id].remove();
    clusterMarkersRef.current = {};
    map.setStyle(satellite ? STYLES.satellite : STYLES.map);
    map.once('style.load', () => {
      addLayers(map, cafesRef.current, clusterMarkersRef).catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite]);

  // Update cafe data
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (map.getSource('cafes')) {
      map.getSource('cafes').setData(buildGeoJSON(cafes));
    } else if (cafes.length > 0) {
      addLayers(map, cafes, clusterMarkersRef).catch(() => {});
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
