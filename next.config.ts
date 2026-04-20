import type { NextConfig } from 'next';
import { execFileSync } from 'child_process';

/** Build version: major.minor from package.json + 7-char git SHA.
 *  Uses VERCEL_GIT_COMMIT_SHA (always injected by Vercel) so staging and prod
 *  both show their exact deployed commit — no shallow-clone issues, no merge
 *  commit inflation. Bump major.minor in package.json for significant releases. */
const getAppVersion = (): string => {
  const base = process.env.npm_package_version ?? '1.4.0';
  const [major, minor] = base.split('.');
  const sha =
    (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) ||
    (() => { try { return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'local'; } })();
  return `${major}.${minor} · ${sha}`;
};

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
    NEXT_PUBLIC_APP_ENV: process.env.VERCEL_ENV ?? 'local',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
