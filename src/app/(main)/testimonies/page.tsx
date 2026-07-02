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
