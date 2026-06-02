import { useCallback, useEffect, useState } from 'react';

export function useGeolocation() {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'asking' | 'ready' | 'denied'

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
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
        // Don't fall back to Melbourne CBD — leave coords as null so Near Me
        // doesn't silently fly to the wrong place when location is unavailable.
        setStatus('denied');
      },
      { timeout: 10_000, maximumAge: 30_000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { coords, status, requestLocation };
}
