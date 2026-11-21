import { Header } from '@/components/main/header';
import { WelcomeTour } from '@/components/tour/welcome-tour';
import { InterestPickerDialog } from '@/components/recommendations/interest-picker-dialog';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-overlay focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-md"
      >
        Skip to content
      </a>
      <Header />
      {/* Mobile page nav is the header's hamburger drawer, so no bottom space
          is reserved; the safe-area pad keeps content clear of the iOS home
          indicator. On phones the page itself never scrolls sideways — the
          board scrolls horizontally inside its own viewport. */}
      <main id="main-content" className="min-h-0 flex-1 overflow-auto pb-[env(safe-area-inset-bottom)] max-md:overflow-x-hidden md:pb-0">{children}</main>
      <WelcomeTour />
      <InterestPickerDialog />
    </div>
  );
}
