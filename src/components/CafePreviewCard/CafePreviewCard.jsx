import { priceLabel, openStatus } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import './CafePreviewCard.css';

/**
 * Floating preview card shown after a marker is clicked.
 * - Mobile: slides in at the bottom of the map.
 * - Desktop: floats above the map, anchored near the bottom-left.
 *
 * Tapping the card body opens the full <CafeDetail /> modal.
 */
export default function CafePreviewCard({ cafe, onOpen, onClose, isSaved = false, onToggleSave }) {
  if (!cafe) return null;
  const { isOpen, label: openLabel } = openStatus(cafe.openingHours);

  return (
    <div className="preview" role="dialog" aria-label={`${cafe.name} preview`}>
      <button className="preview__close" onClick={onClose} aria-label="Close">×</button>

      {onToggleSave && (
        <button
          className={`preview__save${isSaved ? ' is-saved' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSave(cafe.id); }}
          aria-label={isSaved ? 'Unsave cafe' : 'Save cafe'}
        >
          <HeartIcon filled={isSaved} />
        </button>
      )}

      <button className="preview__body" onClick={onOpen}>
        <div className="preview__image">
          <img src={cafe.images?.[0]} alt="" />
        </div>

        <div className="preview__text">
          <div className="preview__head">
            <h3>{cafe.name}</h3>
            <span className="preview__rating">
              <Star /> {cafe.rating.toFixed(1)}
            </span>
          </div>

          <p className="preview__meta">
            {cafe.suburb} · {priceLabel(cafe.priceLevel)} · {cafe.vibe}
          </p>

          <div className="preview__row">
            <span className={`preview__open ${isOpen ? 'is-open' : ''}`}>
              <span className="preview__dot" />
              {openLabel}
            </span>
            {cafe.distanceKm != null && (
              <span className="preview__distance">{formatDistance(cafe.distanceKm)}</span>
            )}
          </div>

          <span className="preview__cta">View details →</span>
        </div>
      </button>
    </div>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function Star() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}
