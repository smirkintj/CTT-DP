'use client';

import { SessionProvider } from 'next-auth/react';
import { ToastHost } from '../components/ToastHost';
import { ActivitiesProvider } from '../components/ActivitiesContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ActivitiesProvider>
        {children}
        <ToastHost />
      </ActivitiesProvider>
    </SessionProvider>
  );
}
