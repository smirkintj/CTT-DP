import { getServerSession } from 'next-auth';
import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { clearLoginFailures, getRemainingBlockMs, recordLoginFailure } from './loginRateLimit';

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt'
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().toLowerCase().trim();
        const password = credentials?.password?.toString();
        const isEmailFormat = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!isEmailFormat || !password) return null;

        if (getRemainingBlockMs(email) > 0) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email }
          });

          if (!user || !user.passwordHash) {
            recordLoginFailure(email);
            return null;
          }

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            recordLoginFailure(email);
            return null;
          }

          clearLoginFailures(email);

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            countryCode: user.countryCode
          };
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Credentials authorize failed:', error);
          }
          recordLoginFailure(email);
          return null;
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.countryCode = (user as { countryCode?: string | null }).countryCode ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.countryCode = (token.countryCode as string | null) ?? null;
      }
      return session;
    }
  }
};

export const getAuthSession = () => getServerSession(authOptions);
