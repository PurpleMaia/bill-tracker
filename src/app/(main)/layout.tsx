import { Header } from '@/components/main/header';
import { BottomTabBar } from '@/components/main/bottom-tab-bar';
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
      {/* pb-16 reserves exactly the fixed bottom tab bar's h-16, so nothing at
          the bottom of a page (e.g. the board's page dots) hides under it. On
          phones the page itself never scrolls sideways — the board scrolls
          horizontally inside its own viewport. */}
      <main id="main-content" className="min-h-0 flex-1 overflow-auto pb-16 max-md:overflow-x-hidden md:pb-0">{children}</main>
      <BottomTabBar />
      <WelcomeTour />
      <InterestPickerDialog />
    </div>
  );
}
