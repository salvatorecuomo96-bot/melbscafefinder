import './BottomNav.css';

export default function BottomNav({ activeTab, onChange, savedCount }) {
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      <button
        className={`bottom-nav__tab${activeTab === 'explore' ? ' is-active' : ''}`}
        onClick={() => onChange('explore')}
      >
        <ExploreIcon active={activeTab === 'explore'} />
        <span>Explore</span>
      </button>
      <button
        className={`bottom-nav__tab${activeTab === 'map' ? ' is-active' : ''}`}
        onClick={() => onChange('map')}
      >
        <MapIcon active={activeTab === 'map'} />
        <span>Map</span>
      </button>
      <button
        className={`bottom-nav__tab${activeTab === 'saved' ? ' is-active' : ''}`}
        onClick={() => onChange('saved')}
      >
        <SavedIcon active={activeTab === 'saved'} />
        <span>Saved{savedCount > 0 ? ` · ${savedCount}` : ''}</span>
      </button>
    </nav>
  );
}

function ExploreIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
        fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={active ? 1.5 : 1.8} />
    </svg>
  );
}

function MapIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"
        fill={active ? 'rgba(0,0,0,0.08)' : 'none'} />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function SavedIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={active ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
