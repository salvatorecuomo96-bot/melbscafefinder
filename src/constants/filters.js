export const COFFEE_BRANDS = [
  'Single O', 'Code Black', 'Five Senses', 'Allpress', 'St Ali',
  'Industry Beans', 'Axil', 'Seven Seeds', 'Market Lane', 'Veneziano',
  'Proud Mary', 'Dukes', 'Rumble', 'Campos', 'Ona', 'Padre',
  'Sensory Lab', 'Small Batch', 'Maker', 'Assembly', 'STREAT',
];

export const BRAND_ALIASES = {
  'Axil Coffee':        'Axil',
  'Ona Coffee':         'Ona',
  'Campos Coffee':      'Campos',
  'Commonfolk Coffee':  'Commonfolk',
  'Dukes Coffee':       'Dukes',
};

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
  minRating:    0,
  openNow:      false,
  openLate:     false,
};
