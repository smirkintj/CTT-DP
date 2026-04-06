import type { NextConfig } from 'next';
import { execFileSync } from 'child_process';

/** Build version: major.minor from package.json, patch = total git commit count.
 *  Auto-increments on every commit/deployment. Bump major.minor in package.json
 *  for significant releases (e.g. 1.4 → 1.5 for a big drop). */
const getAppVersion = (): string => {
  const base = process.env.npm_package_version ?? '1.4.0';
  try {
    const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim();
    const [major, minor] = base.split('.');
    return `${major}.${minor}.${count}`;
  } catch {
    return base;
  }
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
