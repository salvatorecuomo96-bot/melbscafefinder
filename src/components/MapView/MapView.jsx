import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './MapView.css';

const MELBOURNE = { lng: 144.9631, lat: -37.8136, zoom: 13.5 };
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const STYLES = {
  map:       'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

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

  map.addSource('cafes', {
    type: 'geojson',
    data: buildGeoJSON(cafes),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 42,
  });

  // ── Clusters (dark circle + white count) ─────────────────────────────────
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
    id: 'cluster-counts',
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

  // ── Individual cafe pins ──────────────────────────────────────────────────
  map.addLayer({
    id: 'pins',
    type: 'circle',
    source: 'cafes',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#5c2d0e',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 7, 17, 9],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
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

function buildTooltipNode(cafe) {
  const wrapper = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = cafe.name || 'Cafe';
  const suburb = document.createElement('span');
  suburb.textContent = cafe.suburb || '';
  wrapper.append(name, suburb);
  return wrapper;
}

export default function MapView({ cafes, selectedId, onSelect, onDeselect, onBoundsChange, userCoords, flyTrigger }) {
  const containerRef       = useRef(null);
  const mapRef             = useRef(null);
  const cafesRef           = useRef(cafes);
  const onDeselectRef      = useRef(onDeselect);
  const onBoundsChangeRef  = useRef(onBoundsChange);
  const userMarkerRef      = useRef(null);

  useEffect(() => { onDeselectRef.current = onDeselect; }, [onDeselect]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  const [ready, setReady]         = useState(false);
  const [satellite, setSatellite] = useState(false);

  // Stable GeoJSON — only rebuilds when cafe positions actually change
  const geoJSON = useMemo(
    () => buildGeoJSON(cafes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cafes.map((c) => `${c.id}:${c.latitude}:${c.longitude}`).join('|')]
  );

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

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {

      // ── Clicks ──────────────────────────────────────────────────────────
      map.on('click', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (cafe && typeof onSelect === 'function') onSelect(cafe);
      });

      map.on('click', 'clusters',      (e) => expandCluster(map, e.features[0]));
      map.on('click', 'cluster-counts', (e) => expandCluster(map, e.features[0]));

      // Dismiss preview card when clicking empty map space
      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['pins', 'clusters', 'cluster-counts'] });
        if (hit.length === 0) onDeselectRef.current?.();
      });

      // Emit viewport bounds whenever the map moves or zooms
      const emitBounds = () => {
        const b = map.getBounds();
        onBoundsChangeRef.current?.({
          north: b.getNorth(), south: b.getSouth(),
          east:  b.getEast(),  west:  b.getWest(),
        });
      };
      map.on('moveend', emitBounds);
      map.once('idle', emitBounds); // emit initial bounds once data settles

      // ── Cursor ──────────────────────────────────────────────────────────
      ['clusters', 'cluster-counts', 'pins'].forEach((l) => {
        map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
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
          .setDOMContent(buildTooltipNode(cafe))
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite]);

  // Update data — only when cafe positions actually change (not sort/distanceKm)
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (map.getSource('cafes')) {
      map.getSource('cafes').setData(geoJSON);
    } else {
      addLayers(map, cafesRef.current).catch(() => {});
    }
  }, [geoJSON, ready]);

  // Fly to user location each time Near me is pressed
  useEffect(() => {
    if (!ready || !flyTrigger || !userCoords) return;
    mapRef.current.flyTo({
      center: [userCoords.longitude, userCoords.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 14),
      speed: 1.2,
      essential: true,
    });
  }, [flyTrigger, ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
