import AppRouteShell from '../../AppRouteShell';
import { Role } from '../../../types';

export default function Page() {
  return <AppRouteShell initialRole={Role.ADMIN} initialView="DASHBOARD_ADMIN" />;
}
