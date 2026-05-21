import { useMemo, useState } from 'react';
import { CAFES } from '../data/cafes.js';
import { DEFAULT_FILTERS } from '../constants/filters.js';
import { haversineKm } from '../utils/distance.js';

/**
 * Centralised filter + sort logic.
 * - Owns the filters state.
 * - Returns the visible cafe list, plus helpers to update filters.
 *
 * Why a hook: keeps Home.jsx readable, and we can reuse this from
 * a future map view, or test it in isolation.
 */
export function useCafeFilters({ userCoords } = {}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('rating');

  const visibleCafes = useMemo(() => {
    const q = filters.query.trim().toLowerCase();

    let list = CAFES.filter((cafe) => {
      // Text search across name + suburb + tags
      if (q) {
        const haystack = [
          cafe.name,
          cafe.suburb,
          cafe.address,
          ...(cafe.tags || [])
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Boolean filters (only enforce ones the user turned ON)
      for (const [key, isOn] of Object.entries(filters.booleans)) {
        if (isOn && !cafe[key]) return false;
      }

      // Plant milk: cafe must offer ALL selected milks
      if (filters.plantMilk.length) {
        const offered = new Set(cafe.plantMilk || []);
        if (!filters.plantMilk.every((m) => offered.has(m))) return false;
      }

      // Price level: cafe must be one of the selected
      if (filters.priceLevels.length && !filters.priceLevels.includes(cafe.priceLevel)) {
        return false;
      }

      if (filters.minRating && cafe.rating < filters.minRating) return false;
      if (filters.minCoffeeQuality && cafe.coffeeQuality < filters.minCoffeeQuality) return false;

      return true;
    });

    // Decorate with distance so we can sort and display
    list = list.map((cafe) => ({
      ...cafe,
      distanceKm: userCoords ? haversineKm(userCoords, cafe) : null
    }));

    // Sort
    list.sort((a, b) => {
      if (sort === 'distance') {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      }
      return (b[sort] ?? 0) - (a[sort] ?? 0);
    });

    return list;
  }, [filters, sort, userCoords]);

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
    togglePlantMilk,
    togglePriceLevel,
    setMinRating,
    setMinCoffeeQuality,
    reset
  };
}
