'use client';

import { useRouter } from 'next/navigation';
import App from '../App';
import { ViewState, Role, User } from '../types';
import { MOCK_USERS } from '../constants';

interface AppRouteShellProps {
  initialView?: ViewState;
  initialTaskId?: string | null;
  initialRole?: Role;
}

const getUserForRole = (role?: Role): User | null => {
  if (!role) return null;
  return MOCK_USERS.find((user) => user.role === role) ?? MOCK_USERS[0] ?? null;
};

export default function AppRouteShell({ initialView, initialTaskId = null, initialRole }: AppRouteShellProps) {
  const router = useRouter();
  const initialUser = getUserForRole(initialRole);

  return (
    <App
      initialUser={initialUser}
      initialView={initialView}
      initialSelectedTaskId={initialTaskId}
      onRouteChange={(nextView, taskId) => {
        switch (nextView) {
          case 'LOGIN':
          case 'DASHBOARD_STAKEHOLDER':
            router.push('/');
            return;
          case 'DASHBOARD_ADMIN':
          case 'ADMIN_TASK_MANAGEMENT':
          case 'ADMIN_DATABASE':
            router.push('/admin');
            return;
          case 'IMPORT_WIZARD':
            router.push('/import');
            return;
          case 'TASK_DETAIL':
            if (taskId) {
              router.push(`/tasks/${taskId}`);
              return;
            }
            router.push('/');
            return;
          default: {
            const _exhaustiveCheck: never = nextView;
            router.push('/');
            return _exhaustiveCheck;
          }
        }
      }}
    />
  );
}
