import { getServerSession } from 'next-auth';
import type { NextAuthOptions } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './prisma';
import { clearLoginFailures, getRemainingBlockMs, recordLoginFailure } from './loginRateLimit';
import { hashMagicToken } from './magicLogin';

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

          if (!user || !user.passwordHash || !user.isActive) {
            recordLoginFailure(email);
            return null;
          }

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) {
            recordLoginFailure(email);
            return null;
          }

          clearLoginFailures(email);
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() }
            });
          } catch {}

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            countryCode: user.countryCode,
            mustChangePassword: user.mustChangePassword
          };
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Credentials authorize failed:', error);
          }
          recordLoginFailure(email);
          return null;
        }
      }
    }),
    Credentials({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: {
        token: { label: 'Token', type: 'text' }
      },
      async authorize(credentials) {
        const combinedToken = credentials?.token?.toString().trim() ?? '';
        const [tokenId, rawToken] = combinedToken.split('.');
        if (!tokenId || !rawToken) return null;

        try {
          const tokenHash = hashMagicToken(rawToken);
          const token = await prisma.magicLoginToken.findUnique({
            where: { id: tokenId },
            include: {
              user: true
            }
          });

          if (!token) return null;
          if (token.usedAt || token.expiresAt <= new Date()) return null;
          if (token.tokenHash !== tokenHash) return null;
          if (!token.user.isActive || token.user.role !== 'ADMIN') return null;

          const consumed = await prisma.magicLoginToken.updateMany({
            where: {
              id: token.id,
              usedAt: null
            },
            data: {
              usedAt: new Date()
            }
          });
          if (consumed.count === 0) return null;

          try {
            await prisma.user.update({
              where: { id: token.user.id },
              data: { lastLoginAt: new Date() }
            });
          } catch {}

          return {
            id: token.user.id,
            email: token.user.email,
            name: token.user.name,
            role: token.user.role,
            countryCode: token.user.countryCode,
            mustChangePassword: token.user.mustChangePassword
          };
        } catch (error) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Magic link authorize failed:', error);
          }
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
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.countryCode = (token.countryCode as string | null) ?? null;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);

        if (token.id) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: { mustChangePassword: true }
            });
            if (dbUser) {
              session.user.mustChangePassword = dbUser.mustChangePassword;
              token.mustChangePassword = dbUser.mustChangePassword;
            }
          } catch {}
        }
      }
      return session;
    }
  }
};

export const getAuthSession = () => getServerSession(authOptions);
