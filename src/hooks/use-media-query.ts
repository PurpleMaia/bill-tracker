import { useEffect, useState } from 'react';

/**
 * Whether a CSS media query matches. `undefined` until mounted (the server can't
 * know), so callers can render nothing rather than the wrong variant first.
 */
export function useMediaQuery(query: string): boolean | undefined {
  const [matches, setMatches] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
