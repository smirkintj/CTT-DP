import type { Session } from 'next-auth';
import { User, Role } from '@/types';

export function sessionToUser(session: Session | null): User | null {
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name || session.user.email || 'User',
    email: session.user.email || '',
    role: session.user.role === 'ADMIN' ? Role.ADMIN : Role.STAKEHOLDER,
    countryCode: session.user.countryCode || null,
    avatarUrl: session.user.image || undefined,
  };
}
