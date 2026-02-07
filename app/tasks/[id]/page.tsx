import AppRouteShell from '../../AppRouteShell';
import { Role } from '../../../types';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <AppRouteShell
      initialRole={Role.ADMIN}
      initialView="TASK_DETAIL"
      initialTaskId={params.id}
    />
  );
}
