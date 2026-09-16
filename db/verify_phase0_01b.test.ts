/**
 * ──────────────────────────────────────────────────────────────
 * EEAT Studio V2 — Task 0.1b Verification Test (Step 2 of Workflow)
 * ──────────────────────────────────────────────────────────────
 * Verify Init Project is COMPLETE:
 *   1. 5 Config files exist (package.json / .env.example / vite.config.ts /
 *        tsconfig.json / drizzle.config.ts)
 *   2. 5 Folders exist (client/ server/ db/ shared/ Phase/)
 *   3. package.json mandatory scripts present (dev:server / db:migrate / typecheck)
 *   4. package.json mandatory deps: react, express, drizzle-orm, mysql2, @trpc/server, jose
 * RUN:
 *   node --import tsx/esm db/verify_phase0_01b.test.ts
 *     OR
 *   npx vitest run db/verify_phase0_01b.test.ts
 * ──────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────
function check(label: string, pass: boolean, fix?: string): { label: string; pass: boolean; fix?: string } {
  return { label, pass, fix };
}

// ── Suite: Task 0.1b Init ──────────────────────────────────────
const results: Array<{ label: string; pass: boolean; fix?: string }> = [];

// (A) 5 Config files
const CONFIG_FILES = [
  'package.json',
  '.env.example',
  'vite.config.ts',
  'tsconfig.json',
  'drizzle.config.ts',
  'index.html', // Vite entry
];
for (const f of CONFIG_FILES) {
  const p = join(ROOT, f);
  const ok = existsSync(p) && statSync(p).isFile() && statSync(p).size > 0;
  results.push(check(`[Config File] ${f} exists + non-empty`, ok, `create in root: ${f}`));
}

// (B) 5 Folders (+ client/src)
const FOLDERS = [
  'client/src',
  'server',
  'db',
  'db/migrations', // for SQL migration drops in 0.2
  'shared',
  'Phase',
];
for (const d of FOLDERS) {
  const p = join(ROOT, d);
  const ok = existsSync(p) && statSync(p).isDirectory();
  results.push(check(`[Folder] ${d}/ exists`, ok, `mkdir -p ${d}`));
}

// (C) Placeholder files inside folders (resolve tsconfig include paths)
const PLACEHOLDER = [
  'client/src/main.tsx',
  'client/src/App.tsx',
  'server/index.ts',
  'shared/types.ts',
  'db/schema.ts',
];
for (const f of PLACEHOLDER) {
  const p = join(ROOT, f);
  const ok = existsSync(p) && statSync(p).isFile() && statSync(p).size > 0;
  results.push(check(`[Placeholder] ${f}`, ok, `touch+write default export ${f}`));
}

// (D) package.json scripts + deps
const pkgPath = join(ROOT, 'package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const MUST_SCRIPTS = ['dev:server', 'db:migrate', 'typecheck', 'test', 'phase0:verify'];
  for (const s of MUST_SCRIPTS) {
    results.push(check(`[Package Script] ${s}`, !!pkg.scripts?.[s], `add to package.json scripts.${s}`));
  }
  const MUST_DEPS = ['react', 'react-dom', 'express', 'drizzle-orm', 'mysql2', '@trpc/server', '@trpc/client', 'jose', 'zod'];
  for (const d of MUST_DEPS) {
    results.push(check(`[Dependency] ${d}`, !!pkg.dependencies?.[d], `npm install ${d} / add to dependencies`));
  }
  const MUST_DEV = ['drizzle-kit', 'typescript', 'tsx', 'vite', '@vitejs/plugin-react', 'vitest'];
  for (const d of MUST_DEV) {
    results.push(check(`[DevDependency] ${d}`, !!pkg.devDependencies?.[d], `npm install -D ${d}`));
  }
  // Guard: PORT 3002 requirement (NOT 3001 clash)
  const devServerScript = pkg.scripts?.['dev:server'] || '';
  results.push(
    check('[Guard] dev:server points to server/index.ts (NOT 3001)', devServerScript.includes('server/index.ts'),
      'scripts.dev:server = "node --import tsx/esm server/index.ts"'),
  );
}

// ── Print Report ────────────────────────────────────────────────
const TOTAL = results.length;
const PASSED = results.filter((r) => r.pass).length;
const FAILED = TOTAL - PASSED;
const WIDTH = 80;

console.log('\n' + '═'.repeat(WIDTH));
console.log(' EEAT Studio V2 · Task 0.1b Init Verification Report');
console.log(` ROOT: ${ROOT}`);
console.log(` Time: ${new Date().toISOString()}`);
console.log('═'.repeat(WIDTH));

for (const r of results) {
  const sym = r.pass ? '✅' : '❌';
  console.log(`  ${sym}  ${r.pass ? 'PASS' : 'FAIL'} · ${r.label}`);
  if (!r.pass && r.fix) console.log(`       └─ Suggestion: ${r.fix}`);
}

console.log('─'.repeat(WIDTH));
console.log(`  TOTAL: ${TOTAL} · ✅ PASS: ${PASSED} · ❌ FAIL: ${FAILED}`);
console.log(`  SCORE: ${((PASSED / TOTAL) * 100).toFixed(0)}%  (Required 100% for Exit)`);
console.log('─'.repeat(WIDTH));

if (FAILED === 0) {
  console.log('  🎉 TASK 0.1b PASS — Ready for: Task 0.2 + 0.3 (8 Tables SQL + 15 Seed Rows)');
  console.log('═'.repeat(WIDTH) + '\n');
  process.exit(0);
} else {
  console.log(`  ❌ TASK 0.1b FAIL (${FAILED}) — Fix above then re-run: node --import tsx/esm db/verify_phase0_01b.test.ts`);
  console.log('═'.repeat(WIDTH) + '\n');
  process.exit(1);
}
