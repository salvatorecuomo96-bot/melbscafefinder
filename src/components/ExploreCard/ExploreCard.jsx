import { formatDistance } from '../../utils/distance.js';
import { priceLabel } from '../../utils/format.js';
import './ExploreCard.css';

export default function ExploreCard({ cafe, isSaved, onToggleSave, onOpen }) {
  const tags = [
    cafe.noiseLevel === 'quiet' && 'Quiet',
    cafe.specialtyCoffee && 'Specialty coffee',
    cafe.outdoorSeating && 'Outdoor',
    cafe.matcha && 'Matcha',
    cafe.laptopFriendly && 'Laptop friendly',
    cafe.dogFriendly && 'Dog friendly',
  ].filter(Boolean).slice(0, 2);

  return (
    <article className="explore-card" onClick={onOpen}>
      <div className="explore-card__photo">
        <img src={cafe.images?.[0]} alt={cafe.name} loading="lazy" />
      </div>

      <div className="explore-card__body">
        <div className="explore-card__row">
          <div className="explore-card__info">
            <h3 className="explore-card__name">{cafe.name}</h3>
            <p className="explore-card__meta">
              {cafe.suburb}
              {cafe.distanceKm != null ? ` · ${formatDistance(cafe.distanceKm)}` : ''}
              {priceLabel(cafe.priceLevel) ? ` · ${priceLabel(cafe.priceLevel)}` : ''}
            </p>
          </div>
          {cafe.rating != null && (
            <span className="explore-card__rating">
              <StarIcon />
              {cafe.rating.toFixed(1)}
            </span>
          )}
          {onToggleSave && (
            <button
              className={`explore-card__save${isSaved ? ' is-saved' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleSave(cafe.id); }}
              aria-label={isSaved ? 'Unsave cafe' : 'Save cafe'}
            >
              <HeartIcon filled={isSaved} />
            </button>
          )}
        </div>

        {tags.length > 0 && (
          <div className="explore-card__tags">
            {tags.map((t) => <span key={t} className="explore-card__tag">{t}</span>)}
          </div>
        )}
      </div>
    </article>
  );
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
