export const FILTER_SECTIONS = [
  {
    id: 'coffee',
    label: 'Coffee',
    booleans: [
      { key: 'specialtyCoffee', label: 'Specialty coffee' },
      { key: 'filterCoffee',    label: 'Filter coffee' },
      { key: 'hasDecaf',        label: 'Decaf' },
      { key: 'matcha',          label: 'Matcha' },
    ],
    enums: [
      {
        key: 'chaiType',
        label: 'Chai',
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
      { key: 'pastries',        label: 'Pastries' },
      { key: 'breakfastAllDay', label: 'All-day brekky' },
    ],
    enums: [
      {
        key: 'veganOptions',
        label: 'Vegan options',
        options: ['excellent', 'good', 'limited'],
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
    id: 'work',
    label: 'Work',
    booleans: [
      { key: 'hasWifi',         label: 'WiFi' },
      { key: 'hasPowerOutlets', label: 'Power outlets' },
      { key: 'laptopFriendly',  label: 'Laptop friendly' },
    ],
    enums: [],
  },
  {
    id: 'practical',
    label: 'Practical',
    booleans: [
      { key: 'outdoorSeating', label: 'Outdoor seating' },
      { key: 'dogFriendly',    label: 'Dog friendly' },
      { key: 'pramFriendly',   label: 'Pram friendly' },
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
  query:       '',
  booleans:    {},   // { hasWifi: true }
  enums:       {},   // { noiseLevel: 'quiet', vibe: 'cozy' }
  coffeeBrands: [],  // ['Seven Seeds']
  plantMilk:   [],   // ['oat']
  priceLevels: [],
  minRating:   0,
};
