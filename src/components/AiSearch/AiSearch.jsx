import { useState } from 'react';
import './AiSearch.css';

const EXAMPLE = 'somewhere quiet to sit with my laptop and a good flat white';

export default function AiSearch({ onApply, onClear }) {
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [label, setLabel]     = useState(null);

  const submit = async (q) => {
    const text = (q || query).trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    setLabel(null);
    try {
      const res = await fetch('/api/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      if (data.filters) {
        onApply(data.filters);
        setLabel(data.label || 'Filters applied');
        setQuery('');
      }
    } catch {
      setError('Could not understand that. Try being more specific.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-search">
      <div className="ai-search__bar">
        <span className="ai-search__icon" aria-hidden="true">✦</span>
        <input
          className="ai-search__input"
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLabel(null); setError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Describe what you're looking for…"
          disabled={loading}
        />
        {query && (
          <button
            className="ai-search__submit"
            onClick={() => submit()}
            disabled={loading}
            aria-label="Search"
          >
            {loading ? '…' : '→'}
          </button>
        )}
      </div>
      {label && (
        <div className="ai-search__result">
          <p className="ai-search__label">✓ {label}</p>
          <button className="ai-search__clear" onClick={() => { setLabel(null); onClear?.(); }}>
            ✕ Clear
          </button>
        </div>
      )}
      {error && <p className="ai-search__error">{error}</p>}
    </div>
  );
}
