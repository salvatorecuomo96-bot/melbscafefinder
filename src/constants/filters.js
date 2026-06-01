export const COFFEE_BRANDS = [
  'Single O', 'Code Black', 'Five Senses', 'Allpress', 'St Ali',
  'Industry Beans', 'Axil', 'Seven Seeds', 'Market Lane', 'Veneziano',
  'Proud Mary', 'Dukes', 'Rumble', 'Campos', 'Ona', 'Padre',
  'Sensory Lab', 'Small Batch', 'Maker', 'Assembly', 'STREAT',
];

export const FILTER_SECTIONS = [
  {
    id: 'coffeeBrands',
    label: 'Coffee brands',
    brands: true,
  },
  {
    id: 'price',
    label: 'Price',
    price: true,
  },
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
