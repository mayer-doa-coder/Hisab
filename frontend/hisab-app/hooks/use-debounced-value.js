import { useEffect, useState } from 'react';

export default function useDebouncedValue(value, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, Math.max(0, Number(delayMs) || 0));

    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}
