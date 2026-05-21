/**
 * Filter definitions used by:
 *  - <FilterDrawer /> to render the UI
 *  - useCafeFilters to apply the filters
 *
 * To add a new boolean filter:
 *   1. Add it to BOOLEAN_FILTERS below
 *   2. Add the matching field to cafes.js
 *   3. That's it - the drawer and filter logic pick it up automatically.
 */

export const BOOLEAN_FILTERS = [
  { key: 'hasWifi',         label: 'Wi-Fi',            icon: 'wifi' },
  { key: 'laptopFriendly',  label: 'Laptop friendly',  icon: 'laptop' },
  { key: 'hasDecaf',        label: 'Decaf',            icon: 'decaf' },
  { key: 'dogFriendly',     label: 'Dog friendly',     icon: 'dog' },
  { key: 'outdoorSeating',  label: 'Outdoor seating',  icon: 'outdoor' },
  { key: 'quiet',           label: 'Quiet',            icon: 'quiet' },
  { key: 'goodForDates',    label: 'Good for dates',   icon: 'heart' },
  { key: 'goodForWork',     label: 'Good for work',    icon: 'work' },
  { key: 'goodForGroups',   label: 'Good for groups',  icon: 'group' },
  { key: 'specialtyCoffee', label: 'Specialty coffee', icon: 'bean' },
  { key: 'matcha',          label: 'Matcha',           icon: 'matcha' },
  { key: 'pastries',        label: 'Pastries',         icon: 'pastry' }
];

export const PLANT_MILK_OPTIONS = ['oat', 'soy', 'almond', 'macadamia'];

export const PRICE_LEVELS = [
  { value: 1, label: '$' },
  { value: 2, label: '$$' },
  { value: 3, label: '$$$' },
  { value: 4, label: '$$$$' }
];

export const SORT_OPTIONS = [
  { value: 'rating',         label: 'Top rated' },
  { value: 'coffeeQuality',  label: 'Best coffee' },
  { value: 'foodQuality',    label: 'Best food' },
  { value: 'distance',       label: 'Nearest' }
];

export const DEFAULT_FILTERS = {
  query: '',
  booleans: {},           // e.g. { hasWifi: true }
  plantMilk: [],          // ['oat']
  priceLevels: [],        // [2, 3]
  minRating: 0,
  minCoffeeQuality: 0
};
