import { useEffect, useState } from 'react';

export function useCafes() {
  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/cafes.json')
      .then((r) => r.json())
      .then((data) => { setCafes(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return { cafes, loading };
}
