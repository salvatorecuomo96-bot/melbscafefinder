import { useMemo, useState } from 'react';
import { DEFAULT_FILTERS } from '../constants/filters.js';
import { haversineKm } from '../utils/distance.js';

export function useCafeFilters({ cafes = [], userCoords, activePreset } = {}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('rating');

  const visibleCafes = useMemo(() => {
    const q = filters.query.trim().toLowerCase();

    let list = cafes.filter((cafe) => {
      // Text search across name + suburb + tags
      if (q) {
        const haystack = [cafe.name, cafe.suburb, cafe.address, ...(cafe.tags || [])]
          .join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Boolean filters — only exclude if explicitly false; null means unknown, keep it
      for (const [key, isOn] of Object.entries(filters.booleans)) {
        if (isOn && cafe[key] === false) return false;
      }

      // Plant milk: cafe must offer ALL selected milks
      if (filters.plantMilk.length) {
        const offered = new Set(cafe.plantMilk || []);
        if (!filters.plantMilk.every((m) => offered.has(m))) return false;
      }

      // Price level
      if (filters.priceLevels.length && !filters.priceLevels.includes(cafe.priceLevel)) {
        return false;
      }

      if (filters.minRating && cafe.rating < filters.minRating) return false;
      if (filters.minCoffeeQuality && cafe.coffeeQuality < filters.minCoffeeQuality) return false;

      return true;
    });

    // Decorate with distance
    list = list.map((cafe) => ({
      ...cafe,
      distanceKm: userCoords ? haversineKm(userCoords, cafe) : null
    }));

    // Sort: preset rankBy takes priority over the sort dropdown,
    // unless the user explicitly switched to distance/near-me.
    list.sort((a, b) => {
      if (sort === 'distance') {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      }

      // Preset-aware ranking: score each cafe by how many preferred fields it matches,
      // then fall back to the preset's rankBy fields in order.
      if (activePreset) {
        const prefScore = (cafe) =>
          Object.entries(activePreset.preferred || {}).reduce((n, [k, v]) => {
            if (v === false) return cafe[k] === false ? n + 1 : n; // penalise mismatch
            return cafe[k] === v ? n + 1 : n;
          }, 0);

        const scoreDiff = prefScore(b) - prefScore(a);
        if (scoreDiff !== 0) return scoreDiff;

        for (const field of (activePreset.rankBy || [])) {
          const diff = (b[field] ?? 0) - (a[field] ?? 0);
          if (diff !== 0) return diff;
        }
        return 0;
      }

      if (sort === 'rating') {
        // Require at least 40 reviews to rank by rating; push low-review cafes to the bottom
        const aValid = (a.userRatingsTotal ?? 0) >= 40;
        const bValid = (b.userRatingsTotal ?? 0) >= 40;
        if (aValid !== bValid) return aValid ? -1 : 1;
        return (b.rating ?? 0) - (a.rating ?? 0);
      }

      return (b[sort] ?? 0) - (a[sort] ?? 0);
    });

    return list;
  }, [cafes, filters, sort, userCoords, activePreset]);

  // ---- Update helpers ----
  const toggleBoolean = (key) =>
    setFilters((f) => ({
      ...f,
      booleans: { ...f.booleans, [key]: !f.booleans[key] }
    }));

  const togglePlantMilk = (milk) =>
    setFilters((f) => ({
      ...f,
      plantMilk: f.plantMilk.includes(milk)
        ? f.plantMilk.filter((m) => m !== milk)
        : [...f.plantMilk, milk]
    }));

  const togglePriceLevel = (level) =>
    setFilters((f) => ({
      ...f,
      priceLevels: f.priceLevels.includes(level)
        ? f.priceLevels.filter((l) => l !== level)
        : [...f.priceLevels, level]
    }));

  const setQuery = (query) => setFilters((f) => ({ ...f, query }));
  const setMinRating = (n) => setFilters((f) => ({ ...f, minRating: n }));
  const setMinCoffeeQuality = (n) => setFilters((f) => ({ ...f, minCoffeeQuality: n }));
  const reset = () => setFilters(DEFAULT_FILTERS);
  // Used by mood presets: replace all booleans at once.
  // Pass {} to clear all boolean filters.
  const setBooleans = (booleans) => setFilters((f) => ({ ...f, booleans }));

  // Active filter count (for the "Filters (3)" badge)
  const activeCount =
    Object.values(filters.booleans).filter(Boolean).length +
    filters.plantMilk.length +
    filters.priceLevels.length +
    (filters.minRating ? 1 : 0) +
    (filters.minCoffeeQuality ? 1 : 0);

  return {
    filters,
    sort,
    setSort,
    visibleCafes,
    activeCount,
    setQuery,
    toggleBoolean,
    setBooleans,
    togglePlantMilk,
    togglePriceLevel,
    setMinRating,
    setMinCoffeeQuality,
    reset
  };
}
