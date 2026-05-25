import { useState } from 'react';
import CafeCard from '../CafeCard/CafeCard.jsx';
import './MobileSaved.css';

export default function MobileSaved({ cafes, savedCafes, isSaved, onToggleSave, onOpen, getShareUrl }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link to share your saved cafes:', url);
    }
  };

  return (
    <div className="mobile-saved">
      <header className="mobile-saved__header">
        <h1 className="mobile-saved__title">Saved</h1>
        <div className="mobile-saved__header-right">
          {savedCafes.length > 0 && (
            <span className="mobile-saved__count">{savedCafes.length}</span>
          )}
          {savedCafes.length > 0 && (
            <button className="mobile-saved__share" onClick={handleShare}>
              {copied ? 'Copied!' : 'Share'}
            </button>
          )}
        </div>
      </header>

      {savedCafes.length === 0 ? (
        <div className="mobile-saved__empty">
          <span className="mobile-saved__empty-icon" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </span>
          <p className="mobile-saved__empty-text">No saved cafes yet</p>
          <p className="mobile-saved__empty-sub">Tap the heart on any cafe to save it</p>
        </div>
      ) : (
        <ul className="mobile-saved__list">
          {savedCafes.map((cafe) => (
            <li key={cafe.id}>
              <CafeCard
                cafe={cafe}
                isSaved={isSaved(cafe.id)}
                onToggleSave={onToggleSave}
                onOpen={() => onOpen(cafe)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
