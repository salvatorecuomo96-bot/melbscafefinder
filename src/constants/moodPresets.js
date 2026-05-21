// Each preset has:
//   required  — hard filters: cafe must match ALL of these
//   preferred — soft filters: used for ranking (more matches = higher rank)
//   rankBy    — cafe fields to sort by (in priority order) after required filters applied
//   description — shown to the user so they know why results look the way they do

export const MOOD_PRESETS = [
  {
    id: 'quiet-work',
    label: 'Quiet work',
    emoji: '💻',
    description: 'Wifi, a good table, no distractions.',
    required:  { laptopFriendly: true, hasWifi: true },
    preferred: { quiet: true, goodForWork: true },
    rankBy:    ['goodForWork', 'quiet', 'coffeeQuality']
  },
  {
    id: 'first-date',
    label: 'First date',
    emoji: '✨',
    description: 'Atmosphere that does half the work.',
    required:  { goodForDates: true },
    preferred: { quiet: true },
    rankBy:    ['rating', 'coffeeQuality']
  },
  {
    id: 'read-a-book',
    label: 'Read a book',
    emoji: '📖',
    description: 'Quiet, comfortable, no rush.',
    required:  { quiet: true },
    preferred: { goodForWork: false, laptopFriendly: false }, // not a laptop crowd
    rankBy:    ['quiet', 'rating']
  },
  {
    id: 'espresso-nerd',
    label: 'Espresso nerd',
    emoji: '☕',
    description: 'The coffee is the point.',
    required:  { specialtyCoffee: true },
    preferred: { hasDecaf: true },
    rankBy:    ['coffeeQuality', 'rating']
  },
  {
    id: 'matcha-pastry',
    label: 'Matcha + pastry',
    emoji: '🍵',
    description: 'Good matcha and something to eat.',
    required:  { matcha: true, pastries: true },
    preferred: {},
    rankBy:    ['foodQuality', 'rating']
  },
  {
    id: 'dog-walk',
    label: 'Dog walk',
    emoji: '🐕',
    description: 'Outside, dog welcome, no fuss.',
    required:  { dogFriendly: true, outdoorSeating: true },
    preferred: {},
    rankBy:    ['rating', 'coffeeQuality']
  },
  {
    id: 'group-brunch',
    label: 'Group brunch',
    emoji: '🥂',
    description: 'Big table, big menu, big energy.',
    required:  { goodForGroups: true },
    preferred: { outdoorSeating: true },
    rankBy:    ['foodQuality', 'rating']
  },
  {
    id: 'late-afternoon',
    label: 'Late afternoon',
    emoji: '🌅',
    description: 'Nowhere to be. Good light.',
    required:  { goodForDates: true, quiet: true },
    preferred: { outdoorSeating: true },
    rankBy:    ['rating', 'coffeeQuality']
  }
];
