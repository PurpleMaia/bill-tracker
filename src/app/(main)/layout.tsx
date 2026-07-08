import { Header } from '@/components/main/header';
import { BottomTabBar } from '@/components/main/bottom-tab-bar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:text-foreground focus:shadow-md"
      >
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="min-h-0 flex-1 overflow-auto pb-14 md:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
