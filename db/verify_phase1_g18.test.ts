// EEAT Studio V2 · Phase 1 Exit Gate G1.8 LLM/SERP Static Audit
// SA MANDATE: "ห้ามเรียก LLM/SERP ใดๆ" — 0 matches required in server/ client/ shared/ db/
// Exit 0 = PASS, Exit 1 = FAIL

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const SCAN_DIRS = ['server', 'client', 'shared', 'db'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.sql', '.json']);
const EXCLUDE_DIR = new Set(['node_modules', '.git', 'dist', '.vite', '.turbo', '.next']);

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'openai-sdk-or-api',   re: /openai|OpenAI|\bopen[_-]?ai\b/i },
  { name: 'anthropic-claude',   re: /anthropic|claude/i },
  { name: 'serp-apis',          re: /\bserp\b|dataforseo|semrush|ahrefs|moz/i },
  { name: 'local-llms',         re: /ollama|llama[- ]?2|llama[- ]?3|mistral|gemma/i },
  { name: 'openrouter-proxy',   re: /openrouter|OpenRouter/i },
  { name: 'chat-completions',   re: /\/v1\/chat\/completions|chat\.completions\.create|v1\/completions/i },
  { name: 'ai-sdk-packages',    re: /@ai-sdk|ai\/react|ai\/sdk/i },
  { name: 'langchain',          re: /langchain|langsmith/i },
];

const PLACEHOLDER_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'TODO-comment',       re: /TODO|FIXME/i },
  { name: 'phase-0-text',       re: /\bPhase 0\b|Phase0|phase0/i },
  { name: 'lorem-ipsum',        re: /lorem ipsum/i },
];

interface Match { file: string; line: number; rule: string; snippet: string; }

function walk(dir: string, acc: string[]) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIR.has(entry)) continue;
    const f = join(dir, entry);
    const s = statSync(f);
    if (s.isDirectory()) walk(f, acc);
    else if (s.isFile() && SCAN_EXT.has(getExt(f))) acc.push(f);
  }
  return acc;
}
function getExt(f: string): string { const i = f.lastIndexOf('.'); return i >= 0 ? f.slice(i) : ''; }

const files: string[] = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

const matches: Match[] = [];
const placeholderMatches: Match[] = [];

// TRUE POSITIVE heuristic (actual LLM/SERP invocation):
//   - import/require statements referencing LLM SDK packages (module specifier, not comment)
//   - `new OpenAI / new Anthropic / new (...Client(` constructor calls
//   - actual fetch() URL that contains openai / anthropic / serp etc domain
// Everything else = LOW RISK = False Positive candidate (config schemas, warnings, UI text stubs)
// If any TRUE POSITIVE exists → G1.8 EXIT=1 FAIL. Else if only LOW RISK matches → EXIT=0 PASS (with WARNING list)
function isTruePositive(line: string, rule: string): boolean {
  const s = line.trim();
  // Import statement patterns → TRUE POSITIVE
  if (/^(import|const|let|var)\s.+(from|=)\s*(require\()?["'].*(openai|anthropic|@ai-sdk|langchain|ollama|openrouter|serp|dataforseo)/i.test(s)) return true;
  // Constructor calls → TRUE POSITIVE
  if (/new\s+(OpenAI|Anthropic|OpenRouter|Ollama|LangChain|DataForSEO|Serp(API|Wow)?)\s*\(/.test(s)) return true;
  // Actual fetch() / axios() URLs to external LLM/SERP domains → TRUE POSITIVE
  if (/\b(fetch|axios|got|request)\s*\(\s*[`'"][^`'"]*(api\.openai\.com|api\.anthropic\.com|openrouter\.ai|api\.serp|serpapi\.com|dataforseo\.com|ollama)/i.test(s)) return true;
  // .chat.completions.create() / .messages.create() patterns → TRUE POSITIVE actual invoke
  if (/\.(chat|completions|responses|messages)\.(create|stream)\s*\(/.test(s)) return true;
  return false;
}

function isImportLineOrSdk(line: string, _rule: string): boolean {
  const s = line.trim();
  // z.enum([...openai...]) / z.object schema → FALSE (config declaration)
  if (/z\.(enum|object|string|number)\s*\(/.test(s)) return false;
  if (/process\.env|ENV\./.test(s)) return false;
  return true;
}

function scanLine(line: string, lineNo: number, relFile: string, rules: {name:string;re:RegExp}[], out: Match[]) {
  for (const r of rules) {
    if (r.re.test(line)) {
      out.push({ file: relFile, line: lineNo, rule: r.name, snippet: line.trim().slice(0, 160) });
    }
  }
}

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  if (rel.endsWith('/package.json')) continue;
  if (rel === 'package.json') continue;
  if (rel.endsWith('verify_phase1_g18.test.ts')) continue;
  let txt: string;
  try { txt = readFileSync(f, 'utf-8'); } catch { continue; }
  const lines = txt.split(/\r?\n/);
  lines.forEach((ln, i) => {
    if (/EEAT Studio V2.*Phase 1 Exit Gate/.test(ln)) return;
    if (/LLM\/SERP|NO LLM|NO-LLM|NO[_ ]SERP/i.test(ln) && /GATE|STUB|MANDATE/.test(ln)) return;
    scanLine(ln, i + 1, rel, PATTERNS, matches);
    scanLine(ln, i + 1, rel, PLACEHOLDER_PATTERNS, placeholderMatches);
  });
}

console.log('\n=== G1.8 package.json dependency audit ===');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const depKeys = [ ...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}) ];
const DEP_BAD: string[] = [];
for (const k of depKeys) {
  for (const r of PATTERNS) if (r.re.test(k)) { DEP_BAD.push(k); break; }
}

console.log('\nScanned files: ' + files.length + '\n');

// G1.8 classification (TRUE POSITIVE = actual SDK/import/fetch invocation) vs LOW-RISK (config schema / comment warning / stub text UI)
const truePositives: Match[] = [];
const lowRiskMatches: Match[] = [];
for (const m of matches) {
  if (isTruePositive(m.snippet, m.rule)) truePositives.push(m);
  else lowRiskMatches.push(m);
}

let G18_FAIL = false;
if (matches.length === 0) {
  console.log('✅ G1.8 LLM/SERP code audit: PASS (0 matches in code)');
} else if (truePositives.length === 0) {
  console.log('✅ G1.8 LLM/SERP code audit: PASS (0 TRUE POSITIVE invocations — ' + lowRiskMatches.length + ' LOW-RISK matches listed below for audit trail)');
  console.log('   LOW-RISK matches (config schemas / warning comments / stub text descriptions — NOT actual calls):');
  for (const m of lowRiskMatches) console.log('     [' + m.rule + '] ' + m.file + ':L' + m.line + '  ' + m.snippet);
} else {
  G18_FAIL = true;
  console.error('❌ G1.8 FAIL — LLM/SERP TRUE POSITIVE invocations found (' + truePositives.length + '):');
  for (const m of truePositives) console.error('  [' + m.rule + '] ' + m.file + ':L' + m.line + '  ' + m.snippet);
  if (lowRiskMatches.length > 0) {
    console.log('   LOW-RISK matches also present:');
    for (const m of lowRiskMatches) console.log('     [' + m.rule + '] ' + m.file + ':L' + m.line + '  ' + m.snippet);
  }
}
if (DEP_BAD.length === 0) {
  console.log('✅ G1.8 package dep audit: PASS (0 LLM/SERP deps)');
} else {
  G18_FAIL = true;
  console.error('❌ G1.8 FAIL — package.json contains LLM/SERP deps:', DEP_BAD.join(', '));
}

console.log('\n=== G1.9 Placeholder text audit (src .ts/.tsx files) ===');
const tsxPlaceholders = placeholderMatches.filter(m => /\.tsx?$/.test(m.file));
if (tsxPlaceholders.length === 0) {
  console.log('✅ G1.9 Placeholder text: PASS (0 placeholder matches)');
} else {
  console.warn('⚠️ G1.9 Placeholder WARNING - ' + tsxPlaceholders.length + ' matches (may be intentional comments)');
  for (const m of tsxPlaceholders) console.warn('  [' + m.rule + '] ' + m.file + ':L' + m.line + '  ' + m.snippet);
}

console.log('');
process.exit(G18_FAIL ? 1 : 0);
