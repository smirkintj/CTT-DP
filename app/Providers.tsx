'use client';

import { SessionProvider } from 'next-auth/react';
import { ToastHost } from '../components/ToastHost';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <ToastHost />
    </SessionProvider>
  );
}
