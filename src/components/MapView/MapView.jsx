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

// Target on-map display sizes. The PNGs can be high-res; pixelRatio makes them render crisp.
const CUP_DISPLAY_PX = 38;
const CLUSTER_DISPLAY_PX = 62;

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
    map.loadImage(url, (err, img) => {
      if (err) reject(err);
      else resolve(img);
    });
  });
}

async function ensureMapImages(map) {
  if (!map.hasImage('cafe-pin')) {
    const cupImg = await loadMapboxImage(map, '/cup.png');
    const imgW = cupImg.naturalWidth || cupImg.width || 512;
    map.addImage('cafe-pin', cupImg, { pixelRatio: imgW / CUP_DISPLAY_PX });
  }

  if (!map.hasImage('cluster-moka')) {
    const clusterImg = await loadMapboxImage(map, '/cluster.png');
    const imgW = clusterImg.naturalWidth || clusterImg.width || 512;
    map.addImage('cluster-moka', clusterImg, { pixelRatio: imgW / CLUSTER_DISPLAY_PX });
  }
}

async function addLayers(map, cafes) {
  if (map.getSource('cafes')) return;

  await ensureMapImages(map);

  map.addSource('cafes', {
    type: 'geojson',
    data: buildGeoJSON(cafes),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 42,
  });

  // Cluster image layer. Native Mapbox symbol layers do not drift or jump like DOM markers.
  map.addLayer({
    id: 'clusters',
    type: 'symbol',
    source: 'cafes',
    filter: ['has', 'point_count'],
    layout: {
      'icon-image': 'cluster-moka',
      'icon-anchor': 'center',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 12, 1.0, 16, 1.08],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
  });

  // Cluster number as locked native Mapbox text, centered over the cluster icon.
  // Tune text-offset if the cream count area in cluster.png moves.
  map.addLayer({
    id: 'cluster-counts',
    type: 'symbol',
    source: 'cafes',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['case', ['>', ['get', 'point_count'], 999], '999+', ['to-string', ['get', 'point_count']]],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': [
        'case',
        ['<', ['get', 'point_count'], 10], 16,
        ['<', ['get', 'point_count'], 100], 15,
        12,
      ],
      'text-anchor': 'center',
      'text-offset': [0, -0.04],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-padding': 0,
    },
    paint: {
      'text-color': '#111111',
      'text-halo-color': 'rgba(255, 246, 228, 0.9)',
      'text-halo-width': 0.4,
    },
  });

  // Individual cafe pins.
  map.addLayer({
    id: 'pins',
    type: 'symbol',
    source: 'cafes',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': 'cafe-pin',
      'icon-anchor': 'bottom',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.64, 11.5, 0.78, 14, 1.0, 17, 1.08],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
  });
}

function expandCluster(map, feature) {
  const clusterId = feature.properties.cluster_id;
  const coords = feature.geometry.coordinates.slice();
  map.getSource('cafes').getClusterExpansionZoom(clusterId, (err, zoom) => {
    if (!err) map.easeTo({ center: coords, zoom });
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

    map.on('load', async () => {
      map.on('click', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (cafe && typeof onSelect === 'function') onSelect(cafe);
      });

      map.on('click', 'clusters', (e) => expandCluster(map, e.features[0]));
      map.on('click', 'cluster-counts', (e) => expandCluster(map, e.features[0]));

      const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
      const clearPointer = () => { map.getCanvas().style.cursor = ''; };
      map.on('mouseenter', 'clusters', setPointer);
      map.on('mouseleave', 'clusters', clearPointer);
      map.on('mouseenter', 'cluster-counts', setPointer);
      map.on('mouseleave', 'cluster-counts', clearPointer);

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
    map.once('style.load', () => {
      addLayers(map, cafesRef.current).catch(() => {});
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
