const ANON_ID_KEY = 'foodplus_anon_id';

// Used when storage is unavailable (blocked localStorage): one id per page load.
let fallbackId: string | null = null;

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** A random per-browser id for signed-out visitors. Never throws. */
export function getAnonId(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = defaultStorage()): string {
  try {
    if (storage) {
      const existing = storage.getItem(ANON_ID_KEY);
      if (existing) return existing;
      const created = crypto.randomUUID();
      storage.setItem(ANON_ID_KEY, created);
      return created;
    }
  } catch {
    // fall through to the per-load id
  }
  fallbackId ??= crypto.randomUUID();
  return fallbackId;
}
