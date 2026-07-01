// ==============================================
// DATA CLIENT
// ==============================================
// Single entry point for client components and hooks to reach the server.
// Import `data` and call e.g. `data.bills.getBills({ ... })` — the transport
// (Server Action vs API-route fetch) is chosen per-operation by transport.ts
// and is invisible to callers. See define-client.ts for the contract.

import { billsClient } from './bills.client';
import { proposalsClient } from './proposals.client';
import { accessClient } from './access.client';
import { preferencesClient } from './preferences.client';

export const data = {
  bills: billsClient,
  proposals: proposalsClient,
  access: accessClient,
  preferences: preferencesClient,
};

export type { Transport } from './transport';
