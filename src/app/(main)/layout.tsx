import { Header } from '@/components/main/header';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <main className="min-h-0 flex-1 overflow-auto pb-14 md:pb-0">{children}</main>
    </div>
  );
}
