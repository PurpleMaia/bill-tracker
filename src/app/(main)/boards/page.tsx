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
