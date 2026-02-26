#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_API_DIR = path.join(ROOT, 'app', 'api', 'admin');
const WRITE_METHOD_RE = /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/g;
const AUDIT_CALL_RE = /\bcreateAdminAudit\s*\(/;

async function listRouteFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRouteFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const routeFiles = await listRouteFiles(ADMIN_API_DIR);
  const offenders = [];

  for (const filePath of routeFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const hasWriteHandler = WRITE_METHOD_RE.test(content);
    WRITE_METHOD_RE.lastIndex = 0;
    if (!hasWriteHandler) continue;
    if (AUDIT_CALL_RE.test(content)) continue;
    offenders.push(path.relative(ROOT, filePath));
  }

  if (offenders.length > 0) {
    console.error('Admin audit coverage check failed.');
    console.error('The following admin write route(s) do not call createAdminAudit():');
    for (const file of offenders) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log(`Admin audit coverage check passed (${routeFiles.length} route files scanned).`);
}

main().catch((error) => {
  console.error('Admin audit coverage check crashed:', error);
  process.exit(1);
});
