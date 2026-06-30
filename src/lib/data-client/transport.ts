// ==============================================
// DATA-CLIENT TRANSPORT SELECTION
// ==============================================
// Every data operation has two interchangeable implementations: a Server Action
// ('action') and an API-route fetch ('fetch'). Both call the SAME db/queries
// function, so only the transport differs. This module decides which one runs.
// The reason is that with Server Actions, in a past refactor, we discovered
// that data operations were slower than expected, and that the fetch path was faster. 
// So we added a way to switch between the two transports, and this module is the 
// central place to do that.
//
// Default is 'fetch' (the historically faster, known-good path). Flip the global
// default per-deploy via NEXT_PUBLIC_DATA_TRANSPORT=action, or override a single
// operation below in OVERRIDES (e.g. to keep one slow op on fetch while trying
// actions everywhere else). NEXT_PUBLIC_* is inlined at build time, so the
// global default is a per-deploy decision; OVERRIDES gives code-level control.

export type Transport = 'action' | 'fetch';

const GLOBAL_DEFAULT: Transport =
  (process.env.NEXT_PUBLIC_DATA_TRANSPORT as Transport) ?? 'fetch';

/**
 * Per-operation transport overrides, keyed 'domain.operation'
 * (e.g. 'bills.getBills'). An entry here wins over the global default.
 */
const OVERRIDES: Record<string, Transport> = {
  // 'bills.getBills': 'fetch',
};

/** Resolves the transport for an operation key like 'bills.getBills'. */
export function pickTransport(operation: string): Transport {
  return OVERRIDES[operation] ?? GLOBAL_DEFAULT;
}
