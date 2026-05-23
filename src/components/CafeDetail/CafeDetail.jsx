import { useEffect } from 'react';
import { priceLabel, openStatus, plantMilkLabel } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import './CafeDetail.css';

/**
 * Full cafe detail rendered as a bottom sheet on mobile
 * and a centered modal on desktop. Closes on ESC or backdrop click.
 */
export default function CafeDetail({ cafe, onClose }) {
  useEffect(() => {
    if (!cafe) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [cafe, onClose]);

  if (!cafe) return null;

  const { isOpen, label: openLabel } = openStatus(cafe.openingHours);

  const featureRows = [
    ['Wi-Fi', cafe.hasWifi],
    ['Laptop friendly', cafe.laptopFriendly],
    ['Outdoor seating', cafe.outdoorSeating],
    ['Quiet', cafe.quiet],
    ['Dog friendly', cafe.dogFriendly],
    ['Decaf available', cafe.hasDecaf],
    ['Specialty coffee', cafe.specialtyCoffee],
    ['Matcha', cafe.matcha],
    ['Pastries', cafe.pastries],
    ['Good for dates', cafe.goodForDates],
    ['Good for work', cafe.goodForWork],
    ['Good for groups', cafe.goodForGroups]
  ];

  const days = [
    ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'],
    ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']
  ];

  return (
    <div className="detail" onClick={onClose} role="dialog" aria-modal="true" aria-label={cafe.name}>
      {/* Close button is OUTSIDE the scrollable sheet so it never scrolls away.
          position:fixed on mobile keeps it pinned to the viewport top-right. */}
      <button
        className="detail__close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="detail__sheet" onClick={(e) => e.stopPropagation()}>
        {cafe.images?.length > 0 && (
          <div className="detail__gallery">
            {cafe.images.map((src, i) => (
              <img key={i} src={src} alt={`${cafe.name} ${i + 1}`} />
            ))}
          </div>
        )}

        <div className="detail__body">
          <div className="detail__handle" aria-hidden="true" />
          <header className="detail__head">
            <div>
              <h2 className="detail__name">{cafe.name}</h2>
              <p className="detail__meta">
                {cafe.suburb}{priceLabel(cafe.priceLevel) ? ` · ${priceLabel(cafe.priceLevel)}` : ''}{cafe.vibe ? ` · ${cafe.vibe}` : ''}
              </p>
              <p className="detail__address">{cafe.address}</p>
            </div>
            {cafe.rating != null && (
              <div className="detail__rating">
                <Star />
                <span>{cafe.rating.toFixed(1)}</span>
              </div>
            )}
          </header>

          <div className={`detail__status ${isOpen ? 'is-open' : ''}`}>
            <span className="detail__statusDot" />
            {openLabel}
            {cafe.distanceKm != null && (
              <span className="detail__distance">· {formatDistance(cafe.distanceKm)} away</span>
            )}
          </div>

          <p className="detail__desc">{cafe.shortDescription}</p>

          <section className="detail__section">
            <h3>What's it like</h3>
            <div className="detail__qualityGrid">
              <Quality label="Coffee" value={cafe.coffeeQuality} />
              <Quality label="Food" value={cafe.foodQuality} />
            </div>

            {cafe.tags?.length > 0 && (
              <ul className="detail__tags">
                {cafe.tags.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
          </section>

          {featureRows.some(([, v]) => v != null) && (
            <section className="detail__section">
              <h3>Features</h3>
              <ul className="detail__features">
                {featureRows.filter(([, v]) => v != null).map(([label, on]) => (
                  <li key={label} className={on ? 'is-on' : 'is-off'}>
                    <span className="detail__feat-icon">{on ? '✓' : '–'}</span>
                    {label}
                  </li>
                ))}
              </ul>
              {cafe.plantMilk != null && (
                <p className="detail__milk">
                  <strong>Milks:</strong> {plantMilkLabel(cafe.plantMilk)}
                </p>
              )}
            </section>
          )}

          <section className="detail__section">
            <h3>Hours</h3>
            <table className="detail__hours">
              <tbody>
                {days.map(([k, label]) => (
                  <tr key={k}>
                    <th>{label}</th>
                    <td>{cafe.openingHours?.[k] || 'Closed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="detail__actions">
            <a
              className="detail__btn detail__btn--primary"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cafe.name} ${cafe.address}`)}`}
            >
              Maps
            </a>
            {cafe.website && (
              <a className="detail__btn" href={cafe.website} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
            {cafe.phone && (
              <a className="detail__btn" href={`tel:${cafe.phone}`}>
                {cafe.phone}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Star() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}

function Quality({ label, value }) {
  return (
    <div className="quality">
      <span className="quality__label">{label}</span>
      <div className="quality__bar" aria-label={`${label} ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= value ? 'is-on' : ''} />
        ))}
      </div>
    </div>
  );
}
