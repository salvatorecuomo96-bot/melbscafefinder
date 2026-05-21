import ExploreCard from '../ExploreCard/ExploreCard.jsx';
import './ExploreSection.css';

export default function ExploreSection({ title, cafes, isSaved, onToggleSave, onOpen }) {
  if (!cafes || cafes.length === 0) return null;
  return (
    <section className="explore-section">
      <h2 className="explore-section__title">{title}</h2>
      <div className="explore-section__track">
        {cafes.map((cafe) => (
          <ExploreCard
            key={cafe.id}
            cafe={cafe}
            isSaved={isSaved(cafe.id)}
            onToggleSave={onToggleSave}
            onOpen={() => onOpen(cafe)}
          />
        ))}
      </div>
    </section>
  );
}
