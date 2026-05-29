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

const PIN_DISPLAY_PX = 36;
const CLUSTER_DISPLAY_PX = 58;
const ICON_CANVAS_PX = 220;

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

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function makeCanvasImage(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_CANVAS_PX;
  canvas.height = ICON_CANVAS_PX;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ICON_CANVAS_PX, ICON_CANVAS_PX);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return ctx.getImageData(0, 0, ICON_CANVAS_PX, ICON_CANVAS_PX);
}

function drawCafePin(ctx) {
  const charcoal = '#202529';
  const cream = '#fff6e4';
  const coffee = '#8b4a17';

  ctx.save();
  ctx.translate(10, -2);

  // Pin body. Drawn at high resolution on a transparent canvas, so no PNG square.
  ctx.beginPath();
  ctx.moveTo(100, 210);
  ctx.bezierCurveTo(86, 190, 50, 146, 50, 88);
  ctx.bezierCurveTo(50, 43, 78, 22, 110, 22);
  ctx.bezierCurveTo(142, 22, 170, 43, 170, 88);
  ctx.bezierCurveTo(170, 146, 134, 190, 100, 210);
  ctx.closePath();
  ctx.fillStyle = cream;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = charcoal;
  ctx.stroke();

  // Cup body.
  ctx.beginPath();
  ctx.moveTo(72, 86);
  ctx.bezierCurveTo(74, 76, 88, 70, 110, 70);
  ctx.bezierCurveTo(132, 70, 146, 76, 148, 86);
  ctx.lineTo(141, 136);
  ctx.bezierCurveTo(138, 154, 126, 164, 110, 164);
  ctx.bezierCurveTo(94, 164, 82, 154, 79, 136);
  ctx.closePath();
  ctx.fillStyle = charcoal;
  ctx.fill();

  // Cup rim and coffee.
  ctx.beginPath();
  ctx.ellipse(110, 88, 39, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = cream;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(110, 88, 30, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = coffee;
  ctx.fill();

  // Inner cup highlights.
  ctx.beginPath();
  ctx.moveTo(86, 102);
  ctx.lineTo(91, 134);
  ctx.bezierCurveTo(94, 145, 101, 151, 110, 151);
  ctx.bezierCurveTo(119, 151, 126, 145, 129, 134);
  ctx.lineTo(134, 102);
  ctx.lineWidth = 5;
  ctx.strokeStyle = cream;
  ctx.stroke();

  // Handle.
  ctx.beginPath();
  ctx.moveTo(148, 104);
  ctx.lineTo(160, 104);
  ctx.bezierCurveTo(174, 104, 182, 114, 182, 128);
  ctx.bezierCurveTo(182, 143, 171, 153, 158, 153);
  ctx.lineTo(145, 153);
  ctx.lineWidth = 11;
  ctx.strokeStyle = charcoal;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(150, 116);
  ctx.lineTo(158, 116);
  ctx.bezierCurveTo(165, 116, 169, 121, 169, 128);
  ctx.bezierCurveTo(169, 135, 164, 140, 157, 140);
  ctx.lineTo(148, 140);
  ctx.lineWidth = 5;
  ctx.strokeStyle = cream;
  ctx.stroke();

  ctx.restore();
}

function drawClusterIcon(ctx) {
  const charcoal = '#202529';
  const cream = '#fff6e4';

  // Main disc.
  ctx.beginPath();
  ctx.arc(110, 110, 98, 0, Math.PI * 2);
  ctx.fillStyle = charcoal;
  ctx.fill();

  ctx.save();
  ctx.translate(10, 8);

  // Simplified moka pot: bold, readable, and with a clean central count panel.
  ctx.lineWidth = 5;
  ctx.strokeStyle = charcoal;
  ctx.fillStyle = cream;

  // Knob.
  ctx.beginPath();
  ctx.moveTo(86, 28);
  ctx.lineTo(124, 28);
  ctx.lineTo(130, 47);
  ctx.lineTo(80, 47);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lid.
  ctx.beginPath();
  ctx.moveTo(56, 66);
  ctx.lineTo(82, 47);
  ctx.lineTo(124, 47);
  ctx.lineTo(150, 66);
  ctx.lineTo(135, 78);
  ctx.lineTo(71, 78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Spout.
  ctx.beginPath();
  ctx.moveTo(67, 78);
  ctx.lineTo(42, 90);
  ctx.lineTo(67, 101);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Upper chamber.
  ctx.beginPath();
  ctx.moveTo(70, 76);
  ctx.lineTo(136, 76);
  ctx.lineTo(127, 126);
  ctx.lineTo(79, 126);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Blank central count panel. The Mapbox text layer sits over this.
  roundedRect(ctx, 79, 83, 48, 36, 9);
  ctx.fillStyle = cream;
  ctx.fill();

  // Waist.
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.moveTo(76, 124);
  ctx.lineTo(130, 124);
  ctx.lineTo(133, 142);
  ctx.lineTo(73, 142);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bottom chamber.
  ctx.beginPath();
  ctx.moveTo(72, 140);
  ctx.lineTo(134, 140);
  ctx.lineTo(145, 178);
  ctx.bezierCurveTo(120, 190, 88, 190, 61, 178);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Handle.
  ctx.beginPath();
  ctx.moveTo(144, 72);
  ctx.bezierCurveTo(170, 70, 184, 87, 179, 109);
  ctx.bezierCurveTo(176, 128, 164, 144, 151, 155);
  ctx.lineWidth = 16;
  ctx.strokeStyle = cream;
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = charcoal;
  ctx.stroke();

  // Simple structure lines, kept away from the number panel.
  ctx.beginPath();
  ctx.moveTo(82, 48);
  ctx.lineTo(77, 75);
  ctx.moveTo(124, 48);
  ctx.lineTo(130, 75);
  ctx.moveTo(88, 144);
  ctx.lineTo(84, 178);
  ctx.moveTo(118, 144);
  ctx.lineTo(122, 178);
  ctx.lineWidth = 4;
  ctx.strokeStyle = charcoal;
  ctx.stroke();

  // Valve.
  ctx.beginPath();
  ctx.arc(78, 160, 7, 0, Math.PI * 2);
  ctx.fillStyle = charcoal;
  ctx.fill();

  ctx.restore();
}

function ensureMapImages(map) {
  if (!map.hasImage('cafe-pin')) {
    map.addImage('cafe-pin', makeCanvasImage(drawCafePin), { pixelRatio: ICON_CANVAS_PX / PIN_DISPLAY_PX });
  }
  if (!map.hasImage('cluster-moka')) {
    map.addImage('cluster-moka', makeCanvasImage(drawClusterIcon), { pixelRatio: ICON_CANVAS_PX / CLUSTER_DISPLAY_PX });
  }
}

function addLayers(map, cafes) {
  if (map.getSource('cafes')) return;

  ensureMapImages(map);

  map.addSource('cafes', {
    type: 'geojson',
    data: buildGeoJSON(cafes),
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 42,
  });

  // Native Mapbox cluster icon layer. No DOM markers, so clusters cannot drift or jump.
  map.addLayer({
    id: 'clusters',
    type: 'symbol',
    source: 'cafes',
    filter: ['has', 'point_count'],
    layout: {
      'icon-image': 'cluster-moka',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.9, 13, 1.0, 16, 1.08],
      'icon-anchor': 'center',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
    },
  });

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
        ['<', ['get', 'point_count'], 10], 15,
        ['<', ['get', 'point_count'], 100], 14,
        11,
      ],
      'text-anchor': 'center',
      'text-offset': [0, -0.08],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-padding': 0,
    },
    paint: {
      'text-color': '#111111',
      'text-halo-color': '#fff6e4',
      'text-halo-width': 0.5,
    },
  });

  // Individual cafe pins. Native Mapbox symbol layer = stable and fast for 2000+ cafes.
  map.addLayer({
    id: 'pins',
    type: 'symbol',
    source: 'cafes',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': 'cafe-pin',
      'icon-anchor': 'bottom',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 12, 0.85, 14, 1.0, 17, 1.08],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-padding': 0,
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
      map.on('click', 'pins', (e) => {
        const id = e.features[0].properties.id;
        const cafe = cafesRef.current.find((c) => c.id === id);
        if (cafe && typeof onSelect === 'function') onSelect(cafe);
      });

      map.on('click', 'clusters', (e) => {
        const feature = e.features[0];
        const clusterId = feature.properties.cluster_id;
        const coords = feature.geometry.coordinates.slice();
        map.getSource('cafes').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (!err) map.easeTo({ center: coords, zoom });
        });
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

      addLayers(map, cafesRef.current);
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
      addLayers(map, cafesRef.current);
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
      addLayers(map, cafes);
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
