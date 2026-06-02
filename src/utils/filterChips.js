export function getActiveFilterChips(api) {
  const { filters } = api;
  const chips = [];

  if (filters.openNow) chips.push({ label: 'Open now', onRemove: api.toggleOpenNow });
  if (filters.openLate) chips.push({ label: 'Open late', onRemove: api.toggleOpenLate });

  for (const brand of filters.coffeeBrands || []) {
    chips.push({ label: brand, onRemove: () => api.toggleCoffeeBrand(brand) });
  }

  if (filters.minRating) {
    chips.push({ label: `${filters.minRating}+ ★`, onRemove: () => api.setMinRating(0) });
  }

  if (filters.suburb) {
    chips.push({ label: filters.suburb, onRemove: () => api.setSuburb(filters.suburb) });
  }

  if (filters.query?.trim()) {
    chips.push({ label: `Search: ${filters.query.trim()}`, onRemove: () => api.setQuery('') });
  }

  return chips;
}
