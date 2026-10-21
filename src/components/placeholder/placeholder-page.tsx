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
