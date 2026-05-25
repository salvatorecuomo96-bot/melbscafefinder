export const FILTER_SECTIONS = [
  {
    id: 'coffee',
    label: 'Coffee',
    booleans: [
      { key: 'specialtyCoffee', label: 'Specialty coffee' },  // 73%
      { key: 'matcha',          label: 'Matcha' },            // 19%
    ],
    enums: [
      {
        key: 'chaiType',
        label: 'Chai type',
        options: [
          { value: 'leaf',   label: 'Leaf chai' },
          { value: 'powder', label: 'Powder chai' },
        ],
      },
    ],
    brands: true,
  },
  {
    id: 'food',
    label: 'Food',
    booleans: [
      { key: 'pastries', label: 'Pastries' },  // 68%
    ],
    enums: [
      {
        key: 'brunchQuality',
        label: 'Brunch',
        options: [
          { value: 'excellent', label: 'Excellent brunch' },
          { value: 'good',      label: 'Good brunch' },
        ],
      },
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
    plantMilk: true,
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
      {
        key: 'serviceStyle',
        label: 'Service',
        options: [
          { value: 'counter',       label: 'Counter service' },
          { value: 'table service', label: 'Table service' },
        ],
      },
    ],
  },
  {
    id: 'character',
    label: 'Character',
    booleans: [
      { key: 'hiddenGem',    label: 'Hidden gem' },    // 30%
      { key: 'locallyOwned', label: 'Locally owned' }, // 32%
    ],
    enums: [],
  },
  {
    id: 'practical',
    label: 'Practical',
    booleans: [
      { key: 'outdoorSeating', label: 'Outdoor seating' }, // 40%
      { key: 'dogFriendly',    label: 'Dog friendly' },    // 12%
      { key: 'pramFriendly',   label: 'Pram friendly' },   // 11%
      { key: 'kidFriendly',    label: 'Kid friendly' },    // 29%
    ],
    enums: [],
    price: true,
  },
];

export const PLANT_MILK_OPTIONS = ['oat', 'soy', 'almond', 'macadamia', 'coconut'];

export const COFFEE_BRANDS = [
  'Seven Seeds', 'Market Lane', 'St Ali', 'Ona', 'Axil',
  'Proud Mary', 'Dukes', 'Industry Beans', 'Veneziano', 'Patricia',
  'Mecca', 'Sensory Lab', 'Code Black', 'Allpress', 'Five Senses',
  'Campos', 'Edition', 'Rumble',
];

export const PRICE_LEVELS = [
  { value: 1, label: '$' },
  { value: 2, label: '$$' },
  { value: 3, label: '$$$' },
  { value: 4, label: '$$$$' },
];

export const SORT_OPTIONS = [
  { value: 'rating',   label: 'Top rated' },
  { value: 'distance', label: 'Nearest' },
];

export const DEFAULT_FILTERS = {
  query:        '',
  booleans:     {},
  enums:        {},
  coffeeBrands: [],
  plantMilk:    [],
  priceLevels:  [],
  minRating:    0,
  openNow:      false,
  openLate:     false,
};
