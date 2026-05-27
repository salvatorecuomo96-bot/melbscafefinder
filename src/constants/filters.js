export const RELIABLE_SECTIONS = [
  {
    id: 'practical',
    label: 'Practical',
    booleans: [],
    enums: [],
    price: true,
  },
];

export const CLUE_SECTIONS = [
  {
    id: 'coffee',
    label: 'Coffee',
    booleans: [
      { key: 'matcha', label: 'Matcha' },
    ],
    enums: [],
    brands: true,
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    booleans: [],
    enums: [
      {
        key: 'noiseLevel',
        label: 'Noise level',
        options: ['quiet', 'moderate', 'lively', 'loud'],
      },
    ],
  },
  {
    id: 'food',
    label: 'Food',
    booleans: [],
    enums: [
      {
        key: 'veganOptions',
        label: 'Vegan options',
        options: [
          { value: 'excellent', label: 'Excellent' },
          { value: 'good',      label: 'Good' },
          { value: 'limited',   label: 'Limited' },
        ],
      },
    ],
  },
  {
    id: 'vibes',
    label: 'Vibes',
    booleans: [
      { key: 'outdoorSeating', label: 'Outdoor seating' },
      { key: 'dogFriendly',    label: 'Dog friendly' },
    ],
    enums: [],
  },
];

export const FILTER_SECTIONS = [...RELIABLE_SECTIONS, ...CLUE_SECTIONS];

export const COFFEE_BRANDS = [
  'Single O', 'Code Black', 'Five Senses', 'Allpress', 'St Ali',
  'Industry Beans', 'Axil', 'Seven Seeds', 'Market Lane', 'Veneziano',
  'Proud Mary', 'Dukes', 'Rumble', 'Campos', 'Ona', 'Padre',
];

export const PRICE_LEVELS = [
  { value: 1, label: '$' },
  { value: 2, label: '$$' },
  { value: 3, label: '$$$' },
];

export const SORT_OPTIONS = [
  { value: 'rating',   label: 'Top rated' },
  { value: 'distance', label: 'Nearest' },
];

export const DEFAULT_FILTERS = {
  query:        '',
  suburb:       null,
  booleans:     {},
  enums:        {},
  coffeeBrands: [],
  priceLevels:  [],
  minRating:    0,
  openNow:      false,
  openLate:     false,
};
