import './MapPlaceholder.css';

/**
 * Placeholder for the map view.
 * When you're ready, replace this with Mapbox GL or Google Maps
 * (the cafes already have latitude / longitude).
 */
export default function MapPlaceholder({ cafes, onSelect }) {
  return (
    <div className="mapph" aria-label="Map view (placeholder)">
      <div className="mapph__grid" />
      <div className="mapph__center">
        <span className="mapph__badge">Map view</span>
        <h3>Mapbox / Google Maps goes here</h3>
        <p>Each cafe already has lat / lng - swap this component when you wire up a real map.</p>
      </div>

      <ul className="mapph__pins">
        {cafes.slice(0, 8).map((cafe, i) => (
          <li
            key={cafe.id}
            style={{
              left: `${10 + (i * 11) % 80}%`,
              top: `${15 + (i * 17) % 65}%`
            }}
          >
            <button onClick={() => onSelect(cafe)} aria-label={cafe.name}>
              <span>{cafe.rating.toFixed(1)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
