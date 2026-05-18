'use client';
import { useSession } from 'next-auth/react';
import { ChangePasswordModal } from './ChangePasswordModal';

export function MustChangePasswordGate({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  return (
    <>
      {children}
      {session?.user?.mustChangePassword && <ChangePasswordModal />}
    </>
  );
}
