import MoodPresets from '../MoodPresets/MoodPresets.jsx';
import ExploreSection from '../ExploreSection/ExploreSection.jsx';
import './MobileExplore.css';

export default function MobileExplore({
  cafes,
  isSaved,
  onToggleSave,
  onOpen,
  activePreset,
  onPresetSelect,
  hidden,
}) {
  const forYou = [...cafes].sort((a, b) => b.rating - a.rating).slice(0, 10);
  const quietWork = cafes.filter((c) => c.laptopFriendly && c.hasWifi).sort((a, b) => b.rating - a.rating);
  const firstDate = cafes.filter((c) => c.goodForDates).sort((a, b) => b.rating - a.rating);
  const matchaPastry = cafes.filter((c) => c.matcha && c.pastries).sort((a, b) => b.rating - a.rating);
  const savedCafes = cafes.filter((c) => isSaved(c.id));

  return (
    <div className={`mobile-explore${hidden ? ' mobile-explore--hidden' : ''}`}>
      <header className="mobile-explore__header">
        <span className="mobile-explore__logo" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#1a1a1a" />
            <path d="M20 22h22a6 6 0 0 1 0 12h-2v4a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V22zm22 4v6a2 2 0 0 0 0-6z" fill="#e8c39e" />
          </svg>
        </span>
        <span className="mobile-explore__wordmark">Melbourne <em>Cafe</em> Finder</span>
      </header>

      <div className="mobile-explore__moods">
        <MoodPresets activePresetId={activePreset?.id} onSelect={onPresetSelect} />
      </div>

      <div className="mobile-explore__feed">
        <ExploreSection title="For you" cafes={forYou} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
        <ExploreSection title="Quiet work nearby" cafes={quietWork} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
        <ExploreSection title="First date spots" cafes={firstDate} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
        <ExploreSection title="Matcha + pastry" cafes={matchaPastry} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
        {savedCafes.length > 0 && (
          <ExploreSection title="Your saved spots" cafes={savedCafes} isSaved={isSaved} onToggleSave={onToggleSave} onOpen={onOpen} />
        )}
      </div>
    </div>
  );
}
