import { useEffect, useState } from 'react';
import { priceLabel, openStatus } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import Lightbox from '../Lightbox/Lightbox.jsx';
import './CafeDetail.css';

export default function CafeDetail({ cafe, onClose, isSaved, onToggleSave }) {
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [menuOpen, setMenuOpen]       = useState(false);
  const [copied, setCopied]           = useState(false);

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
  const menuImages = cafe.menuImages || [];

  const days = [
    ['mon','Mon'],['tue','Tue'],['wed','Wed'],
    ['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun'],
  ];

  const hoursKnown = days.some(([k]) => {
    const v = cafe.openingHours?.[k];
    return v && v.toLowerCase() !== 'closed';
  });

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

            {/* ── Description ── */}
            {cafe.shortDescription && (
              <p className="detail__desc">{cafe.shortDescription}</p>
            )}

            {/* ── Hours ── */}
            <section className="detail__section">
              <div className="detail__hours-row">
                <span className="detail__hours-label">Hours</span>
                <div className="detail__hours-actions">
                  {onToggleSave && (
                    <button
                      className={`detail__icon-btn${isSaved ? ' is-saved' : ''}`}
                      onClick={() => onToggleSave(cafe.id)}
                      aria-label={isSaved ? 'Unsave' : 'Save'}
                    >
                      <HeartIcon filled={isSaved} />
                    </button>
                  )}
                  <button className="detail__icon-btn" onClick={handleShare} aria-label="Share">
                    {copied ? <CheckIcon /> : <DotsIcon />}
                  </button>
                </div>
              </div>
              {hoursKnown ? (
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
              ) : (
                <p className="detail__hours-unavailable">Hours not available</p>
              )}
            </section>

            {/* ── Actions ── */}
            <div className="detail__actions">
              <a
                className="detail__btn detail__btn--primary"
                href={cafe.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cafe.name} ${cafe.address}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPinIcon /> Maps
              </a>
              {menuImages.length > 0 && (
                <button
                  className="detail__btn"
                  onClick={() => setMenuOpen(true)}
                  aria-label={`View menu (${menuImages.length} ${menuImages.length === 1 ? 'photo' : 'photos'})`}
                >
                  <MenuIcon /> Menu
                </button>
              )}
              {(cafe.instagram || cafe.facebook || cafe.tiktok) ? (
                <a
                  className="detail__btn"
                  href={cafe.instagram || cafe.facebook || cafe.tiktok}
                  target="_blank"
                  rel="noreferrer"
                >
                  <SocialIcon /> Social
                </a>
              ) : cafe.website ? (
                <a
                  className="detail__btn"
                  href={cafe.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GlobeIcon /> Website
                </a>
              ) : null}
            </div>

            {/* ── Photo credit + takedown ── */}
            <p className="detail__credit">
              Photos via Google &amp; business listings.{' '}
              <a
                href={`mailto:salvatore.cuomo96@gmail.com?subject=${encodeURIComponent(`Photo removal request — ${cafe.name}`)}&body=${encodeURIComponent(`Please remove a photo for "${cafe.name}" (${cafe.suburb}).\n\nWhich photo / reason:\n`)}`}
              >
                Report a photo
              </a>
            </p>

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

      {menuOpen && (
        <Lightbox
          images={menuImages}
          startIndex={0}
          onClose={() => setMenuOpen(false)}
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


function InstagramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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


function HeartIcon({ filled }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function SocialIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18M3 12h18M3 19h12"/>
    </svg>
  );
}

