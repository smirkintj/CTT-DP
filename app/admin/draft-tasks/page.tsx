import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AdminDraftTasks } from '@/views/AdminDraftTasks';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/');
  if (session.user.role !== 'ADMIN') redirect('/');
  return <AdminDraftTasks />;
}
