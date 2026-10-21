// ==============================================
// defineClient — the data-client dispatcher
// ==============================================
// Builds a domain client object from a map of operations, where each operation
// supplies BOTH transport implementations: { action, fetch }. The returned
// object exposes one callable per operation that dispatches to the implementation
// chosen by pickTransport('<domain>.<op>') at call time.
//
// THE CONTRACT (what makes the flag flip with zero caller edits): for every
// operation, the `action` and `fetch` impls MUST take identical params and
// resolve to the SAME already-unwrapped value (throw on error). The data-client
// is the one place ActionResult<T> and the HTTP envelope get unwrapped — so
// callers see identical shapes regardless of transport. TypeScript enforces that
// both arms share a signature: the public method type is derived from the
// `action` arm, and the `fetch` arm is structurally required to match.

import { pickTransport } from './transport';

type AnyAsyncFn = (...args: any[]) => Promise<any>;

interface Op<A extends AnyAsyncFn> {
  action: A;
  /** Must accept the same args and resolve to the same value as `action`. */
  fetch: (...args: Parameters<A>) => ReturnType<A>;
}

type Ops = Record<string, Op<AnyAsyncFn>>;

type Client<T extends Ops> = {
  [K in keyof T]: T[K]['action'];
};

/**
 * @param domain  Namespace for transport keys, e.g. 'bills'.
 * @param ops     Map of operation name -> { action, fetch } implementation pair.
 */
export function defineClient<T extends Ops>(domain: string, ops: T): Client<T> {
  const client = {} as Client<T>;

  for (const name of Object.keys(ops) as Array<keyof T>) {
    const op = ops[name];
    const operationKey = `${domain}.${String(name)}`;

    client[name] = ((...args: any[]) => {
      const transport = pickTransport(operationKey);
      return transport === 'action' ? op.action(...args) : op.fetch(...args);
    }) as Client<T>[keyof T];
  }

  return client;
}
