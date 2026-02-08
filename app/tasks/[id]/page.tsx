import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/prisma';
import AppRouteShell from '../../AppRouteShell';
import ErrorLayout from './ErrorLayout';
import { Role, User } from '../../../types';

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  countryCode?: string | null;
  image?: string | null;
};

const buildUser = (sessionUser: SessionUser): User => {
  const role = sessionUser.role === 'ADMIN' ? Role.ADMIN : Role.STAKEHOLDER;
  return {
    id: sessionUser.id,
    name: sessionUser.name || sessionUser.email || 'User',
    email: sessionUser.email || '',
    role,
    countryCode: sessionUser.countryCode || 'SG',
    avatarUrl: sessionUser.image || undefined
  };
};

export default async function Page({ params }: TaskPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/');
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      countryCode: true
    }
  });

  if (!task) {
    return (
      <ErrorLayout
        title="Task not found"
        message="The task you’re looking for doesn’t exist."
        user={buildUser(session.user)}
      />
    );
  }

  if (session.user.role !== 'ADMIN' && task.countryCode !== session.user.countryCode) {
    return (
      <ErrorLayout
        title="Access denied"
        message="You don’t have permission to view this task."
        user={buildUser(session.user)}
      />
    );
  }

  return (
    <AppRouteShell
      initialView="TASK_DETAIL"
      initialTaskId={id}
    />
  );
}
