import { BrowseOrgsList } from '@/components/boards/browse-orgs-list';

export default function BrowseOrgsPage() {
  return (
    // h-full makes this div the page's real scroller (main stops overflowing),
    // which the list's scroll-to-top button attaches to.
    <div className="h-full overflow-y-auto p-4">
      <h1 className="sr-only">Browse organizations</h1>
      <BrowseOrgsList />
    </div>
  );
}
