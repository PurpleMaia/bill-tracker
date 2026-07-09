// Deterministic monogram (initials + tint) for an org name, so an org has a
// stable, distinct avatar without an uploaded logo. Shared by the Browse Orgs
// cards and the View Board identity badge.

export const MONOGRAM_TINTS = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
] as const;

export function orgMonogram(name: string): { initials: string; tint: string } {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const tint = MONOGRAM_TINTS[Math.abs(hash) % MONOGRAM_TINTS.length];
  return { initials: initials || '•', tint };
}
