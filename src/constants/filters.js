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
    ],
  },
  {
    id: 'practical',
    label: 'Practical',
    booleans: [
      { key: 'outdoorSeating', label: 'Outdoor seating' }, // 40%
      { key: 'dogFriendly',    label: 'Dog friendly' },    // 12%
    ],
    enums: [],
    price: true,
  },
];

export const PLANT_MILK_OPTIONS = ['oat', 'soy', 'almond', 'macadamia', 'coconut'];

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
  plantMilk:    [],
  priceLevels:  [],
  minRating:    0,
  openNow:      false,
  openLate:     false,
};
