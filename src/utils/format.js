export function priceLabel(level) {
  if (!level) return '';
  return '$'.repeat(level);
}

export function dayKeyForToday() {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
}

/**
 * Return { isOpen, label } given the openingHours map and the current time.
 * Accepts "7:00 - 16:00" or "Closed".
 */
export function openStatus(openingHours, now = new Date()) {
  const key = dayKeyForToday();
  const raw = openingHours?.[key];
  if (!raw || raw === 'Closed') return { isOpen: false, label: 'Closed today' };
  if (raw === 'Open 24h') return { isOpen: true, label: 'Open 24h' };

  const parts = raw.split(' - ');
  if (parts.length < 2) return { isOpen: false, label: raw };
  const [openStr, closeStr] = parts;
  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const openMin = openH * 60 + (openM || 0);
  const closeMin = closeH * 60 + (closeM || 0);

  const isOpen = minutes >= openMin && minutes < closeMin;
  return {
    isOpen,
    label: isOpen ? `Open until ${closeStr}` : `Opens ${openStr}`
  };
}

const LATE_THRESHOLD = 18 * 60 + 30; // 18:30

export function isOpenLate(openingHours) {
  const key = dayKeyForToday();
  const raw = openingHours?.[key];
  if (!raw || raw === 'Closed') return false;
  if (raw === 'Open 24h') return true;
  const parts = raw.split(' - ');
  if (parts.length < 2) return false;
  const [closeH, closeM] = parts[1].split(':').map(Number);
  return (closeH * 60 + (closeM || 0)) >= LATE_THRESHOLD;
}
