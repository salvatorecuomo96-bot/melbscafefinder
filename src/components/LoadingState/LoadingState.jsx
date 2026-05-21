import './LoadingState.css';

/**
 * Skeleton cards shown while data loads.
 * Wired up later when we fetch from Supabase / Firestore.
 */
export default function LoadingState({ count = 6 }) {
  return (
    <ul className="loading" aria-label="Loading cafes">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="loading__card">
          <div className="loading__img shimmer" />
          <div className="loading__line shimmer" style={{ width: '60%' }} />
          <div className="loading__line shimmer" style={{ width: '40%' }} />
          <div className="loading__line shimmer" style={{ width: '90%' }} />
        </li>
      ))}
    </ul>
  );
}
