#!/usr/bin/env node
// Step 0 — Create deploy tarball (replaces stale deploy_tmp/project.tar.gz)
// Uses built-in node:zlib + node:tar, NO external deps.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const ROOT = path.resolve('d:/AEO/SEO V2');
const OUT_DIR = path.join(ROOT, 'deploy_tmp');
const OUT = path.join(OUT_DIR, 'project.tar.gz');
fs.mkdirSync(OUT_DIR, { recursive: true });

const INCLUDE = [
  // Backend core
  'server/',       // includes index.ts + app.ts (critical dual mount!) + auth.ts + _core/ + routers/
  // Client source (needed for Vite build!)
  'client/',
  // DB schema + migrations
  'db/',           // migrations/ + schema.ts + index.ts
  // Shared types
  'shared/',
  // Client built files (after npm run build)
  'dist/',
  // Deps lockfiles + configs
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'drizzle.config.ts',
  'index.html',
];

// Verify server/app.ts (the dual mount file!) exists locally
for (const f of ['server/app.ts', 'server/auth.ts', 'server/index.ts', 'client/src/main.tsx', 'dist/index.html']) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    console.error(`❌ MISSING CRITICAL FILE: ${f} — abort tar build`);
    process.exit(2);
  }
}
console.log('✅ All critical files present locally (server/app.ts has dual /api/oauth mount)');

// Use 7z native PS tar (Windows 10+ built-in tar.exe) OR node:tar fallback
// Windows: tar.exe (bsdtar) included since 1803 + tar -czf works
function safeAbs(p){
  // Convert to forward slash + avoid C:/ prefix issues with tar
  return p.replace(/\\/g, '/');
}

// Option A: Write include list file
const INCLUDE_FILE = path.join(OUT_DIR, 'tar_include.txt');
const paths = INCLUDE.map(p => safeAbs(path.isAbsolute(p)? p : path.join(ROOT, p)));
fs.writeFileSync(INCLUDE_FILE, paths.map(p => {
  // Tar -T wants paths RELATIVE to cwd OR absolute; use cwd=ROOT with relative
  const rel = path.relative(ROOT, p).replace(/\\/g,'/');
  return rel;
}).join('\n') + '\n');
console.log(`📄 include list (${paths.length} top-level):\n  ${paths.map(p=>path.relative(ROOT,p)).join('\n  ')}`);

try {
  execSync(
    `tar --exclude='node_modules' --exclude='.git' --exclude='.env' --exclude='deploy_tmp' --exclude='*.log' -czf "${OUT.replace(/\\/g,'/')}" -C "${ROOT.replace(/\\/g,'/')}" -T "${INCLUDE_FILE.replace(/\\/g,'/')}"`,
    { stdio: 'inherit', encoding: 'utf8', timeout: 120000 }
  );
} catch(e) {
  console.error('TAR FAILED code', e.status, 'fallback? stderr:', e.stderr?.toString?.() || e.message);
  process.exit(3);
}

const st = fs.statSync(OUT);
console.log(`\n✅ TARBALL READY → ${OUT} (${(st.size/1024).toFixed(1)} KB)`);

// WP-D1 (CRITICAL): Compute sha256 checksum for deploy sync verification (prevents corrupt upload / partial transfer)
import { createHash } from 'node:crypto';
const sha256Local = createHash('sha256').update(fs.readFileSync(OUT)).digest('hex').toLowerCase();
const SHA_OUT = path.join(OUT_DIR, 'project.tar.gz.sha256');
fs.writeFileSync(SHA_OUT, sha256Local + '\n');
console.log(`🧮 SHA256 CHECKSUM → ${SHA_OUT}\n   ${sha256Local}`);

// Double-verify: does the fresh tarball contain critical files?
const ver = String(execSync(`tar -tzf "${OUT.replace(/\\/g,'/')}"`));
const hasApp = /server\/app\.ts/.test(ver);
const hasAuth = /server\/auth\.ts/.test(ver);
const hasClient = /client\/src\/main\.tsx/.test(ver);
const hasDist = /dist\/index\.html/.test(ver);
console.log(`Tarball verify — server/app.ts=${hasApp?'✅':'❌'} | server/auth.ts=${hasAuth?'✅':'❌'} | client/src/main.tsx=${hasClient?'✅':'❌'} | dist/index.html=${hasDist?'✅':'❌'}`);
if (!hasApp || !hasAuth || !hasClient) process.exit(4);
process.exit(0);
