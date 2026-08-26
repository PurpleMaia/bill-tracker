import { redirect } from 'next/navigation';

// The app now lands on Search; the kanban board lives at /your-bills.
export default function Home() {
  redirect('/search');
}
