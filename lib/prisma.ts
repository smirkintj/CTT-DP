import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

// In serverless environments each function instance gets its own connection.
// Capping at 1 prevents connection exhaustion on Neon's Postgres under concurrent load.
// For local dev the global singleton avoids repeated connections across hot reloads.
const prisma =
  global.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: (() => {
          const base = process.env.DATABASE_URL ?? '';
          if (process.env.NODE_ENV !== 'production') return base;
          const sep = base.includes('?') ? '&' : '?';
          return `${base}${sep}connection_limit=1&pool_timeout=20`;
        })()
      }
    }
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
