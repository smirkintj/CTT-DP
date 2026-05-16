import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { mapTaskToUi } from '@/app/api/tasks/_mappers';
import { taskRelationIncludeFull } from '@/app/api/tasks/_query';
import { TaskDetail } from '@/views/TaskDetail';
import { Task } from '@/types';
import ErrorLayout from './ErrorLayout';

export const dynamic = 'force-dynamic';

interface TaskPageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: TaskPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/');
  }

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: taskRelationIncludeFull,
  });

  if (!task) {
    return <ErrorLayout title="Task not found" message="The task you're looking for doesn't exist." />;
  }

  if (session.user.role !== 'ADMIN' && task.countryCode !== session.user.countryCode) {
    return <ErrorLayout title="Access denied" message="You don't have permission to view this task." />;
  }

  const mappedTask = mapTaskToUi(task) as unknown as Task;

  return (
    <Suspense>
      <TaskDetail task={mappedTask} />
    </Suspense>
  );
}
