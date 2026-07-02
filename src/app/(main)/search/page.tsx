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
