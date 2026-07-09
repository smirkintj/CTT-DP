import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

// Connection tuning differs by endpoint type:
//  - Neon's *pooled* endpoint (PgBouncer, transaction mode) manages connections
//    server-side, so we allow a larger client pool and disable prepared statements.
//  - A *direct* (unpooled) connection is capped at 1 per serverless instance to
//    avoid exhausting Postgres connections under concurrent load.
// For local dev the global singleton avoids repeated connections across hot reloads.
const prisma =
  global.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: (() => {
          const base = process.env.DATABASE_URL ?? '';
          if (process.env.NODE_ENV !== 'production' || !base) return base;
          const isPooled = /-pooler\./.test(base) || /[?&]pgbouncer=true/.test(base);
          const params: string[] = [];
          if (isPooled) {
            if (!/[?&]pgbouncer=/.test(base)) params.push('pgbouncer=true');
            if (!/[?&]connection_limit=/.test(base)) params.push('connection_limit=10');
          } else {
            if (!/[?&]connection_limit=/.test(base)) params.push('connection_limit=1');
            if (!/[?&]pool_timeout=/.test(base)) params.push('pool_timeout=20');
          }
          if (params.length === 0) return base;
          const sep = base.includes('?') ? '&' : '?';
          return `${base}${sep}${params.join('&')}`;
        })()
      }
    }
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;
