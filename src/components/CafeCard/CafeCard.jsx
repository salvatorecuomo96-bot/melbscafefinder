import { useState } from 'react';
import { priceLabel, openStatus } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import './CafeCard.css';

function reviewBucket(n) {
  if (!n || n < 50) return null;
  if (n >= 1000) return '1000+';
  if (n >= 500) return '500+';
  if (n >= 100) return '100+';
  return '50+';
}

export default function CafeCard({ cafe, onOpen, isSaved = false, onToggleSave }) {
  const { isOpen, label: openLabel } = openStatus(cafe.openingHours);
  const bucket = reviewBucket(cafe.reviewCount);
  const [copied, setCopied] = useState(false);

  const mapsUrl = cafe.googleMapsUrl
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cafe.name} ${cafe.address}`)}`;

  const handleShare = (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}?cafe=${cafe.id}`;
    if (navigator.share) {
      navigator.share({ title: cafe.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <article className="card" onClick={onOpen}>
      <div className="card__image">
        <img src={cafe.images?.[0]} alt={cafe.name} loading="lazy" />

        <div className={`card__open ${isOpen ? 'is-open' : ''}`}>
          <span className="card__dot" />
          {openLabel}
        </div>

        {cafe.distanceKm != null && (
          <div className="card__distance">{formatDistance(cafe.distanceKm)}</div>
        )}

        <div className="card__image-btns">
          {onToggleSave && (
            <button
              className={`card__save${isSaved ? ' is-saved' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleSave(cafe.id); }}
              aria-label={isSaved ? 'Unsave cafe' : 'Save cafe'}
            >
              <HeartIcon filled={isSaved} />
            </button>
          )}
          <button className="card__share-btn" onClick={handleShare} aria-label="Share">
            {copied ? <CheckIcon /> : <ShareIcon />}
          </button>
        </div>
      </div>

      <div className="card__body">
        <div className="card__head">
          <h3 className="card__name">{cafe.name}</h3>
          <div className="card__rating-wrap">
            {cafe.rating != null && (
              <div className="card__rating" aria-label={`Rating ${cafe.rating}`}>
                <Star />
                {cafe.rating.toFixed(1)}
              </div>
            )}
            {bucket && <span className="card__reviews">{bucket}</span>}
          </div>
        </div>

        <p className="card__meta">
          {cafe.suburb}{priceLabel(cafe.priceLevel) ? ` · ${priceLabel(cafe.priceLevel)}` : ''}
        </p>

        <p className="card__desc">{cafe.shortDescription}</p>

        <div className="card__actions">
          <a
            className="card__action-btn"
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Open in Google Maps"
          >
            <MapPinIcon /> Maps
          </a>
        </div>
      </div>
    </article>
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
