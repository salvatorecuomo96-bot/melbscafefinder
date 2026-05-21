import { useState, useEffect } from 'react';

const STORAGE_KEY = 'mcf_saved';

// Persists saved cafe IDs to localStorage.
// No backend needed — migrates to Supabase in Phase 4.
export function useSavedCafes() {
  const [savedIds, setSavedIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...savedIds]));
  }, [savedIds]);

  const toggleSave = (id) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isSaved = (id) => savedIds.has(id);

  return { isSaved, toggleSave, savedCount: savedIds.size };
}
