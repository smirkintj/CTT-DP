import AppRouteShell from '../../AppRouteShell';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <AppRouteShell
      initialView="TASK_DETAIL"
      initialTaskId={params.id}
    />
  );
}
