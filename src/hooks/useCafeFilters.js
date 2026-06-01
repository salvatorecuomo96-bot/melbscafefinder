import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_FILTERS, FILTER_SECTIONS } from '../constants/filters.js';
import { haversineKm } from '../utils/distance.js';
import { openStatus, isOpenLate } from '../utils/format.js';

const BOOL_KEYS = FILTER_SECTIONS.flatMap((s) => (s.booleans || []).map((b) => b.key));
const ENUM_KEYS = FILTER_SECTIONS.flatMap((s) => (s.enums || []).map((e) => e.key));

export function useCafeFilters({ cafes = [], userCoords } = {}) {
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
    const booleans = {}, enums = {}, brands = {};
    let openNow = 0, openLate = 0;
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
      if (openStatus(cafe.openingHours).isOpen) openNow++;
      if (isOpenLate(cafe.openingHours)) openLate++;
    }
    return { booleans, enums, brands, openNow, openLate };
  }, [cafes]);

  const visibleCafes = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();

    let list = cafes.filter((cafe) => {
      if (q) {
        const haystack = [cafe.name, cafe.suburb]
          .join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (filters.suburb && cafe.suburb !== filters.suburb) return false;

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

      if (filters.priceLevels.length && !filters.priceLevels.includes(cafe.priceLevel)) {
        return false;
      }

      if (filters.minRating && cafe.rating < filters.minRating) return false;

      if (filters.openNow && !openStatus(cafe.openingHours).isOpen) return false;
      if (filters.openLate && !isOpenLate(cafe.openingHours)) return false;

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

      if (sort === 'rating') {
        const C = 4.2, m = 150;
        const CBD_LAT = -37.8136, CBD_LNG = 144.9631;
        const bayesian = (c) => {
          const v = c.userRatingsTotal ?? 0;
          return (v / (v + m)) * (c.rating ?? 0) + (m / (v + m)) * C;
        };
        const proximityBonus = (c) => {
          const d = Math.sqrt((c.latitude - CBD_LAT) ** 2 + (c.longitude - CBD_LNG) ** 2) * 111;
          return Math.max(0, 1 - d / 12);   // CBD-focused: fades out by ~12km
        };
        const score = (c) => bayesian(c) * (0.25 + 0.75 * proximityBonus(c));
        return score(b) - score(a);
      }

      return (b[sort] ?? 0) - (a[sort] ?? 0);
    });

    return list;
  }, [cafes, filters, debouncedQuery, sort, userCoords]);

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

  const togglePriceLevel = (level) =>
    setFilters((f) => ({
      ...f,
      priceLevels: f.priceLevels.includes(level)
        ? f.priceLevels.filter((l) => l !== level)
        : [...f.priceLevels, level],
    }));

  const setQuery  = (query)  => setFilters((f) => ({ ...f, query }));
  const setSuburb = (suburb) => setFilters((f) => ({ ...f, suburb: f.suburb === suburb ? null : suburb }));
  const setMinRating = (n) => setFilters((f) => ({ ...f, minRating: n }));
  const toggleOpenNow  = () => setFilters((f) => ({ ...f, openNow:  !f.openNow  }));
  const toggleOpenLate = () => setFilters((f) => ({ ...f, openLate: !f.openLate }));
  const reset = () => setFilters(DEFAULT_FILTERS);

  const activeCount =
    Object.values(filters.booleans).filter(Boolean).length +
    Object.values(filters.enums).filter(Boolean).length +
    filters.coffeeBrands.length +
    filters.priceLevels.length +
    (filters.minRating ? 1 : 0) +
    (filters.openNow   ? 1 : 0) +
    (filters.openLate  ? 1 : 0) +
    (filters.suburb    ? 1 : 0);

  return {
    filters, sort, setSort, visibleCafes, filterCounts, activeCount,
    setQuery, setSuburb, toggleBoolean, toggleEnum, toggleCoffeeBrand,
    togglePriceLevel, setMinRating,
    toggleOpenNow, toggleOpenLate, reset,
  };
}
