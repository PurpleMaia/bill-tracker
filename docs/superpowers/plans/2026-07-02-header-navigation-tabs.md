# Header Navigation Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add top-level nav tabs (Search, Your Bills, Your Testimonies, View Active Boards) to the header as real Next.js routes, with Your Bills login-walled and the other three as placeholder pages.

**Architecture:** A `(main)` route group shares a layout that renders the header once. The header's centered Kanban/Spreadsheet/Admin view toggle moves into the Your Bills page (`/`) as a toolbar; the header center becomes four `next/link` nav tabs with `usePathname` active state. Placeholder pages compose a shared `PlaceholderPage` shell.

**Tech Stack:** Next.js 15 App Router, TypeScript, shadcn/ui, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-02-header-navigation-tabs-design.md`

## Global Constraints

- No changes to `db/queries`, API routes, or server actions. No data fetching added.
- `register/` and `verify-email/` pages stay OUTSIDE the route group (no header).
- The public read-only board is intentionally dropped; do NOT remove the `if (!user)` branch inside `ProtectedKanbanBoardOrSpreadsheet` (out of scope).
- No new unit tests: project tests cover pure logic in `src/lib/` only, and this change adds none. Verification is `npm run typecheck`, `npm run build`, `npm test`.
- Commit prefixes `feat:`/`refactor:`; NO `Co-Authored-By` lines.
- All new components are client components (`'use client'`) EXCEPT `placeholder-page.tsx` and the three placeholder pages, which are server components.

---

### Task 1: HeaderNav component (the four nav tabs)

**Files:**
- Create: `src/components/main/header-nav.tsx`

**Interfaces:**
- Produces: `HeaderNav` (React component, no props) and `NAV_ITEMS` (exported const array of `{ href, label, icon }`) — Task 7 imports `NAV_ITEMS` for the mobile menu.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, KanbanSquareIcon, LayoutGrid, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV_ITEMS = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/', label: 'Your Bills', icon: KanbanSquareIcon },
  { href: '/testimonies', label: 'Your Testimonies', icon: FileText },
  { href: '/boards', label: 'View Active Boards', icon: LayoutGrid },
] as const;

export function isNavItemActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 rounded-md bg-secondary p-1 shadow-sm">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
            isNavItemActive(href, pathname)
              ? 'bg-primary text-white'
              : 'text-secondary-foreground hover:bg-white/50'
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
```

Note: this file has NO `'use server'` directive, so exporting the `NAV_ITEMS` const and the `isNavItemActive` helper alongside the component is fine.

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/main/header-nav.tsx
git commit -m "feat: add HeaderNav component with top-level nav tabs"
```

---

### Task 2: ViewToggle component (extracted board view tabs)

**Files:**
- Create: `src/components/main/view-toggle.tsx`

**Interfaces:**
- Consumes: `useKanbanBoard` (`view`, `setView`), `useAuth` (`user`, `activeTenant`).
- Produces: `ViewToggle` (React component, no props) — rendered by the Your Bills page in Task 3.

This is the Kanban/Spreadsheet/Admin `Tabs` block currently inside `src/components/main/header.tsx` (lines 59–76) plus its `getIconForView` helper and role-based `views` logic, moved verbatim into its own component.

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { KanbanSquareIcon, Table, Users2Icon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';

export function ViewToggle() {
  const { view: currentView, setView } = useKanbanBoard();
  const { user, activeTenant } = useAuth();

  const orgRole = activeTenant?.orgRole;
  const views =
    user && orgRole === 'admin'
      ? ['kanban', 'spreadsheet', 'admin']
      : ['kanban', 'spreadsheet'];

  return (
    <Tabs
      value={currentView}
      onValueChange={(v) => setView(v as 'kanban' | 'spreadsheet' | 'admin' | 'supervisor')}
      className="rounded-md shadow-sm"
    >
      <TabsList className="bg-secondary">
        {views.map((v) => (
          <TabsTrigger
            key={v}
            value={v}
            className="data-[state=active]:bg-primary data-[state=active]:text-white text-secondary-foreground"
          >
            {getIconForView(v)} {v.charAt(0).toUpperCase() + v.slice(1)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function getIconForView(view: string) {
  switch (view) {
    case 'kanban':
      return <KanbanSquareIcon className="h-5 w-5 mr-2" />;
    case 'spreadsheet':
      return <Table className="h-5 w-5 mr-2" />;
    case 'admin':
      return <Users2Icon className="h-5 w-5 mr-2" />;
    default:
      return null;
  }
}
```

(The original header logic had identical branches for `worker` and other roles — both produce `['kanban', 'spreadsheet']` — so the simplified conditional above is behavior-preserving.)

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/main/view-toggle.tsx
git commit -m "feat: extract board ViewToggle into its own component"
```

---

### Task 3: LoginWall component and route-group restructure

**Files:**
- Create: `src/components/auth/login-wall.tsx`
- Create: `src/app/(main)/layout.tsx`
- Move: `src/app/page.tsx` → `src/app/(main)/page.tsx` (then rewrite)
- Modify: `src/components/main/header.tsx`

**Interfaces:**
- Consumes: `HeaderNav` (Task 1), `ViewToggle` (Task 2), existing `LoginDialog` (self-contained trigger + dialog), `AuthHeader`, `BottomTabBar`, `ProtectedKanbanBoardOrSpreadsheet`, `AdminDashboard`, `SupervisorDashboard`.
- Produces: the `(main)` route group layout that Tasks 4–6 add pages into.

- [ ] **Step 1: Create the LoginWall component**

`src/components/auth/login-wall.tsx`:

```tsx
'use client';

import { Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginDialog } from './login-dialog';

export function LoginWall() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <CardTitle>Login to view your bills</CardTitle>
          <CardDescription>
            Your tracked bills and kanban board are available once you sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <LoginDialog />
        </CardContent>
      </Card>
    </div>
  );
}
```

(`LoginDialog` renders its own "Login" trigger button and dialog — no props needed.)

- [ ] **Step 2: Create the route-group layout**

`src/app/(main)/layout.tsx`:

```tsx
import { Header } from '@/components/main/header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-auto pb-14 md:pb-0">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Move and rewrite the home page**

```bash
git mv src/app/page.tsx "src/app/(main)/page.tsx"
```

Then replace the ENTIRE content of `src/app/(main)/page.tsx` with:

```tsx
'use client';

import { ProtectedKanbanBoardOrSpreadsheet } from '@/components/kanban/protected-kanban-board';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { SupervisorDashboard } from '@/components/supervisor/supervisor-dashboard';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { BottomTabBar } from '@/components/main/bottom-tab-bar';
import { ViewToggle } from '@/components/main/view-toggle';
import { LoginWall } from '@/components/auth/login-wall';

export default function Home() {
  const { view } = useKanbanBoard();
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <LoginWall />;

  return (
    <>
      <div className="hidden md:flex justify-center pt-4">
        <ViewToggle />
      </div>
      {view === 'admin' ? (
        <AdminDashboard />
      ) : view === 'supervisor' ? (
        <SupervisorDashboard />
      ) : (
        <ProtectedKanbanBoardOrSpreadsheet />
      )}
      <BottomTabBar />
    </>
  );
}
```

(The `<div className="flex min-h-screen flex-col">` / `<Header />` / `<main>` wrapper that used to live here is now the layout's job. `ViewToggle` is `hidden md:flex` because mobile switches views via the `BottomTabBar`, exactly as the old header tabs were desktop-only.)

- [ ] **Step 4: Swap the header's view tabs for the nav tabs**

In `src/components/main/header.tsx`:

1. Replace the centered tabs block (the `<div className="hidden md:flex absolute left-1/2 ...">` containing `<Tabs>`, currently lines 59–76) with:

```tsx
        {/* Nav tabs — desktop only, absolutely centered */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 justify-center w-fit">
          <HeaderNav />
        </div>
```

2. Delete the now-unused pieces:
   - the `getIconForView` function at the bottom of the file
   - the `view: currentView, setView` destructuring from `useKanbanBoard()` (keep `setSearchQuery`)
   - the `publicViews`, `orgRole`, and `views` variables
   - imports that are no longer referenced: `KanbanSquareIcon`, `Table`, `Users2Icon` from `lucide-react`, and `Tabs, TabsList, TabsTrigger` from `../ui/tabs`

3. Add the import:

```tsx
import { HeaderNav } from './header-nav';
```

The file keeps: title + tenant selector, the board search `Input`, the settings button, `AuthHeader`, `MobileHamburgerMenu`, and `SettingsDialog`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run build`
Expected: build succeeds; route list shows `/` (from the `(main)` group), `/register`, `/verify-email`.

- [ ] **Step 6: Commit**

```bash
git add -A src/app src/components/main/header.tsx src/components/auth/login-wall.tsx
git commit -m "feat: move app into (main) route group with header nav tabs and login wall"
```

---

### Task 4: PlaceholderPage shell

**Files:**
- Create: `src/components/placeholder/placeholder-page.tsx`

**Interfaces:**
- Produces: `PlaceholderPage({ icon, title, description, children? })` — composed by the three placeholder pages in Tasks 5–6. `icon` is a `LucideIcon` component (not an element).

- [ ] **Step 1: Create the component**

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PlaceholderPage({ icon: Icon, title, description, children }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-8 pt-20 text-center md:pt-28">
      <Icon className="h-12 w-12 text-muted-foreground" />
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="max-w-md text-muted-foreground">{description}</p>
      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
        Coming soon
      </span>
      {children}
    </div>
  );
}
```

(Server component on purpose — no `'use client'`, no hooks.)

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/placeholder/placeholder-page.tsx
git commit -m "feat: add PlaceholderPage shell component"
```

---

### Task 5: Search placeholder page

**Files:**
- Create: `src/app/(main)/search/page.tsx`

**Interfaces:**
- Consumes: `PlaceholderPage` (Task 4), `Input` (shadcn).

- [ ] **Step 1: Create the page**

```tsx
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PlaceholderPage } from '@/components/placeholder/placeholder-page';

export default function SearchPage() {
  return (
    <PlaceholderPage
      icon={Search}
      title="Search Bills"
      description="Search across all bills in the Hawaii legislature by keyword, bill number, or topic."
    >
      <div className="relative mt-2 w-full max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input type="search" placeholder="Search bills..." className="pl-9" disabled />
      </div>
    </PlaceholderPage>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/search/page.tsx"
git commit -m "feat: add search placeholder page"
```

---

### Task 6: Testimonies and Boards placeholder pages

**Files:**
- Create: `src/app/(main)/testimonies/page.tsx`
- Create: `src/app/(main)/boards/page.tsx`

**Interfaces:**
- Consumes: `PlaceholderPage` (Task 4).

- [ ] **Step 1: Create the testimonies page**

`src/app/(main)/testimonies/page.tsx`:

```tsx
import { FileText } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder/placeholder-page';

export default function TestimoniesPage() {
  return (
    <PlaceholderPage
      icon={FileText}
      title="Your Testimonies"
      description="Track the testimonies you have submitted on bills, all in one place."
    >
      <div className="mt-2 w-full max-w-md space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-md border border-dashed bg-muted/40" />
        ))}
      </div>
    </PlaceholderPage>
  );
}
```

- [ ] **Step 2: Create the boards page**

`src/app/(main)/boards/page.tsx`:

```tsx
import { LayoutGrid } from 'lucide-react';
import { PlaceholderPage } from '@/components/placeholder/placeholder-page';

export default function BoardsPage() {
  return (
    <PlaceholderPage
      icon={LayoutGrid}
      title="Active Boards"
      description="Browse the active bill-tracking boards across organizations."
    >
      <div className="mt-2 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-28 rounded-md border border-dashed bg-muted/40" />
        ))}
      </div>
    </PlaceholderPage>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run build`
Expected: build succeeds; route list now includes `/search`, `/testimonies`, `/boards`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(main)/testimonies/page.tsx" "src/app/(main)/boards/page.tsx"
git commit -m "feat: add testimonies and boards placeholder pages"
```

---

### Task 7: Mobile hamburger nav links

**Files:**
- Modify: `src/components/main/mobile-hamburger-menu.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS` and `isNavItemActive` from `src/components/main/header-nav.tsx` (Task 1).

The Popover must close when a nav link is tapped; the shadcn popover exports no `PopoverClose`, so make it controlled.

- [ ] **Step 1: Add imports**

In `src/components/main/mobile-hamburger-menu.tsx`, add:

```tsx
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isNavItemActive, NAV_ITEMS } from './header-nav';
```

- [ ] **Step 2: Make the popover controlled**

Inside `MobileHamburgerMenu`, add state and pathname:

```tsx
const [menuOpen, setMenuOpen] = useState(false);
const pathname = usePathname();
```

Change `<Popover>` to:

```tsx
<Popover open={menuOpen} onOpenChange={setMenuOpen}>
```

- [ ] **Step 3: Add the nav links section**

At the TOP of the `<div className="flex flex-col gap-4">` inside `PopoverContent` (above the tenant selector), insert:

```tsx
          {/* Top-level navigation */}
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-2 text-sm',
                  isNavItemActive(href, pathname)
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/main/mobile-hamburger-menu.tsx
git commit -m "feat: add top-level nav links to mobile hamburger menu"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all existing tests pass (pure-logic suite untouched).

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run build`
Expected: build succeeds with routes `/`, `/search`, `/testimonies`, `/boards`, `/register`, `/verify-email`.

- [ ] **Step 2: Manual smoke check (dev server)**

Run: `npm run dev` (port 9002) and verify:
- Logged out: `/` shows the login wall card (no board); nav tabs render centered in the header on desktop; clicking each nav tab navigates and highlights it.
- `/search`, `/testimonies`, `/boards` show their placeholder content under the header.
- Logged in: `/` shows the ViewToggle toolbar and the kanban board; admin users also see the Admin tab in the toggle.
- Mobile viewport: hamburger menu lists the four nav links and closes on tap; the bottom tab bar appears only on `/`.
- `/register` renders with no header.

- [ ] **Step 3: Report results**

If anything fails, fix before declaring done (superpowers:verification-before-completion).
