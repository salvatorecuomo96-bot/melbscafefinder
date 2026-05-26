import { useMemo } from 'react';
import { openStatus } from '../utils/format.js';

function matchColor(score) {
  if (score >= 85) return { text: '#2d7a47', bg: 'rgba(45,122,71,0.1)',  border: 'rgba(45,122,71,0.25)'  };
  if (score >= 70) return { text: '#4a8c2a', bg: 'rgba(74,140,42,0.1)',  border: 'rgba(74,140,42,0.25)'  };
  if (score >= 55) return { text: '#c07a00', bg: 'rgba(192,122,0,0.1)',  border: 'rgba(192,122,0,0.25)'  };
  if (score >= 40) return { text: '#c0510a', bg: 'rgba(192,81,10,0.1)',  border: 'rgba(192,81,10,0.25)'  };
  return              { text: '#c0392b', bg: 'rgba(192,57,43,0.1)',  border: 'rgba(192,57,43,0.25)'  };
}

const BOOL_LABELS = {
  specialtyCoffee: 'Specialty coffee',
  filterCoffee:    'Filter coffee',
  hasWifi:         'Wi-Fi',
  hasPowerOutlets: 'Power outlets',
  laptopFriendly:  'Laptop-friendly',
  dogFriendly:     'Dog friendly',
  outdoorSeating:  'Outdoor seating',
  matcha:          'Matcha',
  hasDecaf:        'Decaf',
};

function computeMatch(cafe, filters, coords) {
  const activeBooleans = Object.entries(filters.booleans || {}).filter(([, v]) => v);
  const hasContext =
    filters.openNow ||
    filters.openLate ||
    activeBooleans.length > 0 ||
    filters.suburb;

  if (!hasContext) return null;

  let totalWeight = 0;
  let earned = 0;
  const confirmed = [];
  const unverified = [];

  // Open now — hard signal, high weight
  if (filters.openNow) {
    totalWeight += 25;
    const { isOpen } = openStatus(cafe.openingHours);
    if (isOpen) { earned += 25; confirmed.push('Open now'); }
  }

  // Open late
  if (filters.openLate) {
    totalWeight += 15;
    const hours = cafe.openingHours || {};
    const hasLate = Object.values(hours).some(h => {
      if (!h) return false;
      const m = h.match(/–\s*(\d{1,2}):?(\d{2})?/);
      if (!m) return false;
      const hr = parseInt(m[1], 10);
      return hr >= 21 || hr <= 2;
    });
    if (hasLate) { earned += 15; confirmed.push('Open late'); }
  }

  // Suburb
  if (filters.suburb) {
    totalWeight += 20;
    if (cafe.suburb === filters.suburb) { earned += 20; confirmed.push(filters.suburb); }
  }

  // Boolean filters — three-state confidence
  for (const [key] of activeBooleans) {
    const label = BOOL_LABELS[key];
    if (!label) continue;
    totalWeight += 15;
    const val = cafe[key];
    if (val === true)          { earned += 15; confirmed.push(label); }
    else if (val == null)      { earned += 7;  unverified.push(label); }
    // val === false → 0 pts (hard filter excluded it anyway)
  }

  // Plant milk
  if (filters.plantMilk?.length > 0) {
    totalWeight += 10;
    const cafeMilk = cafe.plantMilk || [];
    const matchedMilks = filters.plantMilk.filter(m => cafeMilk.includes(m));
    if (matchedMilks.length === filters.plantMilk.length) {
      earned += 10; confirmed.push(matchedMilks.join(', ') + ' milk');
    } else if (matchedMilks.length > 0) {
      earned += 6; confirmed.push(matchedMilks.join(', ') + ' milk');
    } else if (cafeMilk.length === 0) {
      earned += 4; unverified.push('plant milk');
    }
  }

  if (totalWeight === 0) return null;

  const score = Math.min(100, Math.round((earned / totalWeight) * 100));
  const colors = matchColor(score);

  return { score, confirmed, unverified, ...colors };
}

export function useCafeMatch(cafe, filters, coords) {
  return useMemo(
    () => (cafe ? computeMatch(cafe, filters, coords) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cafe?.id, filters, coords]
  );
}

export function useCafesMatch(cafes, filters, coords) {
  return useMemo(
    () => {
      const map = new Map();
      for (const c of cafes) {
        const m = computeMatch(c, filters, coords);
        if (m) map.set(c.id, m);
      }
      return map;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cafes, filters, coords]
  );
}
