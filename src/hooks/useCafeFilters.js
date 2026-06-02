import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_FILTERS, BRAND_ALIASES } from '../constants/filters.js';
import { haversineKm } from '../utils/distance.js';
import { openStatus, isOpenLate } from '../utils/format.js';

const normBrand = (b) => (b && BRAND_ALIASES[b]) || b;

export function useCafeFilters({ cafes = [], userCoords } = {}) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('rating');

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(filters.query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [filters.query]);

  const filterCounts = useMemo(() => {
    const brands = {};
    let openNow = 0;
    let openLate = 0;

    for (const cafe of cafes) {
      if (cafe.coffeeBrand) {
        const b = normBrand(cafe.coffeeBrand);
        brands[b] = (brands[b] || 0) + 1;
      }
      if (openStatus(cafe.openingHours).isOpen) openNow++;
      if (isOpenLate(cafe.openingHours)) openLate++;
    }

    return { brands, openNow, openLate };
  }, [cafes]);

  const visibleCafes = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();

    let list = cafes.filter((cafe) => {
      if (q) {
        const haystack = [cafe.name, cafe.suburb, cafe.coffeeBrand]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (filters.suburb && cafe.suburb !== filters.suburb) return false;

      if (filters.coffeeBrands.length) {
        if (!filters.coffeeBrands.includes(normBrand(cafe.coffeeBrand))) return false;
      }

      if (filters.minRating && cafe.rating < filters.minRating) return false;
      if (filters.minReviews && (cafe.userRatingsTotal ?? 0) < filters.minReviews) return false;

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
          return Math.max(0, 1 - d / 12);
        };
        const score = (c) => bayesian(c) * (0.25 + 0.75 * proximityBonus(c));
        return score(b) - score(a);
      }

      return (b[sort] ?? 0) - (a[sort] ?? 0);
    });

    return list;
  }, [cafes, filters, debouncedQuery, sort, userCoords]);

  const toggleCoffeeBrand = (brand) =>
    setFilters((f) => ({
      ...f,
      coffeeBrands: f.coffeeBrands.includes(brand)
        ? f.coffeeBrands.filter((b) => b !== brand)
        : [...f.coffeeBrands, brand],
    }));

  const setQuery = (query) => setFilters((f) => ({ ...f, query }));
  const setSuburb = (suburb) => setFilters((f) => ({ ...f, suburb: f.suburb === suburb ? null : suburb }));
  const setMinRating   = (n) => setFilters((f) => ({ ...f, minRating: n }));
  const setMinReviews  = (n) => setFilters((f) => ({ ...f, minReviews: n }));
  const toggleOpenNow = () => setFilters((f) => ({ ...f, openNow: !f.openNow }));
  const toggleOpenLate = () => setFilters((f) => ({ ...f, openLate: !f.openLate }));
  const reset = () => setFilters(DEFAULT_FILTERS);

  const activeCount =
    filters.coffeeBrands.length +
    (filters.minRating  ? 1 : 0) +
    (filters.minReviews ? 1 : 0) +
    (filters.openNow    ? 1 : 0) +
    (filters.openLate   ? 1 : 0) +
    (filters.suburb     ? 1 : 0);

  return {
    filters, sort, setSort, visibleCafes, filterCounts, activeCount,
    setQuery, setSuburb, toggleCoffeeBrand, setMinRating, setMinReviews,
    toggleOpenNow, toggleOpenLate, reset,
  };
}
