import { ActiveBoardsProvider } from '@/hooks/contexts/active-boards-context';

export default function BoardsLayout({ children }: { children: React.ReactNode }) {
  return <ActiveBoardsProvider>{children}</ActiveBoardsProvider>;
}
