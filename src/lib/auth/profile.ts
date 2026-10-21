import type { User } from '@/types/user';

/**
 * True when the user is missing a first or last name — every account created
 * before names were collected, plus Google accounts that withheld them. Drives
 * the "complete your profile" dot on the avatar.
 */
export function isProfileIncomplete(
  user: Pick<User, 'firstName' | 'lastName'> | null | undefined
): boolean {
  if (!user) return false;
  return !user.firstName?.trim() || !user.lastName?.trim();
}

/** Trims a name and collapses blank strings to null, for storage. */
export function normalizeName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}
