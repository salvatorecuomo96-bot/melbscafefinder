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

  const [openStr, closeStr] = raw.split('-').map((s) => s.trim());
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

export function plantMilkLabel(milks = []) {
  if (!milks.length) return 'Dairy only';
  return milks.map((m) => m[0].toUpperCase() + m.slice(1)).join(', ');
}
