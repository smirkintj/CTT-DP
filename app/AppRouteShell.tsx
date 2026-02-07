'use client';

import { useRouter } from 'next/navigation';
import App from '../App';
import { ViewState } from '../types';

interface AppRouteShellProps {
  initialView?: ViewState;
  initialTaskId?: string | null;
}

export default function AppRouteShell({ initialView, initialTaskId = null }: AppRouteShellProps) {
  const router = useRouter();

  return (
    <App
      initialView={initialView}
      initialSelectedTaskId={initialTaskId}
      onRouteChange={(nextView, taskId) => {
        switch (nextView) {
          case 'LOGIN':
          case 'DASHBOARD_STAKEHOLDER':
            router.push('/');
            return;
          case 'DASHBOARD_ADMIN':
            router.push('/admin/dashboard');
            return;
          case 'ADMIN_TASK_MANAGEMENT':
            router.push('/admin/tasks');
            return;
          case 'ADMIN_DATABASE':
            router.push('/admin/database');
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
