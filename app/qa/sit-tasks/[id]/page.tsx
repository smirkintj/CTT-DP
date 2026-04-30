import AppRouteShell from '../../../AppRouteShell';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <AppRouteShell initialView="QA_SIT_TASK_DETAIL" initialTaskId={id} />;
}
