import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_FILTERS, FILTER_SECTIONS } from '../constants/filters.js';
import { haversineKm } from '../utils/distance.js';
import { openStatus } from '../utils/format.js';

const BOOL_KEYS = FILTER_SECTIONS.flatMap((s) => (s.booleans || []).map((b) => b.key));
const ENUM_KEYS = FILTER_SECTIONS.flatMap((s) => (s.enums || []).map((e) => e.key));

export function useCafeFilters({ cafes = [], userCoords, activePreset } = {}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('rating');

  // Debounce the search query: input updates immediately, filtering waits 200 ms
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(filters.query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [filters.query]);

  // Count how many cafes match each filter option (for display in drawer)
  const filterCounts = useMemo(() => {
    const booleans = {}, enums = {}, brands = {}, plantMilk = {};
    let openNow = 0;
    for (const cafe of cafes) {
      for (const key of BOOL_KEYS) {
        if (cafe[key] === true) booleans[key] = (booleans[key] || 0) + 1;
      }
      for (const key of ENUM_KEYS) {
        if (cafe[key]) {
          if (!enums[key]) enums[key] = {};
          enums[key][cafe[key]] = (enums[key][cafe[key]] || 0) + 1;
        }
      }
      if (cafe.coffeeBrand) brands[cafe.coffeeBrand] = (brands[cafe.coffeeBrand] || 0) + 1;
      for (const milk of (cafe.plantMilk || [])) {
        plantMilk[milk] = (plantMilk[milk] || 0) + 1;
      }
      if (openStatus(cafe.openingHours).isOpen) openNow++;
    }
    return { booleans, enums, brands, plantMilk, openNow };
  }, [cafes]);

  const visibleCafes = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();

    let list = cafes.filter((cafe) => {
      if (q) {
        const haystack = [cafe.name, cafe.suburb, cafe.address, ...(cafe.tags || [])]
          .join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Boolean: hard match — only show cafes explicitly marked true
      for (const [key, isOn] of Object.entries(filters.booleans)) {
        if (isOn && cafe[key] !== true) return false;
      }

      // Enum: hard match — null does NOT pass when filter is active
      for (const [key, val] of Object.entries(filters.enums)) {
        if (val && cafe[key] !== val) return false;
      }

      // Coffee brands: hard match
      if (filters.coffeeBrands.length) {
        if (!filters.coffeeBrands.includes(cafe.coffeeBrand)) return false;
      }

      // Plant milk: must offer ALL selected milks
      if (filters.plantMilk.length) {
        const offered = new Set(cafe.plantMilk || []);
        if (!filters.plantMilk.every((m) => offered.has(m))) return false;
      }

      if (filters.priceLevels.length && !filters.priceLevels.includes(cafe.priceLevel)) {
        return false;
      }

      if (filters.minRating && cafe.rating < filters.minRating) return false;

      if (filters.openNow && !openStatus(cafe.openingHours).isOpen) return false;

      return true;
    });

    list = list.map((cafe) => ({
      ...cafe,
      distanceKm: userCoords ? haversineKm(userCoords, cafe) : null,
    }));

    list.sort((a, b) => {
      if (sort === 'distance') {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      }

      if (activePreset) {
        const prefScore = (cafe) =>
          Object.entries(activePreset.preferred || {}).reduce((n, [k, v]) => {
            if (v === false) return cafe[k] === false ? n + 1 : n;
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
        const C = 4.2, m = 150;
        const CBD_LAT = -37.8136, CBD_LNG = 144.9631;
        const bayesian = (c) => {
          const v = c.userRatingsTotal ?? 0;
          return (v / (v + m)) * (c.rating ?? 0) + (m / (v + m)) * C;
        };
        const proximityBonus = (c) => {
          const d = Math.sqrt((c.latitude - CBD_LAT) ** 2 + (c.longitude - CBD_LNG) ** 2) * 111;
          return Math.max(0, 1 - d / 40);
        };
        const score = (c) => bayesian(c) * (0.6 + 0.4 * proximityBonus(c));
        return score(b) - score(a);
      }

      return (b[sort] ?? 0) - (a[sort] ?? 0);
    });

    return list;
  }, [cafes, filters, debouncedQuery, sort, userCoords, activePreset]);

  const toggleBoolean = (key) =>
    setFilters((f) => ({ ...f, booleans: { ...f.booleans, [key]: !f.booleans[key] } }));

  const toggleEnum = (key, value) =>
    setFilters((f) => ({
      ...f,
      enums: { ...f.enums, [key]: f.enums[key] === value ? undefined : value },
    }));

  const toggleCoffeeBrand = (brand) =>
    setFilters((f) => ({
      ...f,
      coffeeBrands: f.coffeeBrands.includes(brand)
        ? f.coffeeBrands.filter((b) => b !== brand)
        : [...f.coffeeBrands, brand],
    }));

  const togglePlantMilk = (milk) =>
    setFilters((f) => ({
      ...f,
      plantMilk: f.plantMilk.includes(milk)
        ? f.plantMilk.filter((m) => m !== milk)
        : [...f.plantMilk, milk],
    }));

  const togglePriceLevel = (level) =>
    setFilters((f) => ({
      ...f,
      priceLevels: f.priceLevels.includes(level)
        ? f.priceLevels.filter((l) => l !== level)
        : [...f.priceLevels, level],
    }));

  const setQuery = (query) => setFilters((f) => ({ ...f, query }));
  const setMinRating = (n) => setFilters((f) => ({ ...f, minRating: n }));
  const toggleOpenNow = () => setFilters((f) => ({ ...f, openNow: !f.openNow }));
  const reset = () => setFilters(DEFAULT_FILTERS);
  const setBooleans = (booleans) => setFilters((f) => ({ ...f, booleans }));

  const activeCount =
    Object.values(filters.booleans).filter(Boolean).length +
    Object.values(filters.enums).filter(Boolean).length +
    filters.coffeeBrands.length +
    filters.plantMilk.length +
    filters.priceLevels.length +
    (filters.minRating ? 1 : 0) +
    (filters.openNow ? 1 : 0);

  return {
    filters, sort, setSort, visibleCafes, filterCounts, activeCount,
    setQuery, toggleBoolean, toggleEnum, toggleCoffeeBrand,
    togglePlantMilk, togglePriceLevel, setBooleans, setMinRating, toggleOpenNow, reset,
  };
}
