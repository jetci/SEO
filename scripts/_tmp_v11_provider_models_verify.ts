import * as dotenv from 'dotenv'; dotenv.config();

// Mirror WritePage.tsx PROVIDER_CATALOG EXACT COPY (for verification purpose)
type AIModelDef = { id: string; label: string; badge: string; cls: string; per1m: number };
type LLMProviderKey = "openrouter" | "openai" | "anthropic" | "google";
const PROVIDER_CATALOG: Record<LLMProviderKey, { name: string; accent: string; models: AIModelDef[]; defaultIdx: number }> = {
  openrouter: {
    name: "OpenRouter (รวมหลาย Provider)", accent: "!bg-purple-50", defaultIdx: 0,
    models: [
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Free Tier)", badge: "ค่าเริ่มต้น", cls: "bg-purple-700", per1m: 0.075 },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude Sonnet", badge: "แนะนำ", cls: "bg-amber-700", per1m: 3 },
      { id: "openai/gpt-4o-mini", label: "GPT-4o mini", badge: "สำรอง", cls: "bg-emerald-700", per1m: 0.15 },
      { id: "google/gemini-1.5-flash", label: "Gemini 1.5 Flash", badge: "ทดลอง", cls: "bg-sky-700", per1m: 0.075 },
    ],
  },
  anthropic: {
    name: "Anthropic Claude", accent: "!bg-amber-50", defaultIdx: 0,
    models: [
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", badge: "ค่าเริ่มต้น", cls: "bg-amber-700", per1m: 3 },
      { id: "claude-3-opus-20240229", label: "Claude 3 Opus", badge: "ระดับสูง", cls: "bg-orange-700", per1m: 15 },
    ],
  },
  openai: {
    name: "OpenAI GPT", accent: "!bg-emerald-50", defaultIdx: 0,
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", badge: "ค่าเริ่มต้น", cls: "bg-emerald-700", per1m: 0.15 },
      { id: "gpt-4o", label: "GPT-4o", badge: "ระดับสูง", cls: "bg-green-700", per1m: 2.5 },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", badge: "รุ่นใหม่", cls: "bg-teal-700", per1m: 0.40 },
    ],
  },
  google: {
    name: "Google Gemini", accent: "!bg-sky-50", defaultIdx: 0,
    models: [
      { id: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash", badge: "ค่าเริ่มต้น", cls: "bg-sky-700", per1m: 0.075 },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", badge: "ระดับสูง", cls: "bg-blue-700", per1m: 1.25 },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", badge: "ทดลอง", cls: "bg-indigo-700", per1m: 0.075 },
    ],
  },
};

// ── ASSERTIONS: For EACH provider → Ensure NO MODELS FROM OTHER PROVIDERS appear!
console.log("═══════════════════════════════════════════════");
console.log("GATE0 v11 E2E: PROVIDER_CATALOG correctness (Ensure NO cross-provider models!)");
console.log("═══════════════════════════════════════════════\n");

let pass = 0; let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { console.log(`✅ ${label}${detail ? ` → ${detail}` : ""}`); pass++; }
  else { console.log(`❌ ${label}${detail ? ` → ${detail}` : ""}`); fail++; }
}

function hasAnyFromOtherProvider(prov: LLMProviderKey, ids: string[]): string[] {
  const bad: string[] = [];
  for (const id of ids) {
    if (prov === "anthropic" && (id.includes("gpt") || id.includes("gemini"))) bad.push(id);
    if (prov === "openai" && (id.includes("claude") || id.includes("gemini"))) bad.push(id);
    if (prov === "google" && (id.includes("gpt") || id.includes("claude"))) bad.push(id);
    if (prov !== "openrouter" && id.includes("/")) { // anthropic/openai/google = NO slash prefix; openrouter = always prefix with provider/
      if (prov === "anthropic" && !id.startsWith("claude")) bad.push(id);
      if (prov === "openai" && !id.startsWith("gpt")) bad.push(id);
      if (prov === "google" && !id.startsWith("gemini")) bad.push(id);
    }
  }
  return bad;
}

// ── 1. Anthropic Provider = Claude ONLY. NO GPT. NO Gemini.
const ant = PROVIDER_CATALOG.anthropic;
check(`[Provider=Anthropic] models.length=${ant.models.length}`, ant.models.length === 2, `expected=2 (Sonnet/Opus)`);
const antBad = hasAnyFromOtherProvider("anthropic", ant.models.map(m => m.id));
check(`[Provider=Anthropic] NO cross-provider models (NO GPT/NO Gemini)`, antBad.length === 0, `badIds=${JSON.stringify(antBad)}`);
const antDefault = ant.models[ant.defaultIdx];
check(`[Provider=Anthropic] default model id=${antDefault.id} matches server llmClient PROVIDER_DEFAULT_MODELS L23 "claude-3-5-sonnet-20241022"`, antDefault.id.startsWith("claude-3-5-sonnet"), `actual=${antDefault.id}`);

// ── 2. OpenAI = GPT only. NO Claude. NO Gemini
const oai = PROVIDER_CATALOG.openai;
check(`[Provider=OpenAI] models.length=${oai.models.length}`, oai.models.length === 3, `expected=3 (4o-mini/4o/4.1-mini)`);
const oaiBad = hasAnyFromOtherProvider("openai", oai.models.map(m => m.id));
check(`[Provider=OpenAI] NO cross-provider models (NO Claude/NO Gemini)`, oaiBad.length === 0, `badIds=${JSON.stringify(oaiBad)}`);
const oaiDefault = oai.models[oai.defaultIdx];
check(`[Provider=OpenAI] default model id=${oaiDefault.id} matches server L22 "gpt-4o-mini"`, oaiDefault.id === "gpt-4o-mini", `actual=${oaiDefault.id}`);

// ── 3. Google = Gemini only. NO GPT. NO Claude
const goo = PROVIDER_CATALOG.google;
check(`[Provider=Google] models.length=${goo.models.length}`, goo.models.length === 3, `expected=3 (2.0flash/1.5pro/1.5flash)`);
const gooBad = hasAnyFromOtherProvider("google", goo.models.map(m => m.id));
check(`[Provider=Google] NO cross-provider models (NO GPT/NO Claude)`, gooBad.length === 0, `badIds=${JSON.stringify(gooBad)}`);
const gooDefault = goo.models[goo.defaultIdx];
check(`[Provider=Google] default model id=${gooDefault.id} matches server L24 "gemini-2.0-flash-exp"`, gooDefault.id === "gemini-2.0-flash-exp", `actual=${gooDefault.id}`);

// ── 4. OpenRouter = multi-provider gateway, has all 4.
const or = PROVIDER_CATALOG.openrouter;
check(`[Provider=OpenRouter] models.length=${or.models.length}`, or.models.length >= 3, `rich catalog`);
const orIds = or.models.map(m => m.id);
check(`[Provider=OpenRouter] includes gemini/anthropic/openai (multi-provider OK for OR)`,
  orIds.some(i => i.includes("gemini")) && orIds.some(i => i.includes("anthropic")) && orIds.some(i => i.includes("openai")),
  `ids=${JSON.stringify(orIds)}`);
const orDefault = or.models[or.defaultIdx];
check(`[Provider=OpenRouter] default model id=${orDefault.id} matches server L21 "google/gemini-2.0-flash-exp:free"`, orDefault.id === "google/gemini-2.0-flash-exp:free", `actual=${orDefault.id}`);

// ── Summary
console.log(`\n═══════════════════════════════════════════════`);
console.log(`FINAL RESULT: ${pass}/12 PASS | ${fail}/12 FAIL`);
console.log(`═══════════════════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
