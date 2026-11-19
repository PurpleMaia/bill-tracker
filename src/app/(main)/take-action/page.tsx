import { redirect } from 'next/navigation';
import { TESTIMONY_HREF } from '@/lib/take-action/routes';

/** The section lands on its first tab. */
export default function TakeActionPage() {
  redirect(TESTIMONY_HREF);
}
