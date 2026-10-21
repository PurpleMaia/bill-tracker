import { BrowseOrgsList } from '@/components/boards/browse-orgs-list';

export default function BrowseOrgsPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h1 className="sr-only">Browse organizations</h1>
      <BrowseOrgsList />
    </div>
  );
}
