import { useEffect, useState } from 'react';
import { priceLabel, openStatus, plantMilkLabel } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import Lightbox from '../Lightbox/Lightbox.jsx';
import './CafeDetail.css';

export default function CafeDetail({ cafe, onClose }) {
  const [lightboxIdx, setLightboxIdx] = useState(null);

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
  const images = cafe.images || [];

  const featureRows = [
    ['Specialty coffee',  cafe.specialtyCoffee],
    ['Filter coffee',     cafe.filterCoffee],
    ['Decaf',             cafe.hasDecaf],
    ['Matcha',            cafe.matcha],
    ['Pastries',          cafe.pastries],
    ['All-day breakfast', cafe.breakfastAllDay],
    ['WiFi',              cafe.hasWifi],
    ['Power outlets',     cafe.hasPowerOutlets],
    ['Laptop friendly',   cafe.laptopFriendly],
    ['Outdoor seating',   cafe.outdoorSeating],
    ['Dog friendly',      cafe.dogFriendly],
    ['Pram friendly',     cafe.pramFriendly],
  ].filter(([, v]) => v != null);

  const days = [
    ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'],
    ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
  ];

  return (
    <>
      <div className="detail" onClick={onClose} role="dialog" aria-modal="true" aria-label={cafe.name}>
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
          {images.length > 0 && (
            <div className="detail__gallery">
              {images.map((src, i) => (
                <div key={i} className="detail__gallery-item" onClick={() => setLightboxIdx(i)}>
                  <img src={src} alt={`${cafe.name} ${i + 1}`} />
                  {i === 0 && images.length > 1 && (
                    <span className="detail__gallery-count">
                      <ExpandIcon /> {images.length}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="detail__body">
            <div className="detail__handle" aria-hidden="true" />
            <header className="detail__head">
              <div>
                <h2 className="detail__name">{cafe.name}</h2>
                <p className="detail__meta">
                  {cafe.suburb}
                  {priceLabel(cafe.priceLevel) ? ` · ${priceLabel(cafe.priceLevel)}` : ''}
                  {cafe.vibe ? ` · ${cafe.vibe}` : ''}
                  {cafe.coffeeBrand ? ` · ${cafe.coffeeBrand}` : ''}
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

            {featureRows.length > 0 && (
              <section className="detail__section">
                <h3>What's here</h3>
                <ul className="detail__features">
                  {featureRows.map(([label, on]) => (
                    <li key={label} className={on ? 'is-on' : 'is-off'}>
                      <span className="detail__feat-icon">{on ? '✓' : '✕'}</span>
                      {label}
                    </li>
                  ))}
                </ul>
                {cafe.noiseLevel && (
                  <p className="detail__attr">Noise level: <strong>{cafe.noiseLevel}</strong></p>
                )}
                {cafe.chaiType && (
                  <p className="detail__attr">Chai: <strong>{cafe.chaiType === 'leaf' ? 'Loose leaf' : cafe.chaiType === 'powder' ? 'Powder' : cafe.chaiType}</strong></p>
                )}
                {cafe.plantMilk?.length > 0 && (
                  <p className="detail__attr">Plant milk: <strong>{plantMilkLabel(cafe.plantMilk)}</strong></p>
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
                <a className="detail__btn" href={cafe.website} target="_blank" rel="noreferrer">Website</a>
              )}
              {cafe.phone && (
                <a className="detail__btn" href={`tel:${cafe.phone}`}>{cafe.phone}</a>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightboxIdx !== null && (
        <Lightbox
          images={images}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}

function Star() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}
