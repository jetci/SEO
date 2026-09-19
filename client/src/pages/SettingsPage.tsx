import { useState, useEffect } from "react";
import MainDashboardShell from "@/layouts/MainDashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Key, Server, ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  Globe2, Languages, Loader2, DollarSign, RefreshCw, Edit3
} from "lucide-react";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const LLM_PROVIDERS = [
  { key: "openrouter", label: "OpenRouter (แนะนำ)", hint: "รองรับทุกโมเดล · sk-or-v1-..." },
  { key: "openai", label: "OpenAI GPT", hint: "GPT-4o / GPT-4o mini · sk-..." },
  { key: "anthropic", label: "Anthropic Claude", hint: "Claude 3.5 Sonnet · sk-ant-..." },
  { key: "google", label: "Google Gemini", hint: "Gemini 1.5 Pro · AIza..." },
];

const SERP_PROVIDERS = [
  { key: "dataforseo", label: "DataForSEO Labs (แนะนำ)", hint: "Basic Auth base64 login:password" },
  { key: "serper", label: "Serper.dev", hint: "X-API-KEY · สำหรับ organic search" },
];

const COUNTRIES = [
  { code: "TH", name: "ไทย (Thailand)" },
  { code: "US", name: "สหรัฐอเมริกา (USA)" },
  { code: "UK", name: "อังกฤษ (UK)" },
  { code: "SG", name: "สิงคโปร์ (Singapore)" },
  { code: "JP", name: "ญี่ปุ่น (Japan)" },
  { code: "VN", name: "เวียดนาม (Vietnam)" },
];

const LANGS = [
  { code: "th", name: "ไทย (Thai)" },
  { code: "en", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "ja", name: "日本語 (Japanese)" },
  { code: "vi", name: "Tiếng Việt (Vietnam)" },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const now = new Date();

  const settings = trpc.settings.get.useQuery(undefined, {
    staleTime: 1000 * 60,
    onSuccess: (data) => {
      if (data?.settings) {
        const s = data.settings as any;
        setForm(f => ({
          ...f,
          llmProvider: s.llmProvider || f.llmProvider,
          serpProvider: s.serpProvider || f.serpProvider,
          countryCode: s.countryCode || f.countryCode,
          langCode: s.langCode || f.langCode,
          billingLimitUsd: (typeof s.billingLimitUsd === 'number' && Number.isFinite(s.billingLimitUsd)) ? s.billingLimitUsd : "",
        }));
      }
    },
    onError: (err: any) => {
      // SET-07: Writer → FORBIDDEN on settings.get. Show friendly Thai message.
      if (String(err?.message || '').includes('FORBIDDEN') || err?.data?.code === 'FORBIDDEN') {
        toast.error('สิทธิ์ไม่เพียงพอ: บัญชีของคุณเป็น Role: Writer (Member) → ไม่อนุญาตให้อ่านหรือแก้ไขค่า Provider Settings ของทีม — ต้องมี Role: Admin หรือ Owner เท่านั้น');
      }
    }
  });

  // SET-02: Use TEAM-SPECIFIC permission flag from server (settings.data.canEditSettings)
  // NOT global user.permission — prevents case: user is admin team A, member team B → Save button shown but FORBIDDEN on server.
  const canEditSettings = !!settings?.data?.canEditSettings;
  const canSave = canEditSettings;

  // SET-03: teamId 0 GUARD. NEVER fall back to 0 silently. Block save + toast error before API call.
  const rawTeamId = Number(settings?.data?.teamId ?? (user as any)?.teamId ?? (user as any)?.defaultTeamId ?? 0);
  // Hooks called UNCONDITIONALLY (React hook rule compliance)
  useEffect(() => {
    if (!settings.isLoading && rawTeamId === 0) {
      toast.error('ไม่สามารถระบุ Team ID ที่ใช้งานได้ (defaultTeamId=0) — กรุณา Login อีกครั้งเพื่อตั้งค่า Session ใหม่');
    }
  }, [settings.isLoading, rawTeamId]);
  const defaultTeamId = rawTeamId > 0 ? rawTeamId : 0;

  const billing = trpc.settings.getBillingWindow.useQuery(
    { month: now.getMonth() + 1, year: now.getFullYear() },
    { enabled: canEditSettings, staleTime: 1000 * 60 * 5 }
  );

  // PHASE 2K+ BUGFIX: saveMut/resetMut 5th safety net onError settings.save UNAUTHORIZED
  // → call markAuthCacheInvalid (cache clear ONLY, NO redirect! — useAuth SINGLE DECIDER for redirect)
  //    Previously called markAuthLoggedOut which hard-redirected to /login falsely during race 401 windows
  const saveMut = trpc.settings.save.useMutation({
    onError: (err: any) => {
      const code = String(err?.data?.code ?? err?.code ?? "");
      if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
        try {
          if (typeof (globalThis as any).__markAuthCacheInvalid === "function") {
            (globalThis as any).__markAuthCacheInvalid(
              code === "UNAUTHORIZED"
                ? "Session ตรวจสอบอีกครั้ง (settings.save)"
                : "บัญชีไม่มีสิทธิ์บันทึกตั้งค่า (ต้องเป็น Admin/Owner)"
            );
          }
        } catch(e) {}
      }
    },
  });
  const resetMut = trpc.settings.resetKey.useMutation({
    onError: (err: any) => {
      const code = String(err?.data?.code ?? err?.code ?? "");
      if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
        try {
          if (typeof (globalThis as any).__markAuthCacheInvalid === "function") {
            (globalThis as any).__markAuthCacheInvalid(
              code === "UNAUTHORIZED"
                ? "Session ตรวจสอบอีกครั้ง (settings.resetKey)"
                : "บัญชีไม่มีสิทธิ์ลบ Keys"
            );
          }
        } catch(e) {}
      }
    },
  });

  const [form, setForm] = useState({
    llmProvider: "openrouter",
    llmApiKey: "",
    serpProvider: "serper",
    serpApiKey: "",
    countryCode: "TH",
    langCode: "th",
    validatePing: true,
    billingLimitUsd: "" as number | "",
  });

  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [editingLlmKey, setEditingLlmKey] = useState(false);
  const [editingSerpKey, setEditingSerpKey] = useState(false);
  const [pingLoading, setPingLoading] = useState<{llm?: boolean; serp?: boolean}>({});
  const [pingRes, setPingRes] = useState<any>({ llm: null, serp: null });
  const utils = trpc.useContext();

  useEffect(() => {
    if (!settings.data?.settings) return;
    const s = settings.data.settings as any;
    setForm(f => ({
      ...f,
      llmProvider: s.llmProvider || f.llmProvider,
      serpProvider: s.serpProvider || f.serpProvider,
      countryCode: s.countryCode || f.countryCode,
      langCode: s.langCode || f.langCode,
      billingLimitUsd: (typeof s.billingLimitUsd === 'number' && Number.isFinite(s.billingLimitUsd)) ? s.billingLimitUsd : "",
    }));
    setEditingLlmKey(false);
    setEditingSerpKey(false);
    setPingRes({ llm: null, serp: null });
  }, [settings.data?.settings]);

  async function runPing(kind: 'llm'|'serp'|'both') {
    if (!canSave) return;
    setPingLoading(l => ({ ...l, [kind]: true }));
    try {
      const teamId = (defaultTeamId && defaultTeamId > 0) ? defaultTeamId : undefined;
      const r = await utils.settings.pingCurrent.fetch({ ...(teamId ? { teamId } : {}), kind });
      setPingRes((prev: any) => ({
        llm: (r as any).llm ?? prev.llm,
        serp: (r as any).serp ?? prev.serp,
      }));
      const names = { llm: 'LLM', serp: 'SERP' } as const;
      if (kind === 'both') {
        if ((r as any).llm?.ok && (r as any).serp?.ok) toast.success(`✅ ทดสอบ ${names.llm} + ${names.serp} ผ่านทั้งคู่`);
        else toast.warning(`ทดสอบ: LLM ${(r as any).llm?.ok ? '✅' : '❌'} · SERP ${(r as any).serp?.ok ? '✅' : '❌'}` +
          `\n${(r as any).llm?.msg || ''}\n${(r as any).serp?.msg || ''}`);
      } else {
        const k = kind === 'llm' ? (r as any).llm : (r as any).serp;
        if (k?.ok) toast.success(`✅ ${names[kind]} Ping OK · ${k.latencyMs}ms`, { description: k.msg });
        else toast.error(`❌ ${names[kind]} ไม่ผ่าน: ${k?.msg || 'Unknown'}`);
      }
    } catch (e: any) {
      toast.error(`ทดสอบล้มเหลว: ${String(e?.message ?? e).slice(0, 120)}`);
    } finally {
      setPingLoading(l => ({ ...l, [kind]: false }));
    }
  }

  const billingUsd = Number((billing.data as any)?.grand_total_usd ?? 0).toFixed(2);
  const billingCalls = Number((billing.data as any)?.total_calls ?? 0);
  const providers = (() => {
    const d = billing.data as any;
    if (!d) return [];
    const arr: any[] = [];
    if (Number(d.llm_calls_count ?? 0) > 0 || Number(d.llm_usd_total ?? 0) > 0) {
      arr.push({
        provider: "LLM · " + (settings.data?.settings?.llmProvider || "OpenRouter"),
        calls: Number(d.llm_calls_count ?? 0),
        tokens: Number(d.llm_tokens_in ?? 0) + Number(d.llm_tokens_out ?? 0),
        usd: Number(d.llm_usd_total ?? 0),
      });
    }
    if (Number(d.serp_calls_count ?? 0) > 0 || Number(d.serp_usd_total ?? 0) > 0) {
      arr.push({
        provider: "SERP · " + (settings.data?.settings?.serpProvider || "Serper"),
        calls: Number(d.serp_calls_count ?? 0),
        rows: Number(d.serp_rows_returned ?? 0),
        usd: Number(d.serp_usd_total ?? 0),
      });
    }
    return arr;
  })();

  async function handleSave() {
    if (!canSave) { toast.error("ต้องเป็น Admin / Owner เท่านั้นที่บันทึกได้"); return; }
    try {
      const payload: any = {
        llmProvider: form.llmProvider as any,
        llmApiKey: form.llmApiKey,
        serpProvider: form.serpProvider as any,
        serpApiKey: form.serpApiKey || undefined,
        countryCode: form.countryCode,
        langCode: form.langCode,
        validatePing: !!form.validatePing,
        billingLimitUsd: (typeof form.billingLimitUsd === 'number' || (typeof form.billingLimitUsd === 'string' && form.billingLimitUsd.trim().length)) ? Number(form.billingLimitUsd) || null : null,
      };
      if (defaultTeamId && defaultTeamId > 0) payload.teamId = defaultTeamId;
      const res = await saveMut.mutateAsync(payload);
      if ((res as any)?.ok === true && (res as any)?.saved === true) {
        const up = (res as any).keysUpdated || { llmApiKey: false, serpApiKey: false };
        const keys = (res as any).keys || {};
        const parts: string[] = [];
        if (up.llmApiKey) parts.push("🔐 อัปเดต LLM Key ใหม่"); else parts.push("🔒 LLM Key ใช้ต้นฉบับ");
        if (up.serpApiKey) parts.push("🗝️ อัปเดต SERP Key ใหม่"); else parts.push("🔒 SERP Key ใช้ต้นฉบับ");
        parts.push(`🌎 Default Country: ${keys.countryCode || form.countryCode}`);
        parts.push(`🔤 Default Language: ${keys.langCode || form.langCode}`);
        if (keys.billingLimitUsd) parts.push(`💰 Billing Limit: $${Number(keys.billingLimitUsd).toFixed(2)}`); else if (keys.billingLimitUsd === null) parts.push(`💰 Billing Limit: ไม่จำกัด`);
        toast.success("บันทึกการตั้งค่าเรียบร้อย", {
          description: parts.join(" · "),
          duration: 3800,
        });
      } else {
        toast.warning("บันทึกแล้ว แต่สถานะไม่ชัดเจน", { description: "ลอง refetch ดูข้อมูลล่าสุด" });
      }
      setForm(f => ({ ...f, llmApiKey: "", serpApiKey: "" }));
      setEditingLlmKey(false);
      setEditingSerpKey(false);
      setPingRes({ llm: null, serp: null });
      await settings.refetch();
      await billing.refetch();
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      if (msg.includes("[LLM_AUTH_INVALID]")) {
        toast.error(`LLM Key ไม่ถูกต้อง: ${msg.replace("[LLM_AUTH_INVALID] ", "")}`);
      } else if (msg.includes("[SERP_AUTH_INVALID]")) {
        toast.error(`SERP Key ไม่ถูกต้อง: ${msg.replace("[SERP_AUTH_INVALID] ", "")}`);
      } else if (msg.includes("[LLM_API_KEY_REQUIRED]")) {
        toast.error(`กรุณาใส่ LLM API Key อย่างน้อยครั้งแรก: ${msg.replace("[LLM_API_KEY_REQUIRED] ", "")}`);
      } else {
        toast.error(`บันทึกล้มเหลว: ${msg.slice(0, 120)}`);
      }
    }
  }

  async function handleResetKeys() {
    if (!canSave) return;
    if (!window.confirm("ต้องการลบ LLM_API_KEY + SERP_API_KEY ที่บันทึกไว้หรือไม่?")) return;
    try {
      const teamId = (defaultTeamId && defaultTeamId > 0) ? defaultTeamId : undefined;
      await Promise.all([
        resetMut.mutateAsync({ keyType: 'llm', ...(teamId ? { teamId } : {}) } as any),
        resetMut.mutateAsync({ keyType: 'serp', ...(teamId ? { teamId } : {}) } as any),
      ]);
      setForm(f => ({ ...f, llmApiKey: "", serpApiKey: "" }));
      toast.success("Reset keys สำเร็จ");
      await settings.refetch();
    } catch (e: any) {
      toast.error(`Reset ล้มเหลว: ${e?.message ?? String(e)}`);
    }
  }

  return (
    <MainDashboardShell
      headerTitle="ตั้งค่าระบบ"
      headerSubtitle="LLM / SERP Providers · ข้อมูลจะถูกเข้ารหัส AES-256-GCM ก่อนบันทึกในฐานข้อมูล (At-Rest Encryption)"
      headerActions={
        <>
          {canEditSettings && (
            <Badge
              variant="outline"
              className="!h-9 !px-3 !rounded-lg !text-[12px] !bg-emerald-50 !text-emerald-800 !border-emerald-200 inline-flex items-center gap-2"
            >
              {billing.isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <DollarSign className="size-3.5" />}
              <span className="font-semibold">Usage เดือนนี้</span>
              <span className="font-bold font-mono">${billingUsd}</span>
              <span className="text-emerald-600/80 text-[11px]">{billingCalls} calls</span>
            </Badge>
          )}
        </>
      }
    >
      {!canEditSettings && (
        <Card className="!rounded-2xl !border !border-dashed !border-rose-300 !bg-rose-50/40">
          <CardContent className="p-6 flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-white border border-rose-200 grid place-items-center text-rose-700 shrink-0">
              <ShieldCheck className="size-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-[15px] text-stone-900 mb-1">สิทธิ์ไม่เพียงพอ</h3>
              <p className="text-[13px] text-stone-600 leading-relaxed">
                หน้าตั้งค่าระบบนี้ต้องการสิทธิ์ <strong>Owner</strong> หรือ <strong>Admin</strong> เท่านั้น สมาชิกทั่วไปจะไม่สามารถแก้ไข API Keys หรือดูข้อมูล Billing ได้
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {canEditSettings && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm">
              <CardHeader className="!p-5 !pb-0 flex-row items-center gap-3 !space-y-0">
                <Server className="size-5 text-amber-700" />
                <CardTitle className="text-[16px] font-semibold text-stone-900 flex-1">Providers · LLM + SERP</CardTitle>
                <Badge variant="outline" className="!rounded-full !text-[10.5px] !bg-amber-50 !text-amber-800 !border-amber-200">
                  <Key className="size-3 mr-1" /> AES-256-GCM encrypted
                </Badge>
              </CardHeader>
              <CardContent className="!p-5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-h-[28px] flex-wrap">
                      <Label className="!text-[12px] uppercase tracking-wider text-stone-500 !mb-0">LLM Provider</Label>
                    </div>
                    <select
                      value={form.llmProvider}
                      onChange={e => setForm(f => ({ ...f, llmProvider: e.target.value }))}
                      disabled={!canSave || saveMut.isPending}
                      className="h-10 w-full rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13.5px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60"
                    >
                      {LLM_PROVIDERS.map(p => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                    <p className="text-[11.5px] text-stone-500 leading-relaxed min-h-[16px]">{LLM_PROVIDERS.find(p => p.key === form.llmProvider)?.hint}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-h-[28px] flex-wrap">
                      <Label className="!text-[12px] uppercase tracking-wider text-stone-500 !mb-0">LLM API Key</Label>
                      {(settings.data?.settings as any)?.hasLlmApiKey ? (
                        <Badge variant="outline" className="!rounded-full !text-[11px] !h-5 !px-2 !bg-emerald-50 !text-emerald-800 !border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="size-3" /> บันทึกแล้ว
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="!rounded-full !text-[11px] !h-5 !px-2 !bg-rose-50 !text-rose-800 !border-rose-200 inline-flex items-center gap-1">
                          <AlertTriangle className="size-3" /> ว่าง (ต้องใส่)
                        </Badge>
                      )}
                      {pingRes.llm && (
                        <Badge variant="outline" className={`!rounded-full !text-[11px] !h-5 !px-2 inline-flex items-center gap-1 ${pingRes.llm.ok ? '!bg-emerald-50 !text-emerald-800 !border-emerald-200' : '!bg-rose-50 !text-rose-800 !border-rose-200'}`}>
                          {pingRes.llm.ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                          Ping {pingRes.llm.ok ? `${pingRes.llm.latencyMs}ms` : 'ไม่ผ่าน'}
                        </Badge>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => runPing('llm')}
                          disabled={!canSave || saveMut.isPending || !!pingLoading.llm}
                          className="!h-7 !px-2.5 !rounded-lg !text-[11px]"
                        >
                          {pingLoading.llm ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RefreshCw className="size-3 mr-1" />}
                          ทดสอบ
                        </Button>
                        {!editingLlmKey && (settings.data?.settings as any)?.hasLlmApiKey && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingLlmKey(true)}
                            disabled={!canSave || saveMut.isPending}
                            className="!h-7 !px-2.5 !rounded-lg !text-[11px]"
                          >
                            <Edit3 className="size-3 mr-1" />
                            เปลี่ยน
                          </Button>
                        )}
                      </div>
                    </div>
                    {(!editingLlmKey && (settings.data?.settings as any)?.hasLlmApiKey) ? (
                      <div className="h-10 rounded-lg border border-stone-200 bg-stone-50/60 px-3 flex items-center gap-2 text-[12px] font-mono text-stone-500">
                        <Key className="size-3.5 shrink-0" />
                        <span className="truncate">{(settings.data?.settings as any)?.llmApiKeyMasked}</span>
                        <span className="ml-auto text-stone-400 text-[11px] whitespace-nowrap shrink-0">กด "เปลี่ยน" เพื่อแก้ไข</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          type={showKey.llm ? "text" : "password"}
                          value={form.llmApiKey}
                          onChange={e => setForm(f => ({ ...f, llmApiKey: e.target.value }))}
                          placeholder={(settings.data?.settings as any)?.hasLlmApiKey ? "เว้นว่าง = ใช้ Key เดิม · พิมพ์ใหม่เพื่อเปลี่ยน" : "ใส่ API Key (จะถูกเข้ารหัสเมื่อบันทึก)"}
                          disabled={!canSave || saveMut.isPending}
                          className="!h-10 pr-12 font-mono text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(s => ({ ...s, llm: !s.llm }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-500 hover:text-stone-800"
                          tabIndex={-1}
                        >{showKey.llm ? "ซ่อน" : "แสดง"}</button>
                      </div>
                    )}
                    <p className="text-[11.5px] text-stone-500 leading-relaxed min-h-[16px]">&nbsp;</p>
                  </div>
                </div>

                <div className="h-px w-full bg-stone-100" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-h-[28px] flex-wrap">
                      <Label className="!text-[12px] uppercase tracking-wider text-stone-500 !mb-0">SERP Provider</Label>
                    </div>
                    <select
                      value={form.serpProvider}
                      onChange={e => setForm(f => ({ ...f, serpProvider: e.target.value }))}
                      disabled={!canSave || saveMut.isPending}
                      className="h-10 w-full rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13.5px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60"
                    >
                      {SERP_PROVIDERS.map(p => (
                        <option key={p.key} value={p.key}>{p.label}</option>
                      ))}
                    </select>
                    <p className="text-[11.5px] text-stone-500 leading-relaxed min-h-[16px]">{SERP_PROVIDERS.find(p => p.key === form.serpProvider)?.hint}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-h-[28px] flex-wrap">
                      <Label className="!text-[12px] uppercase tracking-wider text-stone-500 !mb-0">SERP API Key</Label>
                      {(settings.data?.settings as any)?.hasSerpApiKey ? (
                        <Badge variant="outline" className="!rounded-full !text-[11px] !h-5 !px-2 !bg-emerald-50 !text-emerald-800 !border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="size-3" /> บันทึกแล้ว
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="!rounded-full !text-[11px] !h-5 !px-2 !bg-rose-50 !text-rose-800 !border-rose-200 inline-flex items-center gap-1">
                          <AlertTriangle className="size-3" /> ว่าง (ต้องใส่)
                        </Badge>
                      )}
                      {pingRes.serp && (
                        <Badge variant="outline" className={`!rounded-full !text-[11px] !h-5 !px-2 inline-flex items-center gap-1 ${pingRes.serp.ok ? '!bg-emerald-50 !text-emerald-800 !border-emerald-200' : '!bg-rose-50 !text-rose-800 !border-rose-200'}`}>
                          {pingRes.serp.ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                          Ping {pingRes.serp.ok ? `${pingRes.serp.latencyMs}ms` : 'ไม่ผ่าน'}
                        </Badge>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => runPing('serp')}
                          disabled={!canSave || saveMut.isPending || !!pingLoading.serp}
                          className="!h-7 !px-2.5 !rounded-lg !text-[11px]"
                        >
                          {pingLoading.serp ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RefreshCw className="size-3 mr-1" />}
                          ทดสอบ
                        </Button>
                        {!editingSerpKey && (settings.data?.settings as any)?.hasSerpApiKey && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingSerpKey(true)}
                            disabled={!canSave || saveMut.isPending}
                            className="!h-7 !px-2.5 !rounded-lg !text-[11px]"
                          >
                            <Edit3 className="size-3 mr-1" />
                            เปลี่ยน
                          </Button>
                        )}
                      </div>
                    </div>
                    {(!editingSerpKey && (settings.data?.settings as any)?.hasSerpApiKey) ? (
                      <div className="h-10 rounded-lg border border-stone-200 bg-stone-50/60 px-3 flex items-center gap-2 text-[12px] font-mono text-stone-500">
                        <Key className="size-3.5 shrink-0" />
                        <span className="truncate">{(settings.data?.settings as any)?.serpApiKeyMasked}</span>
                        <span className="ml-auto text-stone-400 text-[11px] whitespace-nowrap shrink-0">กด "เปลี่ยน" เพื่อแก้ไข</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input
                          type={showKey.serp ? "text" : "password"}
                          value={form.serpApiKey}
                          onChange={e => setForm(f => ({ ...f, serpApiKey: e.target.value }))}
                          placeholder={(settings.data?.settings as any)?.hasSerpApiKey ? "เว้นว่าง = ใช้ Key เดิม · พิมพ์ใหม่เพื่อเปลี่ยน" : "ใส่ SERP Credentials / Key"}
                          disabled={!canSave || saveMut.isPending}
                          className="!h-10 pr-12 font-mono text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(s => ({ ...s, serp: !s.serp }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-stone-500 hover:text-stone-800"
                          tabIndex={-1}
                        >{showKey.serp ? "ซ่อน" : "แสดง"}</button>
                      </div>
                    )}
                    <p className="text-[11.5px] text-stone-500 leading-relaxed min-h-[16px]">&nbsp;</p>
                  </div>
                </div>

                <div className="h-px w-full bg-stone-100" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-h-[28px] flex-wrap">
                      <Label className="!text-[12px] uppercase tracking-wider text-stone-500 !mb-0 flex items-center gap-1">
                        <Globe2 className="size-3" /> Default Country
                      </Label>
                    </div>
                    <select
                      value={form.countryCode}
                      onChange={e => setForm(f => ({ ...f, countryCode: e.target.value }))}
                      disabled={!canSave || saveMut.isPending}
                      className="h-10 w-full rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13.5px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60"
                    >
                      {COUNTRIES.map(c => (<option key={c.code} value={c.code}>{c.name}</option>))}
                    </select>
                    <p className="text-[11.5px] text-stone-500 leading-relaxed min-h-[16px]">Default สำหรับทุกโปรเจกต์ใหม่</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-h-[28px] flex-wrap">
                      <Label className="!text-[12px] uppercase tracking-wider text-stone-500 !mb-0 flex items-center gap-1">
                        <Languages className="size-3" /> Default Language
                      </Label>
                    </div>
                    <select
                      value={form.langCode}
                      onChange={e => setForm(f => ({ ...f, langCode: e.target.value }))}
                      disabled={!canSave || saveMut.isPending}
                      className="h-10 w-full rounded-lg border border-stone-300 bg-white pl-3 pr-9 text-[13.5px] text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 disabled:opacity-60"
                    >
                      {LANGS.map(l => (<option key={l.code} value={l.code}>{l.name}</option>))}
                    </select>
                    <p className="text-[11.5px] text-stone-500 leading-relaxed min-h-[16px]">Default ภาษาสำหรับ SERP + AI</p>
                  </div>
                </div>

                <div className="h-px w-full bg-stone-100" />

                <div className="flex items-center gap-5 rounded-xl bg-stone-50 p-4 border border-stone-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                      <p className="font-semibold text-[13.5px] text-stone-800">ตรวจสอบ Key ก่อนบันทึก (Ping Validate)</p>
                    </div>
                    <p className="text-[11.5px] text-stone-500 leading-relaxed">
                      เปิด → ระบบจะ call test ping ถึง Provider ก่อน commit บันทึกทุกครั้ง (ปิด → บันทึกเลย ไม่ตรวจสอบ Key ถูก/ผิดเลย เหมาะกับเครือข่ายอินเทอร์เน็ตมีปัญหา หรือใส่ Key ไว้ก่อน เดี๋ยวมาแก้)
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Switch
                      checked={form.validatePing}
                      onCheckedChange={c => setForm(f => ({ ...f, validatePing: c }))}
                      disabled={!canSave || saveMut.isPending}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave || saveMut.isPending}
                className="!h-10 !px-5 !rounded-lg !bg-[#b45309] hover:!bg-[#92400e] !text-[13.5px]"
              >
                {saveMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <CheckCircle2 className="size-4 mr-2" />}
                บันทึกการตั้งค่า {form.validatePing ? "(+ Ping)" : ""}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetKeys}
                disabled={!canSave || resetMut.isPending}
                className="!h-10 !px-5 !rounded-lg !text-[13.5px] text-rose-700 !border-rose-200 hover:!bg-rose-50"
              >
                {resetMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <XCircle className="size-4 mr-2" />}
                ลบ LLM + SERP Keys
              </Button>
              <span className="flex-1" />
              <Badge variant="secondary" className="!rounded-full !text-[11px]">
                {settings.isLoading ? "Loading..." : `Last sync: ${settings.data ? "from DB" : "pending"}`}
              </Badge>
            </div>
          </div>

          <div className="space-y-5">
            <Card className="!rounded-2xl !border-stone-200 !bg-white !shadow-sm">
              <CardHeader className="!p-5 !pb-0 flex-row items-center gap-3 !space-y-0">
                <DollarSign className="size-5 text-amber-700" />
                <CardTitle className="text-[15px] font-semibold text-stone-900 flex-1">Usage เดือนนี้</CardTitle>
              </CardHeader>
              <CardContent className="!p-5 space-y-4">
                <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 border border-emerald-200">
                  <p className="text-[11px] uppercase tracking-wider text-emerald-700 mb-1">Total Cost (USD)</p>
                  <p className="text-3xl font-bold font-mono text-emerald-900">${billingUsd}</p>
                  <p className="text-[12px] text-emerald-700/80 mt-1">{billingCalls} API calls</p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <DollarSign className="size-3.5 text-amber-700 shrink-0" />
                    <p className="font-semibold text-[13px] text-amber-950">Monthly Billing Limit (USD · SET-04)</p>
                    <span className="ml-auto text-[10.5px] text-amber-700/80">เว้นว่าง = ไม่จำกัด</span>
                  </div>
                  <div>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="เช่น 10.00 = หยุดเมื่อใช้เกิน 10 USD เดือนนี้"
                        value={form.billingLimitUsd === 0 ? "" : form.billingLimitUsd}
                        onChange={e => setForm(f => ({ ...f, billingLimitUsd: (e.target.value && e.target.value.trim() !== "") ? Number(e.target.value) as any : "" }))}
                        disabled={!canSave || saveMut.isPending}
                        className="!h-10 font-mono text-[13px] pr-28"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[12px]">
                        <span className="text-stone-500 font-semibold">USD</span>
                      </div>
                    </div>
                    {(() => {
                      const used = Number(billingUsd || 0);
                      const limit = Number(form.billingLimitUsd);
                      if (!limit || !Number.isFinite(limit) || limit <= 0) {
                        return <p className="text-[11.5px] text-stone-500 mt-2 leading-relaxed">⚠️ ไม่ได้ตั้ง Limit — ใช้งานได้ไม่จำกัด</p>;
                      }
                      const pct = Math.max(0, Math.min(100, +((used / limit) * 100).toFixed(1)));
                      const over = used > limit;
                      return (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between text-[11.5px]">
                            <span className={over ? "text-rose-700 font-semibold" : "text-stone-600"}>
                              {over ? "🚨 เกิน Limit แล้ว" : "Usage ปัจจุบัน"}
                            </span>
                            <span className="font-mono font-bold text-stone-800">{used.toFixed(2)} / {limit.toFixed(2)} USD · {pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-stone-200 overflow-hidden">
                            <div
                              className={`h-full ${over ? "bg-gradient-to-r from-rose-500 to-rose-600" : "bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-400"} transition-all duration-300`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[10.5px] text-stone-500 leading-relaxed">
                            * Enforcement บังคับหยุด LLM/SERP calls หากเกิน Limit จะต้องติดตั้งใน llmClient.ts + researchAudit แยก (Scope SET-04 ปัจจุบัน = Save/Load UI เท่านั้น)
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-2">
                  {providers.length === 0 ? (
                    <p className="text-[12px] text-stone-500 text-center py-6">ยังไม่มี usage ใดๆ สำหรับเดือนนี้</p>
                  ) : (
                    providers.map((p: any) => (
                      <div key={p.provider} className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border border-stone-100">
                        <div>
                          <p className="font-semibold text-[13px] text-stone-800">{p.provider}</p>
                          <p className="text-[11px] text-stone-500">{Number(p.calls ?? 0).toLocaleString()} calls</p>
                        </div>
                        <p className="font-bold font-mono text-[14px] text-stone-900">${Number(p.usd ?? 0).toFixed(2)}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="!rounded-2xl !border !border-dashed !border-amber-300 !bg-amber-50/40">
              <CardContent className="p-5">
                <h3 className="font-semibold text-[14px] text-stone-900 mb-2 flex items-center gap-2">
                  <Key className="size-4 text-amber-700" /> การจัดการ Key
                </h3>
                <ul className="space-y-1.5 text-[12px] text-stone-600 leading-relaxed">
                  <li className="flex items-start gap-2">• Keys จะถูกเข้ารหัส AES-256-GCM ทุกตัวก่อนเขียน DB</li>
                  <li className="flex items-start gap-2">• ไม่มีใคร (รวมถึง admin) อ่าน raw key ได้กลับจาก DB</li>
                  <li className="flex items-start gap-2">• Ping validate จะ call ทดสอบ cost ต่ำ (~$0.0002)</li>
                  <li className="flex items-start gap-2">• YMYL categories (สล็อต/หวย/คาสิโน) ควรตั้ง citation ≥3 เสมอ</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </MainDashboardShell>
  );
}
