import { useEffect, useState } from 'react';
import { priceLabel, openStatus, plantMilkLabel } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import Lightbox from '../Lightbox/Lightbox.jsx';
import { MatchPanel } from '../MatchBadge/MatchBadge.jsx';
import './CafeDetail.css';

function bestForTags(cafe) {
  const tags = [];
  if (cafe.laptopFriendly || (cafe.hasWifi && cafe.hasPowerOutlets)) tags.push('Working');
  if (cafe.outdoorSeating && cafe.dogFriendly) tags.push('Dogs outside');
  else if (cafe.dogFriendly) tags.push('Dog friendly');
  if (cafe.specialtyCoffee) tags.push('Specialty coffee');
  if (cafe.filterCoffee) tags.push('Filter coffee');
  if (cafe.matcha) tags.push('Matcha');
  if (cafe.breakfastAllDay) tags.push('All-day brekkie');
  if (cafe.outdoorSeating && !cafe.dogFriendly) tags.push('Outdoor seating');
  if (cafe.noiseLevel === 'quiet') tags.push('Quiet');
  if (cafe.noiseLevel === 'lively' || cafe.noiseLevel === 'loud') tags.push('Lively');
  return tags.slice(0, 5);
}

function knownDetails(cafe) {
  return [
    cafe.hasWifi          && 'Wi-Fi',
    cafe.hasPowerOutlets  && 'Power outlets',
    cafe.laptopFriendly   && 'Laptop friendly',
    cafe.outdoorSeating   && 'Outdoor seating',
    cafe.dogFriendly      && 'Dog friendly',
    cafe.hasDecaf         && 'Decaf',
    cafe.pastries         && 'Pastries',
    cafe.filterCoffee     && 'Filter coffee',
  ].filter(Boolean);
}

export default function CafeDetail({ cafe, match, onClose }) {
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [copied, setCopied]           = useState(false);
  const [hoursOpen, setHoursOpen]     = useState(false);

  const handleShare = () => {
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

  useEffect(() => {
    if (!cafe) return;
    setHoursOpen(false);
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
  const images   = cafe.images || [];
  const bestFor  = bestForTags(cafe);
  const details  = knownDetails(cafe);

  const days = [
    ['mon','Mon'],['tue','Tue'],['wed','Wed'],
    ['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun'],
  ];

  const suggestEditUrl = `mailto:salvatore.cuomo96@gmail.com?subject=${encodeURIComponent(`Edit suggestion: ${cafe.name}`)}&body=${encodeURIComponent(`Hi,\n\nI'd like to suggest a correction for ${cafe.name} (${cafe.suburb}):\n\n`)}`;

  return (
    <>
      <div className="detail" onClick={onClose} role="dialog" aria-modal="true" aria-label={cafe.name}>
        <button
          className="detail__close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="detail__sheet" onClick={(e) => e.stopPropagation()}>
          <div className="detail__handle" aria-hidden="true" />

          {/* ── Photos ── */}
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
            {/* ── Match panel ── */}
            <MatchPanel match={match} />

            {/* ── Header ── */}
            <header className="detail__head">
              <div className="detail__head-info">
                <h2 className="detail__name">{cafe.name}</h2>
                <p className="detail__meta">
                  {cafe.suburb}
                  {priceLabel(cafe.priceLevel) ? ` · ${priceLabel(cafe.priceLevel)}` : ''}
                  {cafe.coffeeBrand ? ` · ${cafe.coffeeBrand}` : ''}
                </p>
                <p className="detail__address">{cafe.address}</p>
              </div>
              <div className="detail__head-right">
                {cafe.rating != null && (
                  <div className="detail__rating">
                    <StarIcon />
                    <span>{cafe.rating.toFixed(1)}</span>
                  </div>
                )}
                <div className={`detail__status ${isOpen ? 'is-open' : ''}`}>
                  <span className="detail__statusDot" />
                  {openLabel}
                </div>
                {cafe.distanceKm != null && (
                  <p className="detail__distance">{formatDistance(cafe.distanceKm)} away</p>
                )}
              </div>
            </header>

            {/* ── Decision summary ── */}
            {(bestFor.length > 0 || details.length > 0) && (
              <section className="detail__summary">
                {bestFor.length > 0 && (
                  <div className="detail__summary-row">
                    <span className="detail__summary-label">Best for</span>
                    <div className="detail__chips detail__chips--best">
                      {bestFor.map(t => <span key={t} className="detail__chip detail__chip--best">{t}</span>)}
                    </div>
                  </div>
                )}
                {details.length > 0 && (
                  <div className="detail__summary-row">
                    <span className="detail__summary-label">Details</span>
                    <div className="detail__chips">
                      {details.map(t => <span key={t} className="detail__chip">{t}</span>)}
                      {cafe.noiseLevel && (
                        <span className="detail__chip">
                          {cafe.noiseLevel.charAt(0).toUpperCase() + cafe.noiseLevel.slice(1)} noise
                        </span>
                      )}
                      {cafe.plantMilk?.length > 0 && (
                        <span className="detail__chip">{plantMilkLabel(cafe.plantMilk)} milk</span>
                      )}
                      {cafe.chaiType && (
                        <span className="detail__chip">
                          {cafe.chaiType === 'leaf' ? 'Loose-leaf chai' : 'Powder chai'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── Description ── */}
            {cafe.shortDescription && (
              <p className="detail__desc">{cafe.shortDescription}</p>
            )}

            {/* ── Hours ── */}
            <section className="detail__section">
              <button
                className="detail__hours-toggle"
                onClick={() => setHoursOpen(o => !o)}
              >
                <span>Hours</span>
                <ChevronIcon open={hoursOpen} />
              </button>
              {hoursOpen && (
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
              )}
            </section>

            {/* ── Actions ── */}
            <div className="detail__actions">
              <a
                className="detail__btn detail__btn--primary"
                target="_blank"
                rel="noreferrer"
                href={cafe.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cafe.name} ${cafe.address}`)}`}
              >
                <MapPinIcon /> Maps
              </a>
              {cafe.website && (
                <a className="detail__btn" href={cafe.website} target="_blank" rel="noreferrer">
                  <WebIcon /> Website
                </a>
              )}
              {cafe.phone && (
                <a className="detail__btn" href={`tel:${cafe.phone}`}>
                  <PhoneIcon /> Call
                </a>
              )}
              <button className="detail__btn" onClick={handleShare}>
                <ShareIcon /> {copied ? 'Copied!' : 'Share'}
              </button>
            </div>

            {/* ── Suggest edit ── */}
            <div className="detail__footer">
              <a href={suggestEditUrl} className="detail__suggest">
                Something wrong? Suggest an edit
              </a>
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

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.95 6.7L22 9.27l-5.2 5.06L18.18 22 12 18.27 5.82 22l1.38-7.67L2 9.27l7.05-.57L12 2z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}
      aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function WebIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}
