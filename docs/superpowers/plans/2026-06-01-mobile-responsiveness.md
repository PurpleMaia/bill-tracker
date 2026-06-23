# Mobile Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Food+ Bill Tracker fully responsive from phones (~375px) through desktops, using md (768px) as the primary breakpoint.

**Architecture:** Add responsive Tailwind classes to existing components. Create three new components: BottomTabBar (mobile view navigation), MobileHamburgerMenu (collapsible header controls), and KanbanPillStrip (quick-scroll navigation for mobile kanban). No layout system overhaul — changes are co-located with components they affect.

**Tech Stack:** Tailwind CSS responsive classes, shadcn/ui Popover, Lucide icons, existing KanbanBoardContext for shared state.

---

## File Structure

**New files:**
- `src/components/main/bottom-tab-bar.tsx` — Fixed bottom nav for mobile with Kanban/Spreadsheet/Admin tabs. Uses `useKanbanBoard()` context for view state. Hidden at md+.
- `src/components/main/mobile-hamburger-menu.tsx` — Popover triggered by hamburger icon containing tenant selector, search input, and auth menu. Hidden at md+.
- `src/components/kanban/kanban-pill-strip.tsx` — Horizontal row of pill buttons for quick-scrolling the kanban board on mobile. Hidden at md+.

**Modified files:**
- `src/app/globals.css` — Add `overflow-x: hidden` to body.
- `src/app/layout.tsx` — Verify viewport meta (Next.js handles this, but confirm).
- `src/app/page.tsx` — Add BottomTabBar, adjust main container padding.
- `src/components/main/header.tsx` — Responsive header: compact on mobile with hamburger, unchanged on desktop.
- `src/components/kanban/kanban-board.tsx` — Responsive spacing, hide bottom bar on mobile, add pill strip.
- `src/components/kanban/kanban-column.tsx` — Responsive width (`w-[85vw] md:w-80`) and height.
- `src/components/kanban/kanban-spreadsheet.tsx` — Responsive column widths, padding, font size.
- `src/components/ui/dialog.tsx` — Responsive padding (`p-4 md:p-6`).

---

### Task 1: Global Setup — Viewport, Overflow, Base Spacing

**Files:**
- Modify: `src/app/globals.css:67-75`
- Modify: `src/app/layout.tsx:28-31`

- [ ] **Step 1: Add overflow-x-hidden to body in globals.css**

In `src/app/globals.css`, change the body rule inside `@layer base` from:

```css
body {
  @apply bg-background text-foreground;
  font-family: var(--font-geist-sans), sans-serif;
}
```

to:

```css
body {
  @apply bg-background text-foreground overflow-x-hidden;
  font-family: var(--font-geist-sans), sans-serif;
}
```

- [ ] **Step 2: Verify viewport meta tag in layout.tsx**

Check that the `metadata` export in `src/app/layout.tsx` exists. Next.js 15 automatically adds `<meta name="viewport" content="width=device-width, initial-scale=1">` when you export a `metadata` object, which this file already does at lines 28-31. No change needed unless the viewport is missing from the rendered HTML.

Run: `npm run dev` (if not running), then open http://localhost:9002 in a browser. Inspect the `<head>` and confirm the viewport meta tag is present.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add overflow-x-hidden to body for mobile"
```

---

### Task 2: Responsive Dialog Padding

**Files:**
- Modify: `src/components/ui/dialog.tsx:41`

- [ ] **Step 1: Update DialogContent padding**

In `src/components/ui/dialog.tsx`, line 41, change the className string. Find `p-6` and replace with `p-4 md:p-6`.

The full className becomes:
```
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 md:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
```

- [ ] **Step 2: Verify dialogs still render correctly**

Run the dev server. Open the app, click login or any action that opens a dialog. Confirm it looks correct on both narrow (375px in devtools) and wide viewports.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: responsive dialog padding for mobile"
```

---

### Task 3: Responsive Header — Compact Mobile + Hamburger Menu

**Files:**
- Modify: `src/components/main/header.tsx`
- Create: `src/components/main/mobile-hamburger-menu.tsx`

- [ ] **Step 1: Create MobileHamburgerMenu component**

Create `src/components/main/mobile-hamburger-menu.tsx`:

```tsx
'use client';

import { Menu, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { AuthHeader } from '@/components/auth/auth-header';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export function MobileHamburgerMenu() {
  const { setSearchQuery } = useKanbanBoard();
  const { activeTenant, memberships, setActiveTenant } = useAuth();

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="flex flex-col gap-3">
          {/* Tenant selector */}
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="text-sm border border-input bg-background rounded-md px-2 py-1.5 w-full"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.name}
                </option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search bills..."
              className="pl-9"
              onChange={handleSearchChange}
              aria-label="Search bills"
            />
          </div>

          {/* Auth */}
          <div className="flex justify-end">
            <AuthHeader />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Rewrite header.tsx for responsive layout**

Replace the entire content of `src/components/main/header.tsx` with:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { KanbanSquareIcon, ListCheck, Search, Table, Users2Icon } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { AuthHeader } from '../auth/auth-header';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { MobileHamburgerMenu } from './mobile-hamburger-menu';

export function Header() {
  const { view: currentView, setView } = useKanbanBoard();
  const { user, activeTenant, memberships, setActiveTenant } = useAuth();
  const publicViews = ['kanban', 'spreadsheet'];

  const orgRole = activeTenant?.orgRole;
  const views = user
    ? orgRole === 'admin'
      ? ['kanban', 'spreadsheet', 'admin']
      : orgRole === 'worker'
        ? ['kanban', 'spreadsheet']
        : ['kanban', 'spreadsheet']
    : publicViews;

  const { setSearchQuery } = useKanbanBoard();

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center px-3 md:px-8 py-3 md:py-4 border-b-[3px] border-olive bg-primary text-primary-foreground">
        {/* Title — always visible */}
        <div className="flex-shrink-0 flex items-center gap-3">
          <h1 className="text-lg md:text-xl font-semibold text-primary-foreground">
            {activeTenant?.name ?? 'Food+'} Bill Tracker
          </h1>
          {/* Tenant selector — desktop only */}
          {memberships.length > 1 && (
            <select
              value={activeTenant?.tenantId ?? ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              className="hidden md:block text-sm bg-white/10 border border-white/20 text-white rounded-md px-2 py-1"
            >
              {memberships.map((m) => (
                <option key={m.tenantId} value={m.tenantId} className="text-black">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* View tabs — desktop only, absolutely centered */}
        <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 justify-center w-fit">
          <Tabs
            value={currentView}
            onValueChange={(v) => setView(v as "kanban" | "spreadsheet" | "admin" | "approvals" | "supervisor")}
            className="rounded-md shadow-sm"
          >
            <TabsList className="bg-secondary">
              {views.map(v => (
                <TabsTrigger key={v} value={v}
                  className="data-[state=active]:bg-primary data-[state=active]:text-white text-secondary-foreground"
                >
                  {getIconForView(v)} {v.charAt(0).toUpperCase() + v.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Search and Auth — desktop only */}
        <div className="hidden md:flex relative max-w-md gap-4 flex-shrink-0 ml-auto">
          <Search className="absolute left-3 top-3 h-4 w-4 text-white/60" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full rounded-md bg-white/10 border border-white/20 text-white placeholder:text-white/60 pl-9 focus:bg-white/20 shadow-sm"
            onChange={handleSearchChange}
            aria-label="Search bills"
          />
          <AuthHeader />
        </div>

        {/* Hamburger menu — mobile only */}
        <div className="md:hidden ml-auto">
          <MobileHamburgerMenu />
        </div>
      </header>
    </>
  );
}

function getIconForView(view: string) {
  switch (view) {
    case 'kanban':
      return <KanbanSquareIcon className="h-5 w-5 mr-2" />;
    case 'spreadsheet':
      return <Table className="h-5 w-5 mr-2" />;
    case 'approvals':
      return <ListCheck className="h-5 w-5 mr-2" />;
    case 'admin':
      return <Users2Icon className="h-5 w-5 mr-2" />;
    default:
      return null;
  }
}
```

- [ ] **Step 3: Verify header on mobile and desktop**

Open devtools, toggle between 375px and 1024px+ widths. Confirm:
- Mobile: title + hamburger only; hamburger opens popover with tenant selector, search, auth
- Desktop: full header with centered tabs, search bar, auth — identical to current behavior

- [ ] **Step 4: Commit**

```bash
git add src/components/main/header.tsx src/components/main/mobile-hamburger-menu.tsx
git commit -m "feat: responsive header with hamburger menu on mobile"
```

---

### Task 4: Bottom Tab Bar

**Files:**
- Create: `src/components/main/bottom-tab-bar.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create BottomTabBar component**

Create `src/components/main/bottom-tab-bar.tsx`:

```tsx
'use client';

import { KanbanSquareIcon, Table, Users2Icon } from 'lucide-react';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { useAuth } from '@/hooks/contexts/auth-context';
import { cn } from '@/lib/utils';

export function BottomTabBar() {
  const { view, setView } = useKanbanBoard();
  const { user, activeTenant } = useAuth();

  const orgRole = activeTenant?.orgRole;
  const tabs = user
    ? orgRole === 'admin'
      ? (['kanban', 'spreadsheet', 'admin'] as const)
      : (['kanban', 'spreadsheet'] as const)
    : (['kanban', 'spreadsheet'] as const);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-background/95 backdrop-blur py-2">
      {tabs.map((tab) => {
        const isActive = view === tab;
        return (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-1 text-xs transition-colors',
              isActive
                ? 'text-primary font-semibold'
                : 'text-muted-foreground'
            )}
          >
            {tab === 'kanban' && <KanbanSquareIcon className="h-5 w-5" />}
            {tab === 'spreadsheet' && <Table className="h-5 w-5" />}
            {tab === 'admin' && <Users2Icon className="h-5 w-5" />}
            <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Add BottomTabBar to page.tsx and adjust spacing**

Replace the content of `src/app/page.tsx` with:

```tsx
'use client';

import { Header } from '@/components/main/header';
import { ProtectedKanbanBoardOrSpreadsheet } from '@/components/kanban/protected-kanban-board';
import { AdminDashboard } from '@/components/admin/admin-dashboard';
import { ApprovalsDashboard } from '@/components/approvals/approvals-dashboard';
import { SupervisorDashboard } from '@/components/supervisor/supervisor-dashboard';
import { useAuth } from '@/hooks/contexts/auth-context';
import { useKanbanBoard } from '@/hooks/contexts/kanban-board-context';
import { BottomTabBar } from '@/components/main/bottom-tab-bar';

export default function Home() {
  const { view, setView } = useKanbanBoard();
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 overflow-auto pb-14 md:pb-0">
        {view === 'admin' ? (
          <AdminDashboard />
        ) : view === 'supervisor' ? (
          <SupervisorDashboard />
        ) : view === 'approvals' ? (
          <ApprovalsDashboard />
        ) : view === 'spreadsheet' ? (
          <ProtectedKanbanBoardOrSpreadsheet />
        ) : (
          <ProtectedKanbanBoardOrSpreadsheet />
        )}
      </main>

      <BottomTabBar />
    </div>
  );
}
```

Key changes:
- Added `pb-14 md:pb-0` to `<main>` so content doesn't hide behind the bottom tab bar on mobile
- Imported and rendered `<BottomTabBar />` after main

- [ ] **Step 3: Verify bottom tab bar**

At 375px: bottom tab bar visible with Kanban/Spreadsheet (and Admin if logged in as admin). Tapping switches views.
At 768px+: bottom tab bar hidden, header tabs work as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/main/bottom-tab-bar.tsx src/app/page.tsx
git commit -m "feat: add bottom tab bar for mobile view navigation"
```

---

### Task 5: Kanban Pill Strip + Responsive Board

**Files:**
- Create: `src/components/kanban/kanban-pill-strip.tsx`
- Modify: `src/components/kanban/kanban-board.tsx:430-553`

- [ ] **Step 1: Create KanbanPillStrip component**

Create `src/components/kanban/kanban-pill-strip.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';

interface KanbanPillStripProps {
  onScrollToIntroduced: () => void;
  onScrollToCrossover: () => void;
  onScrollToConference: () => void;
  onScrollToGovernor: () => void;
}

export function KanbanPillStrip({
  onScrollToIntroduced,
  onScrollToCrossover,
  onScrollToConference,
  onScrollToGovernor,
}: KanbanPillStripProps) {
  return (
    <div className="md:hidden overflow-x-auto px-3 py-2 border-b bg-background/90">
      <div className="flex gap-2 w-max">
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToIntroduced}>
          Introduced
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToCrossover}>
          Crossover
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToConference}>
          Conference
        </Button>
        <Button variant="outline" size="sm" className="rounded-full text-xs h-7 px-3" onClick={onScrollToGovernor}>
          Governor
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update kanban-board.tsx — add pill strip, hide bottom bar on mobile, responsive spacing**

In `src/components/kanban/kanban-board.tsx`, make these changes:

**Add import** at the top (after existing imports):
```tsx
import { KanbanPillStrip } from './kanban-pill-strip';
```

**Change both ScrollArea containers** (the readOnly one at line ~432 and the DragDropContext one at line ~481): change `className="h-full w-full whitespace-nowrap p-4"` to `className="h-full w-full whitespace-nowrap p-2 md:p-4"`.

**Change the flex gap** in both `<div className="flex space-x-4 pb-4">` (lines ~441 and ~490) to `className="flex space-x-2 md:space-x-4 pb-4"`.

**Replace the bottom scroll bar** (lines 540-553). Change:
```tsx
<div className="fixed bottom-0 left-0 w-full flex justify-center gap-4 bg-background/90 p-2 z-20 border-t">
```
to:
```tsx
<div className="hidden md:flex fixed bottom-0 left-0 w-full justify-center gap-4 bg-background/90 p-2 z-20 border-t">
```

**Add the pill strip** in the return JSX. The pill strip goes BEFORE the ScrollArea blocks. Wrap the return in a fragment if needed. The return block (lines 429-562) should become:

```tsx
return (
  <>
    <KanbanPillStrip
      onScrollToIntroduced={scrollToIntroduced}
      onScrollToCrossover={scrollToCrossover}
      onScrollToConference={scrollToConference}
      onScrollToGovernor={scrollToGovernor}
    />

    {(readOnly || isSimplified) ? (
      <ScrollArea className="h-full w-full whitespace-nowrap p-2 md:p-4">
        {/* ... existing content unchanged ... */}
      </ScrollArea>
    ) : (
      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <ScrollArea className="h-full w-full whitespace-nowrap p-2 md:p-4">
          {/* ... existing content unchanged ... */}
        </ScrollArea>
      </DragDropContext>
    )}

    {/* Bottom scroll bar — desktop only */}
    <div className="hidden md:flex fixed bottom-0 left-0 w-full justify-center gap-4 bg-background/90 p-2 z-20 border-t">
      <Button variant="secondary" onClick={scrollToIntroduced}>Introduced</Button>
      <Button variant="secondary" onClick={scrollToCrossover}>Crossover</Button>
      <Button variant="secondary" onClick={scrollToConference}>Conference</Button>
      <Button variant="secondary" onClick={scrollToGovernor}>Governor</Button>
    </div>

    {/* Details dialog */}
    <BillDetailsDialog
      billID={selectedBillId}
      isOpen={isDialogOpen}
      onClose={() => setIsDialogOpen(false)}
    />
  </>
);
```

- [ ] **Step 3: Verify**

Mobile (375px): pill strip visible at top, bottom bar hidden. Tapping pills scrolls to correct column.
Desktop (1024px+): pill strip hidden, bottom bar visible — same as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/kanban/kanban-pill-strip.tsx src/components/kanban/kanban-board.tsx
git commit -m "feat: add kanban pill strip for mobile, hide bottom bar on mobile"
```

---

### Task 6: Responsive Kanban Columns

**Files:**
- Modify: `src/components/kanban/kanban-column.tsx:113-121`

- [ ] **Step 1: Update column container className**

In `src/components/kanban/kanban-column.tsx`, line 116, change:

```tsx
'flex h-[calc(100vh-10rem)] w-80 shrink-0 flex-col rounded-lg border shadow-sm',
```

to:

```tsx
'flex h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] w-[85vw] md:w-80 shrink-0 flex-col rounded-lg border shadow-sm',
```

- [ ] **Step 2: Verify columns on mobile**

At 375px: each column is ~319px wide (85% of 375px), giving a visual peek at the next column. Column height accounts for the bottom tab bar. Swiping horizontally scrolls between columns.
At 768px+: columns are 320px wide (w-80), same height as before.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/kanban-column.tsx
git commit -m "feat: responsive kanban column width and height for mobile"
```

---

### Task 7: Responsive Spreadsheet

**Files:**
- Modify: `src/components/kanban/kanban-spreadsheet.tsx`

- [ ] **Step 1: Update outer container padding**

In `src/components/kanban/kanban-spreadsheet.tsx`, line 194, change:

```tsx
<div className="min-w-max p-4">
```

to:

```tsx
<div className="min-w-max p-2 md:p-4">
```

- [ ] **Step 2: Add responsive font size to Table**

Line 195, change:

```tsx
<Table className="min-w-max">
```

to:

```tsx
<Table className="min-w-max text-xs md:text-sm">
```

- [ ] **Step 3: Update header column widths**

In the `<TableHeader>` section (lines 197-207), update each column width:

Change line 198:
```tsx
<SortHeader label="Bill #" columnKey="bill_number" className="w-[8rem]" sticky sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Bill #" columnKey="bill_number" className="w-[6rem] md:w-[8rem]" sticky sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 199:
```tsx
<SortHeader label="Current Status" columnKey="current_bill_status" className="w-[10rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Current Status" columnKey="current_bill_status" className="w-[8rem] md:w-[10rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 200:
```tsx
<SortHeader label="Bill Title" columnKey="bill_title" className="min-w-[20rem] max-w-[30rem] w-[30rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Bill Title" columnKey="bill_title" className="min-w-[12rem] md:min-w-[20rem] max-w-[15rem] md:max-w-[30rem] w-[15rem] md:w-[30rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 201:
```tsx
<TableHead className="min-w-[15rem] max-w-[30rem] w-[30rem] py-4">Policy Description</TableHead>
```
to:
```tsx
<TableHead className="min-w-[10rem] md:min-w-[15rem] max-w-[15rem] md:max-w-[30rem] w-[15rem] md:w-[30rem] py-2 md:py-4">Policy Description</TableHead>
```

Change line 202:
```tsx
<SortHeader label="Committee" columnKey="committee_assignment" className="w-[12rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Committee" columnKey="committee_assignment" className="w-[8rem] md:w-[12rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 203:
```tsx
<SortHeader label="Introducer" columnKey="introducer" className="w-[12rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Introducer" columnKey="introducer" className="w-[8rem] md:w-[12rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 204:
```tsx
<SortHeader label="Year" columnKey="year" className="w-[6rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Year" columnKey="year" className="w-[5rem] md:w-[6rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 205:
```tsx
<SortHeader label="Next Deadline" columnKey="next_deadline" className="w-[10rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```
to:
```tsx
<SortHeader label="Next Deadline" columnKey="next_deadline" className="w-[8rem] md:w-[10rem]" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
```

Change line 206:
```tsx
<TableHead className="w-[15rem] py-4">Tags</TableHead>
```
to:
```tsx
<TableHead className="w-[10rem] md:w-[15rem] py-2 md:py-4">Tags</TableHead>
```

- [ ] **Step 4: Update data cell widths and padding**

Update each `<TableCell>` in the data rows to match responsive widths. Update `py-4` to `py-2 md:py-4` on all data cells.

Line 264 (Bill # cell):
```tsx
<TableCell className="sticky left-0 z-20 w-[8rem] py-4" style={firstTagColor ? { backgroundColor: `${firstTagColor}14` } : undefined}>
```
to:
```tsx
<TableCell className="sticky left-0 z-20 w-[6rem] md:w-[8rem] py-2 md:py-4" style={firstTagColor ? { backgroundColor: `${firstTagColor}14` } : undefined}>
```

Line 275 (Status cell):
```tsx
<TableCell className="w-[10rem] py-4">
```
to:
```tsx
<TableCell className="w-[8rem] md:w-[10rem] py-2 md:py-4">
```

Line 279 (Title cell):
```tsx
<TableCell className="text-wrap min-w-[20rem] max-w-[30rem] w-[30rem] py-4">
```
to:
```tsx
<TableCell className="text-wrap min-w-[12rem] md:min-w-[20rem] max-w-[15rem] md:max-w-[30rem] w-[15rem] md:w-[30rem] py-2 md:py-4">
```

Line 283 (Description cell):
```tsx
<TableCell className="text-wrap min-w-[15rem] max-w-[30rem] w-[30rem] py-4">
```
to:
```tsx
<TableCell className="text-wrap min-w-[10rem] md:min-w-[15rem] max-w-[15rem] md:max-w-[30rem] w-[15rem] md:w-[30rem] py-2 md:py-4">
```

Line 287 (Committee cell):
```tsx
<TableCell className="text-wrap w-[12rem] py-4">
```
to:
```tsx
<TableCell className="text-wrap w-[8rem] md:w-[12rem] py-2 md:py-4">
```

Line 291 (Introducer cell):
```tsx
<TableCell className="text-wrap w-[12rem] py-4">
```
to:
```tsx
<TableCell className="text-wrap w-[8rem] md:w-[12rem] py-2 md:py-4">
```

Line 295 (Year cell):
```tsx
<TableCell className="w-[6rem] py-4">
```
to:
```tsx
<TableCell className="w-[5rem] md:w-[6rem] py-2 md:py-4">
```

Line 300 (Deadline cell):
```tsx
<TableCell className="w-[10rem] py-4">
```
to:
```tsx
<TableCell className="w-[8rem] md:w-[10rem] py-2 md:py-4">
```

Line 315 (Tags cell):
```tsx
<TableCell className="w-[15rem] py-4">
```
to:
```tsx
<TableCell className="w-[10rem] md:w-[15rem] py-2 md:py-4">
```

Also update the tag row cell (line 237):
```tsx
<TableCell colSpan={totalColumns} className="py-1 px-4">
```
to:
```tsx
<TableCell colSpan={totalColumns} className="py-1 px-2 md:px-4">
```

- [ ] **Step 5: Update SortHeader padding**

In the `SortHeader` component (line 102), change the `py-4` in the className:

```tsx
className={`${className ?? ''} ${sticky ? 'sticky left-0 z-20 bg-background' : ''} py-4 cursor-pointer select-none hover:bg-muted/50 transition-colors`}
```

to:

```tsx
className={`${className ?? ''} ${sticky ? 'sticky left-0 z-20 bg-background' : ''} py-2 md:py-4 cursor-pointer select-none hover:bg-muted/50 transition-colors`}
```

- [ ] **Step 6: Verify spreadsheet on mobile**

At 375px: table is horizontally scrollable, Bill # column is sticky, cells are compact with smaller text. Total width is roughly ~1200px instead of ~3000px.
At 768px+: table looks identical to current desktop layout.

- [ ] **Step 7: Commit**

```bash
git add src/components/kanban/kanban-spreadsheet.tsx
git commit -m "feat: responsive spreadsheet with compact mobile columns and padding"
```

---

### Task 8: Final Verification + Typecheck

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: no type errors.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (these are pure unit tests that don't test UI, so they should be unaffected).

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no lint errors.

- [ ] **Step 4: Manual verification at multiple breakpoints**

Open the dev server and test these breakpoints using browser devtools:

**375px (iPhone SE):**
- Header: title + hamburger only
- Hamburger menu: opens with tenant selector, search, auth
- Bottom tab bar: visible with correct tabs
- Kanban: columns are 85vw wide, pill strip visible at top, swipable
- Spreadsheet: horizontally scrollable, sticky Bill # column, compact cells
- Dialogs: slightly less padding, still centered

**768px (iPad Mini / md breakpoint):**
- Header: full desktop layout appears
- Bottom tab bar: hidden
- Kanban: columns snap to w-80, bottom bar visible
- Spreadsheet: full desktop column widths

**1024px+ (desktop):**
- Everything identical to current production behavior

- [ ] **Step 5: Commit any fixes found during verification**

If any issues are found, fix and commit:
```bash
git add -u
git commit -m "fix: mobile responsiveness adjustments from manual testing"
```
