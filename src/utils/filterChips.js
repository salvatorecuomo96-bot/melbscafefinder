import { FILTER_SECTIONS } from '../constants/filters.js';

const BOOL_MAP = Object.fromEntries(
  FILTER_SECTIONS.flatMap((s) => (s.booleans || []).map((b) => [b.key, b.label]))
);

const ENUM_LABEL_MAP = {};
for (const section of FILTER_SECTIONS) {
  for (const e of (section.enums || [])) {
    ENUM_LABEL_MAP[e.key] = {};
    for (const opt of e.options) {
      const val   = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt[0].toUpperCase() + opt.slice(1) : opt.label;
      ENUM_LABEL_MAP[e.key][val] = label;
    }
  }
}

export function getActiveFilterChips(api) {
  const {
    filters,
    toggleBoolean, toggleEnum, toggleCoffeeBrand,
    togglePlantMilk, togglePriceLevel, toggleOpenNow, toggleOpenLate, setMinRating,
  } = api;

  const chips = [];

  if (filters.openNow)  chips.push({ label: 'Open now',  onRemove: toggleOpenNow  });
  if (filters.openLate) chips.push({ label: 'Open late', onRemove: toggleOpenLate });

  for (const [key, val] of Object.entries(filters.booleans)) {
    if (!val) continue;
    chips.push({ label: BOOL_MAP[key] || key, onRemove: () => toggleBoolean(key) });
  }

  for (const [key, val] of Object.entries(filters.enums)) {
    if (!val) continue;
    const label = ENUM_LABEL_MAP[key]?.[val] || val;
    chips.push({ label, onRemove: () => toggleEnum(key, val) });
  }

  for (const brand of filters.coffeeBrands) {
    chips.push({ label: brand, onRemove: () => toggleCoffeeBrand(brand) });
  }

  for (const milk of filters.plantMilk) {
    chips.push({
      label: milk[0].toUpperCase() + milk.slice(1) + ' milk',
      onRemove: () => togglePlantMilk(milk),
    });
  }

  for (const level of filters.priceLevels) {
    chips.push({ label: '$'.repeat(level), onRemove: () => togglePriceLevel(level) });
  }

  if (filters.minRating) {
    chips.push({ label: `${filters.minRating}+ stars`, onRemove: () => setMinRating(0) });
  }

  if (filters.query) {
    chips.push({ label: `"${filters.query}"`, onRemove: () => api.setQuery('') });
  }

  return chips;
}
