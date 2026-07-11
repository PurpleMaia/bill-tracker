// One place the OPTIONAL AI summary is stubbed. Swap these internals for a real
// Genkit call later; the component API stays the same.

const STUB = '(placeholder — AI not wired yet)';

function delay<T>(value: T, ms = 900): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function stubSummarize(text: string): Promise<string> {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return delay(
    `Plain-language recap of this ~${words}-word document will appear here once AI is connected. ${STUB}`,
  );
}
