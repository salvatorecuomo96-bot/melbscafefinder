import { useState, useEffect } from 'react';

const STORAGE_KEY = 'mcf_saved';

function getUrlSavedIds() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('saved');
    return raw ? raw.split(',').filter(Boolean) : [];
  } catch { return []; }
}

export function useSavedCafes() {
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const local = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
      const fromUrl = getUrlSavedIds();
      fromUrl.forEach(id => local.add(id));
      // Clean URL param without reloading
      if (fromUrl.length > 0) {
        const url = new URL(window.location.href);
        url.searchParams.delete('saved');
        window.history.replaceState({}, '', url);
      }
      return local;
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

  const getShareUrl = () => {
    if (savedIds.size === 0) return null;
    const url = new URL(window.location.origin);
    url.searchParams.set('saved', [...savedIds].join(','));
    return url.toString();
  };

  return { isSaved, toggleSave, savedCount: savedIds.size, getShareUrl };
}
