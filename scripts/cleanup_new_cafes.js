/**
 * cleanup_new_cafes.js
 * Removes definite non-cafes from the 425 new entries, applies name fixes.
 * Run: node scripts/cleanup_new_cafes.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAFES_FILE = path.join(__dirname, '../public/cafes.json');

const DEFINITE_REMOVES = new Set([
  // Car washes
  'magic-hand-carwash-collingwood-collingwood',
  'magic-hand-carwash-kew-east-kew-east',
  'magic-hand-carwash-pascoe-vale-pascoe-vale-south',
  'magic-carwash-kingsbury-kingsbury',

  // Gyms / leisure / aquatic centres
  'crossfit-richmond-richmond',
  'viva-fitness-club-24-7-gym-thomastown',
  'ascot-vale-leisure-centre-ascot-vale',
  'the-healthlink-crew-aqualink-box-hill-box-hill',
  'billy-lids-playland-hawthorn-hawthorn',

  // Non-food / service venues
  'three-phase-rehearsal-studios-brunswick',
  'hoyts-highpoint-maribyrnong',
  'palace-westgarth-cinemas-northcote',
  'malthouse-theatre-southbank',
  'rspca-victoria-burwood-east-burwood-east',
  'creating-wellbeing-melbourne-glenroy',
  'kevin-heinze-grow-doncaster',
  'legends-collectables-maidstone',
  'tavolo360-mobile-ordering-oak-park',
  'manningham-uniting-church-community-centre-templestowe',
  'ajani-neighbourhood-house-templestowe-lower',
  'nailology-coffee-nails-kew-kew',
  'cq-nail-spa-sunshine-west',
  'acorn-nursery-surrey-hills',
  'ikea-cafe-fika-richmond',
  'bundoora-park-farm-bundoora',
  'coffee-saviour-repairs-melbourne-coffee-machine-repairs-and-services-near-me-coffee-grinders-and-coffee-roasters-maribyrnong',

  // Petrol stations / convenience stores
  'bp-south-melbourne',
  'bp-watsonia',
  'astron-brooklyn-south-brooklyn',
  'ultra-convenience-bundoora',
  '5-rivers-convenience-store-broadmeadows',
  'augusta-convenience-store-campbellfield',

  // Pure restaurants (no cafe component)
  'baghdad-restaurant-broadmeadows',
  'myrestaurant-broadmeadows',
  'roza-restaurant-mandi-coburg',
  'mazaj-lebanese-restaurant-lounge-rosanna-rosanna',

  // Kebab / fast food
  'bomba-kebabs-spot-on-kebabs-braybrook',
  'brothers-foodies-kebab-and-burger-coburg-north',
  'anatolian-grill-coburg-north',
  'kababi-sunshine',
  'con-s-fish-chips-takeaway-food-brunswick-west',

  // Pizzerias
  'lava-pizzeria-reservoir',
  'express-pizza-pasta-bar-templestowe',
  'old-school-pizza-stonegrill-thornbury-thornbury',

  // Bars / pubs (no meaningful cafe component)
  'duke-of-grantham-brunswick-west',
  'young-and-jacksons-melbourne',
  'tote-bar-dining-moonee-ponds',
  'renzo-s-bar-docklands',
  'olivine-wine-bar-at-pentridge-coburg',
  'paradiso-bar-and-grill-hawthorn-east',
  'the-resistance-burgers-bar-cafe-hawthorn',
  'the-bend-garden-bar-fairfield',

  // Broken / institutional (very low ratings)
  'scienceworks-the-cafe-spotswood',       // 1.6 stars
  'red-engine-kiosk-sunshine-sunshine',    // 1.1 stars
  'cafe-adamo-repat-building-31-ivanhoe',  // 1.8 stars, hospital building
  'box-hill-institute-cafeteria-box-hill', // institutional cafeteria

  // Sweets / cheese shops (not cafes)
  'mouna-s-sweets-altona-north',
  'that-s-amore-cheese-thomastown',

  // Shisha lounge
  'babylon-shisha-cafe-broadmeadows',

  // Food court kiosk
  'soul-origin-highpoint-food-court-level-2-maribyrnong',
]);

// Specific name corrections: id → correct name
const NAME_FIXES = {
  'brewers-and-barbers-cafe-aberfeldie':        'Brewers and Barbers Cafe',
  'smokin-hut-cafe-coburg':                     'Smokin Hut Cafe',
  'zagame-bros-coffee-co-hawthorn':             'Zagame Bros Coffee Co',
  'general-jnr-pascoe-vale':                    'General Jnr',
  'route-21-thomastown':                        'Route 21',
  'trinity-food-and-beverage-tullamarine':      'Trinity Food and Beverage',
  'reading-room-cafe-footscray':                'Reading Room Cafe',
  'very-basic-matcha-pickup-delivery-only-fairfield': 'Very Basic Matcha',
  'yummiest-cafe-and-juice-bar-broadmeadows-broadmeadows': 'Yummiest Cafe and Juice Bar',
  'appretcafe-greensbrough-greensborough':      'Appretcafe Greensborough',
  'savour-cafe-and-juice-bar-brunswick':        'Savour Cafe & Juice Bar',
  'sammart-cafe-essendon':                      'SamMart Cafe',
  'au79-doncaster':                             'Au79',
  'zeal-cafe-box-hill':                         'Zeal Cafe',
  'lunchroom-by-circuit-food-division-airport-west': 'Lunchroom by Circuit Food Division',
  'indi-kitch-newport':                         'Indi-Kitch',
  'gran-caffe-malvern':                         'Gran Caffe',
  'alfa-dc-west-footscray':                     'Alfa@DC',
  'sunshine-sweet-cafe-sunshine':               'Sunshine Sweet & Cafe',
  't-tea-coffee-sunshine':                      'T & Tea Coffee',
  'ketabestan-templestowe-lower':               'Ketabestan',
  'al-volo-cafe-reservoir':                     'Al Volo Cafe',
  'newlands-deli-reservoir-reservoir':          'Newlands Deli Reservoir',
  'm-j-lounge-footscray':                       'M&J Lounge',
  'lush-social-house-port-melbourne':           'Lush Social House',
  'jojos-on-northgate-thomastown':              'Jojos on Northgate',
  'the-a-a-company-pascoe-vale-pascoe-vale':    'The Açaì Company',
};

const cafes = JSON.parse(fs.readFileSync(CAFES_FILE, 'utf8'));
const before = cafes.length;

const filtered = cafes.filter(c => !DEFINITE_REMOVES.has(c.id));

let nameFixCount = 0;
for (const cafe of filtered) {
  if (NAME_FIXES[cafe.id]) {
    cafe.name = NAME_FIXES[cafe.id];
    nameFixCount++;
  }
}

const removed = before - filtered.length;
fs.writeFileSync(CAFES_FILE, JSON.stringify(filtered, null, 2));

console.log(`Removed:    ${removed} definite non-cafes`);
console.log(`Name fixes: ${nameFixCount}`);
console.log(`Total now:  ${filtered.length} cafes`);
