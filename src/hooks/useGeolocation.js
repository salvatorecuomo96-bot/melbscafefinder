import { useEffect, useState } from 'react';

/**
 * Asks the browser for the user's lat/lng once.
 * Falls back to central Melbourne if denied / unsupported -
 * that way distance sort still works.
 */
const MELBOURNE_CBD = { latitude: -37.8136, longitude: 144.9631 };

export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'asking' | 'ready' | 'denied'

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setCoords(MELBOURNE_CBD);
      setStatus('denied');
      return;
    }
    setStatus('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setStatus('ready');
      },
      () => {
        setCoords(MELBOURNE_CBD);
        setStatus('denied');
      },
      { timeout: 6000, maximumAge: 60_000 }
    );
  }, []);

  return { coords, status, fallback: MELBOURNE_CBD };
}
