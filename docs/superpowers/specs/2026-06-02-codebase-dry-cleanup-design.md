# Codebase DRY Cleanup — Design Spec

**Date:** 2026-06-02
**Goal:** Eliminate repeated code, split god files, extract shared patterns, and make the codebase maintainable, consistent, and readable.
**Approach:** Top-down — DRY up the API route layer first, then split large files, extract shared patterns, and clean up components.

---

## Phase 1: DRY Up API Routes

### Problem

21 API route files contain 18+ identical auth check blocks, 18+ identical try/catch error handlers, `getClientIp()` copy-pasted into 4 files, rate limiting duplicated 5 times, and inconsistent response formats (`{ success: true }` vs `{ data }` vs `{ valid: false }`).

### Solution

Keep all API routes. Extract the repeated plumbing into shared utilities so each route handler contains only business logic.

### New Shared Files

**`src/lib/api-helpers.ts`** — Error handling wrapper and request parsing:

```typescript
// Replaces 18+ identical try/catch blocks
export async function handleApiError(
  label: string,
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error: any) {
    if (error instanceof ApiError || error?.statusCode) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error(`[${label}]`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Replaces repeated body parsing + validation
export async function parseBody<T>(request: NextRequest, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(result.error.issues[0].message, 400);
  }
  return result.data;
}

// Replaces repeated searchParams extraction
export function parseSearchParams(request: NextRequest, keys: string[]): Record<string, string | undefined> {
  const { searchParams } = new URL(request.url);
  return Object.fromEntries(keys.map(k => [k, searchParams.get(k) || undefined]));
}
```

**`src/lib/api-auth.ts`** — Auth wrappers replacing 18+ inline blocks:

```typescript
// Session-only auth (no tenant required)
export async function withAuth(
  request: NextRequest,
  fn: (user: User) => Promise<NextResponse>
): Promise<NextResponse> {
  const sessionToken = getSessionCookie(request);
  if (!sessionToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const user = await validateSession(sessionToken);
  if (!user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  return fn(user);
}

// Session + tenant membership + optional role check
export async function withTenantAuth(
  request: NextRequest,
  tenantId: string,
  requiredRole: OrgRole | null,
  fn: (user: User, role: OrgRole) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(request, async (user) => {
    const role = await validateMembership(user.id, tenantId);
    if (requiredRole && role !== requiredRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return fn(user, role);
  });
}
```

**`src/lib/client-ip.ts`** — Single implementation replacing 4 copies:

```typescript
export function getClientIp(request: NextRequest): string {
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) return cfConnectingIP;
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) return xForwardedFor.split(',')[0]?.trim() || 'unknown';
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) return xRealIP;
  return 'unknown';
}
```

**`src/lib/ratelimit.ts`** — Extend existing `ratelimit-memory.ts` with a wrapper:

```typescript
export function withRateLimit(
  request: NextRequest,
  key: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const clientIp = getClientIp(request);
  const rl = limitFixedWindow(`${key}:${clientIp}`, limit, windowMs);
  if (!rl.ok) {
    const retryMs = retryAfterMs(rl.resetAt);
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.', retryAfterMs: retryMs },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryMs / 1000).toString() } }
    );
  }
  return null; // no rate limit hit, proceed
}
```

### Result

Each API route handler shrinks from boilerplate-heavy to business-logic-only:

```typescript
export async function POST(request: NextRequest) {
  return handleApiError('members POST', () =>
    withTenantAuth(request, tenantId, 'admin', async (user, role) => {
      const { email, orgRole } = await parseBody(request, addMemberSchema);
      // ... actual business logic only
      return NextResponse.json({ success: true });
    })
  );
}
```

### What Does NOT Change

- API routes stay as API routes (no server action migration — server actions were slower).
- Route file structure stays the same.
- Client-side fetch calls stay the same.

---

## Phase 2: Split God Files

### Problem

Three files are far too large and have too many responsibilities:
- `services/data/legislation.ts` — 1,245 lines, 6 fetch functions, mutations, assignments, search, helpers
- `actions/admin.ts` — 972 lines, 13 functions, repeated Map-based aggregation loops
- `hooks/contexts/bills-context.tsx` — 867 lines, LLM suggestions + human proposals + CRUD + view modes

### Solution

#### `legislation.ts` (1,245 lines) -> 4 files + index

```
src/services/data/bills/
  queries.ts      # getAllTrackedBills, getAllFoodRelatedBills, getUserTrackedBills,
                  # getBillDetails, searchBills, findExistingBillByURL
  mutations.ts    # updateBillStatus, updateBillDeadFlag, updateFoodStatusOrCreateBill,
                  # trackBill, untrackBill
  assignments.ts  # validateAssignmentScope, assignBill, unassignBill, getTrackedByForBills
  helpers.ts      # mapBillDataToBillClient, convertDataToBillShape,
                  # getAdditionalBillData, getBatchStatusUpdates
  index.ts        # re-exports everything (existing imports don't break)
```

#### `actions/admin.ts` (972 lines) -> distributed to domain actions

Functions move to where they belong:
- `getPendingRequests()`, `approveProposal()`, `rejectProposal()` -> `actions/proposals.ts` (new file)
- `getAllAccounts()`, `getAllInterns()`, `getAllSupervisors()` -> `actions/members.ts` (new file)
- `getAllInternBills()` -> `actions/bills.ts` (existing file, extended)
- `inviteUser()`, `removeUser()`, `updateUserRole()` -> `actions/members.ts`
- Remaining admin-specific functions -> `actions/admin.ts` (much smaller)

The repeated Map-based aggregation loop (used 3 times) extracted to:

```typescript
// src/lib/aggregate.ts
export function aggregateRows<TParent, TChild>(
  rows: any[],
  idKey: string,
  nestedKey: string,
  buildParent: (row: any) => TParent,
  buildChild: (row: any) => TChild
): TParent[]
```

#### `bills-context.tsx` (867 lines) -> 3 focused contexts

```
src/hooks/contexts/
  bills-context.tsx       # Bill state, CRUD (addBill, removeBill, updateBill,
                          # resetBills, refreshBills, viewMode, showArchived) — ~250 lines
  llm-context.tsx         # LLM suggestions (acceptLLMChange, rejectLLMChange,
                          # acceptAll, rejectAll, tempBills from LLM) — ~200 lines
  proposals-context.tsx   # Human proposals (proposeStatusChange, acceptTempChange,
                          # rejectTempChange, undoProposal) — ~200 lines
```

`bills-context.tsx` is the parent provider. `llm-context.tsx` and `proposals-context.tsx` consume it.

Repeated state update patterns extracted into helpers within `bills-context.tsx`:

```typescript
function updateBill(billId: string, updates: Partial<Bill>) {
  setBills(prev => prev.map(b => b.id === billId ? { ...b, ...updates } : b));
}

function removeTempBill(billId: string) {
  setTempBills(prev => prev.filter(t => t.id !== billId));
}
```

Repeated permission check + toast pattern (4 instances) becomes:

```typescript
function requirePermission(action: string): boolean {
  if (!canCommitStatus(activeTenant?.orgRole)) {
    toast({
      title: 'Forbidden',
      description: `You do not have permission to ${action}.`,
      variant: 'destructive',
    });
    return false;
  }
  return true;
}
```

---

## Phase 3: Extract Shared Patterns

### Problem

Repeated logic and UI patterns scattered across many files: LLM classification in 3 components (~150 duplicated lines), confirmation dialogs in 5+ places, role badge helpers in 2 files, identical type definitions, and repeated auth setup in `auth-context.tsx`.

### Solution

#### 3a. `useLLMClassification()` hook

```
src/hooks/use-llm-classification.ts
```

Extracts the shared processing logic from `llm-update-button.tsx` (300 lines), `llm-update-column-button.tsx` (293 lines), and `llm-update-single-button.tsx`. Each button component drops to ~50 lines of UI-only code.

The hook handles: mark bill as processing -> call LLM -> create temp bill -> update state -> handle abort/stop.

#### 3b. `<ConfirmDialog>` component

```
src/components/ui/confirm-dialog.tsx
```

```typescript
interface ConfirmDialogProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;         // default "Confirm"
  confirmVariant?: "destructive" | "default";
  isLoading?: boolean;
  loadingLabel?: string;         // default "Loading..."
  onConfirm: () => void | Promise<void>;
}
```

Replaces 5+ inline AlertDialog patterns across `admin-dashboard.tsx`, `kanban-card.tsx`, etc.

#### 3c. Role utilities

```
src/lib/role-utils.ts
```

```typescript
export function getRoleBadgeColor(role: string): string
export function getRoleDisplayName(role: string): string
```

Currently copy-pasted in `admin-dashboard.tsx` and `assign-multiple-bills-dialog.tsx`.

#### 3d. Type consolidation

- **`ActiveTenant`** becomes `type ActiveTenant = Membership` (they are identical interfaces).
- **`UserBase`** interface extracted — `BillTracker` and `Proposer` extend it for shared `email`/`username` fields.
- **Deprecated `role` field** removed from User type. Only `systemRole: SystemRole` remains.

#### 3e. Auth context deduplication

The 4-line membership setup pattern repeated 3 times in `auth-context.tsx` (login, register, checkSession) extracted:

```typescript
function initializeUserSession(data: { user: User; memberships: Membership[] }) {
  setUser(data.user);
  const membershipList: Membership[] = data.memberships ?? [];
  setMemberships(membershipList);
  initializeTenant(membershipList);
}
```

---

## Phase 4: Clean Up Components

### Problem

Several components are too large with inline sub-components and repeated UI patterns.

### Solution

#### 4a. Split `admin-dashboard.tsx` (965 lines) -> 5 files

```
src/components/admin/
  admin-dashboard.tsx         # Shell with tab navigation — ~80 lines
  accounts-tab.tsx            # AllAccountsSection — ~200 lines
  interns-tab.tsx             # AllInternsTab — ~200 lines
  supervisors-tab.tsx         # AllSupervisorsTab — ~200 lines
  intern-bills-tab.tsx        # AllInternBillsTab — ~200 lines
```

#### 4b. Split `bill-details-dialog.tsx` (467 lines) -> 3 files

```
src/components/kanban/
  bill-details-dialog.tsx     # Dialog shell, open/close — ~80 lines
  bill-details-left-panel.tsx # Bill info, status, trackers — ~200 lines
  bill-details-right-panel.tsx # Tags, notes, actions — ~150 lines
```

#### 4c. Extract card actions from `kanban-card.tsx` (361 lines)

```
src/components/kanban/card-actions.tsx  # LLM suggestion buttons, assign button — ~100 lines
```

`kanban-card.tsx` drops to ~250 lines.

#### 4d. Extract scroll hook from `kanban-board.tsx` (563 lines)

```
src/hooks/use-kanban-scroll.ts  # Horizontal scroll state, scroll-to-column — ~60 lines
```

#### 4e. Loading skeleton component

```
src/components/ui/section-skeleton.tsx
```

Replaces the 4 identical skeleton patterns in `admin-dashboard.tsx`.

---

## Phasing & Risk

| Phase | What | Files Touched | Risk | Independently Shippable |
|-------|------|---------------|------|------------------------|
| 1 | DRY up API routes | ~25 files (21 routes + 4 new utils) | Medium | Yes |
| 2 | Split god files | 3 files -> ~12 files | Medium | Yes |
| 3 | Extract shared patterns | ~15 files | Low | Yes |
| 4 | Clean up components | ~8 files split | Low | Yes |

Each phase can be shipped independently. Phase 1 is the highest leverage. Phases 2-4 can be done in any order after Phase 1.

## Testing Strategy

- All existing tests in `src/lib/__tests__/` must continue to pass after each phase.
- Phase 1 (API route DRY): manually verify all user flows — login, register, bill tracking, proposals, member management, invites, tags. Ensure no regressions from the wrapper refactor.
- Phase 2 (file splits): `npm run typecheck` confirms no broken imports. Re-export via `index.ts` preserves existing import paths.
- Phases 3-4: `npm run typecheck` + `npm run lint` + visual verification of affected components.

## Out of Scope

- No new features added during cleanup.
- No migration from API routes to server actions (server actions were slower).
- No database migration changes.
- No changes to the multi-tenancy model or auth flow logic (only structural reorganization).
- Tailwind class repetition (e.g., `text-sm text-muted-foreground` appearing 24 times) — standard utility patterns, not worth abstracting.
