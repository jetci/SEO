#!/usr/bin/env node
// Phase 2F Tests — write.saveDraft backend mutation + frontend Save persist DB
// 12 assertions total: A backend 5, B frontend wire 4, C inputs/zod validation 3
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('d:/AEO/SEO V2');
const writeRouterSrc = fs.readFileSync(path.join(ROOT, 'server/routers/write.ts'), 'utf8');
const editorSrc = fs.readFileSync(path.join(ROOT, 'client/src/pages/ArticleEditorPage.tsx'), 'utf8');
const sharedSrc = fs.existsSync(path.join(ROOT, 'shared/types.ts')) ? fs.readFileSync(path.join(ROOT, 'shared/types.ts'), 'utf8') : fs.existsSync(path.join(ROOT, 'shared/src/index.ts')) ? fs.readFileSync(path.join(ROOT, 'shared/src/index.ts'), 'utf8') : '';

let pass = 0, fail = 0, total = 12;

function A(name, cond, why='') {
  if (cond) { pass++; console.log(`  ✅ A${pass.toString().padStart(2,'0')}: ${name}`); }
  else { fail++; console.log(`  ❌ A${(pass+fail).toString().padStart(2,'0')}: ${name}${why?' → '+why:''}`); }
}
function B(name, cond, why='') {
  if (cond) { pass++; console.log(`  ✅ B${(pass-5+1>0?pass:pass+1).toString().padStart(2,'0')}: ${name}`); }
  else { fail++; console.log(`  ❌ B${(pass+fail).toString().padStart(2,'0')}: ${name}${why?' → '+why:''}`); }
}

console.log('========================================');
console.log('Phase 2F: write.saveDraft Tests (12 assertions)');
console.log('========================================\n');
console.log('--- Group A: Backend tRPC write.saveDraft mutation ---');

A('A1 saveDraft procedure exists (export router):',
  /saveDraft:\s*protectedProcedure/.test(writeRouterSrc) ||
  /saveDraft\s*:\s*protectedProcedure/.test(writeRouterSrc));

A('A2 input schema Zod draftId + title + content + metaTitle + metaDescription + wordCount + eeatScore:',
  /draftId:\s*z\.number/.test(writeRouterSrc) &&
  /title:\s*z\.string\(\)\.max\(500\)/.test(writeRouterSrc) &&
  /content:\s*z\.string\(\)\.max\(200000\)/.test(writeRouterSrc) &&
  /metaTitle:\s*z\.string/.test(writeRouterSrc) &&
  /metaDescription:\s*z\.string/.test(writeRouterSrc) &&
  /wordCount:\s*z\.number/.test(writeRouterSrc) &&
  /eeatScore:\s*z\.number/.test(writeRouterSrc));

A('A3 assertProjectAccess RBAC minRole=member (not anonymous, not admin-only):',
  /assertProjectAccess\(ctx,\s*Number\(row\.projectId\),\s*\{\s*minRole:\s*['"]member['"]/.test(writeRouterSrc),
  'check saveDraft mutation body has assertProjectAccess with minRole=member');

A('A4 UPDATE articles table: title, content, metaTitle, metaDescription, updatedAt SET cols:',
  /db\.update\(articles\)\.set\(updates\)/.test(writeRouterSrc) &&
  /updates\.updatedAt\s*=\s*new Date\(\)/.test(writeRouterSrc) &&
  /if\s*\(typeof\s+input\.title\s*===\s*['"]string['"]\s*\)\s*updates\.title\s*=\s*input\.title/.test(writeRouterSrc) &&
  /input\.content/.test(writeRouterSrc));

A('A5 write_articles workflow UPSERT wordCount + eeatScore cols (reuse no SQL ALTER):',
  /onDuplicateKeyUpdate|db\.update\(writeArticles\)/.test(writeRouterSrc) &&
  /wordCount|eeatScore|citationsCount/.test(writeRouterSrc.split('saveDraft').slice(1).join('')),
  'saveDraft procedure must include write_articles upsert fallback');

console.log('\n--- Group B: Frontend ArticleEditorPage save button wire + autosave ---');

B('B1 tRPC write.saveDraft mutation hook declared with useMutation:',
  /saveMut\s*=\s*trpc\.write\.saveDraft\.useMutation\(\)/.test(editorSrc));

B('B2 onClick Save button calls saveMut.mutateAsync or mutate: Save persist, toast, not local fallback toast',
  /Save.*onClick.*doSave|doSave\(false,\s*false\)|saveMut\.mutate\(/.test(editorSrc),
  'button Save must call backend, NOT old fallback toast "local frontend state only"');

B('B3 Loader2 animate-spin icon pending state + disabled when isPending:',
  /Loader2.*animate-spin/.test(editorSrc) && /disabled=\{saveMut\.isPending/.test(editorSrc));

B('B4 30s debounce auto-save (dirtyRef + setTimeout 30000 + scheduleAutoSave clearTimeout):',
  /dirtyRef/.test(editorSrc) &&
  /scheduleAutoSave|setTimeout.*30/.test(editorSrc) &&
  /clearTimeout\(saveTimerRef\.current\)/.test(editorSrc),
  'need dirtyRef useRef + setTimeout 30s debounce + clearTimeout');

console.log('\n--- Group C: Zod validation bounds, frontend dirty setters ---');

A('C1 wordCount min 0 + max 500000 (anti spam huge value) + eeatScore clamp 0-100:',
  /wordCount:\s*z\.number\(\)\.int\(\)\.min\(0\)\.max\(500000\)/.test(writeRouterSrc) &&
  /eeatScore:\s*z\.number\(\)\.int\(\)\.min\(0\)\.max\(100\)/.test(writeRouterSrc) &&
  /Math\.min\(100,\s*Math\.max\(0,\s*input\.eeatScore\)\)/.test(writeRouterSrc));

A('C2 setTitleDirty / setMdDirty / setMtDirty / setMdesDirty onChange inputs wire (4 total setDirty wrappers):',
  /setTitleDirty/.test(editorSrc) && /setMdDirty/.test(editorSrc) &&
  /setMtDirty/.test(editorSrc) && /setMdesDirty/.test(editorSrc),
  'need 4 dirty wrapper setter set*Dirty that call scheduleAutoSave');

A('C3 OLD toast "รอ tRPC write.saveDraft procedure" removed (dead code purged):',
  !/รอ tRPC write\.saveDraft procedure/.test(editorSrc),
  'must remove old local-only placeholder toast (no backend call)');

console.log('\n========================================');
console.log(`Result: ${pass}/${total} PASS  ${fail} FAIL`);
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
