import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { StakeholderDashboard } from '@/views/StakeholderDashboard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return <LoginForm />;
  }

  if (session.user.role === 'ADMIN') {
    redirect('/admin/dashboard');
  }

  return <StakeholderDashboard />;
}
