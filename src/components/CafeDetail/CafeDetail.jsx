import { useEffect, useRef, useState } from 'react';
import { priceLabel, openStatus } from '../../utils/format.js';
import { formatDistance } from '../../utils/distance.js';
import Lightbox from '../Lightbox/Lightbox.jsx';
import './CafeDetail.css';

export default function CafeDetail({ cafe, onClose, isSaved, onToggleSave }) {
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [copied, setCopied]           = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const menuRef                       = useRef(null);

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

  const days = [
    ['mon','Mon'],['tue','Tue'],['wed','Wed'],
    ['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun'],
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

            {/* ── Actions ── */}
            <div className="detail__actions">
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
              {cafe.menuText && (
                <button
                  className={`detail__btn${menuOpen ? ' is-active' : ''}`}
                  onClick={() => {
                    setMenuOpen((o) => !o);
                    if (!menuOpen) setTimeout(() => menuRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
                  }}
                >
                  <MenuIcon /> Menu
                </button>
              )}
            </div>

            {/* ── Menu text ── */}
            {cafe.menuText && menuOpen && (
              <section className="detail__section detail__menu" ref={menuRef}>
                <span className="detail__hours-label">Menu</span>
                <p className="detail__menu-text">{cafe.menuText}</p>
              </section>
            )}
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

function MenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="15" y2="18"/>
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
