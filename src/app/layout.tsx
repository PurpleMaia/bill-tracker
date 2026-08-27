import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { KanbanBoardProvider } from '@/hooks/contexts/kanban-board-context'; // Import the provider
import { Toaster } from "@/components/ui/toaster" // Import Toaster for potential notifications
import { BillsProvider } from '@/hooks/contexts/bills-context';
import { AuthProvider } from '@/hooks/contexts/auth-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/core/react-query';
import { Providers } from '@/lib/core/providers';
import { getInitialAuth } from '@/lib/auth/initial-auth';




//Wraps entire app with authentication context 
//Makes auth state avalible to all components

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Hawaiʻi Bill Tracker',
  description: 'Track Hawaiʻi\'s bills. Stay informed, stay engaged, and make your voice heard.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the session here so the very first paint already knows who the
  // user is. Otherwise every page renders signed-out, then hydrates, then
  // fetches the session — the flash of spinner/skeleton before real content.
  const initialAuth = await getInitialAuth();

  return (
    <html lang="en" suppressHydrationWarning={true}>
      {/* Add suppressHydrationWarning to body to ignore extension-injected attributes */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning={true}>
        <Providers initialAuth={initialAuth}>
          {children}
        </Providers>
        <Toaster /> {/* Add toaster for notifications */}
      </body>
    </html>
  );
}
