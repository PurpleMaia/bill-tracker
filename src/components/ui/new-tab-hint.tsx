/**
 * Screen-reader-only suffix for links that open in a new tab (target="_blank"),
 * so the context switch isn't a surprise. Place it last inside the <a>.
 */
export function NewTabHint() {
  return <span className="sr-only"> (opens in new tab)</span>;
}
