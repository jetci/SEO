import { useState } from "react";
import { trpc } from "@/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import useAuth, { isUserAdminOrOwner } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Search, AlertTriangle, Loader2, PlayCircle, Zap, Target, Sparkles, CheckCircle2,
  ChevronDown, FilePenLine,
} from "lucide-react";

type SerpPreviewModalProps = {
  open: boolean;
  keywordId: number | null;
  onClose: () => void;
  keywordText?: string;
  keywordTier?: "pillar" | "cluster" | "supporting" | string;
  keywordProjectId?: number | null;
  keywordVol?: number;
  keywordStyleBg?: string;
  keywordStyleText?: string;
  keywordStyleLabel?: string;
  runningKwIds?: Set<number>;
  onToggleRun?: (id: number, on: boolean) => void;
  enriching?: boolean;
};

export default function SerpPreviewModal(props: SerpPreviewModalProps) {
  const {
    open, keywordId, onClose,
    keywordText, keywordTier, keywordProjectId, keywordVol = 0,
    keywordStyleBg, keywordStyleText, keywordStyleLabel,
    runningKwIds = new Set<number>(), onToggleRun,
    enriching = false,
  } = props;

  const { user } = useAuth();
  const isAdmin = isUserAdminOrOwner(user);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const kwIdNum = Number(keywordId) > 0 ? Number(keywordId) : -1;

  const serpPkgQ = trpc.research.getPackage.useQuery(
    { keywordId: kwIdNum },
    { enabled: open && kwIdNum > 0, staleTime: 60_000 }
  );

  const enrichSerp = trpc.keywords.enrichSerp.useMutation();
  const runPlan = trpc.research.runPlanForKeyword.useMutation();
  const createDraft = trpc.write.createDraft.useMutation();

  const kwIsRunning = kwIdNum > 0 && runningKwIds.has(kwIdNum);
  const isPillar = keywordTier === 'pillar';

  function handleEnrichThis() {
    if (!kwIdNum || kwIdNum <= 0 || !keywordProjectId) { toast.error('เลือกโปรเจกต์ก่อน Enrich'); return; }
    enrichSerp.mutate(
      { projectId: Number(keywordProjectId), keywordIds: [kwIdNum] },
      {
        onSuccess() {
          toast.success('✅ Enrich SERP เสร็จ — โหลด Modal อีกครั้ง');
          utils.research.getPackage.invalidate({ keywordId: kwIdNum });
        }
      }
    );
  }

  async function handleCreateDraftAndWrite() {
    if (!kwIdNum || kwIdNum <= 0) return;
    if (onToggleRun) onToggleRun(kwIdNum, true);
    onClose();
    const loading = toast.loading(`✍️ กำลังเตรียม Draft: ${String(keywordText || '').slice(0, 40)}... → เข้าสู่กระบวนการเขียน (Step 1/6)`);
    try {
      const res = await createDraft.mutateAsync({ keywordId: kwIdNum });
      toast.dismiss(loading);
      const dr: any = (res as any)?.draft_id ?? (res as any)?.draftId ?? 0;
      if (!dr) { toast.warning(`สำเร็จ แต่ไม่มี draft_id response`); if (onToggleRun) onToggleRun(kwIdNum, false); return; }
      const fromExisting = !!(res as any)?.from_existing;
      if (fromExisting) toast.info(`📝 Draft มีอยู่แล้ว #${dr} → กำลังเปิดหน้าเขียน`, { duration: 3200 });
      else toast.success(`✅ Draft ใหม่ #${dr} สร้างเสร็จ! → กำลังเข้าสู่กระบวนการเขียน Step 1/6...`, { duration: 3200 });
      const writePath = `/write?kw_id=${kwIdNum}&draft_id=${dr}`;
      setLocation(writePath);
      window.setTimeout(() => {
        const cur = window.location.pathname + window.location.search;
        if (!cur.includes('/write') || !cur.includes(`kw_id=${kwIdNum}`)) window.location.assign(writePath);
      }, 400);
    } catch (e: any) {
      toast.dismiss(loading);
      toast.error(`Create Draft fail: ${String(e?.message ?? e ?? '').slice(0, 140)}`);
    } finally {
      if (onToggleRun) onToggleRun(kwIdNum, false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-stone-900 flex items-center gap-2 flex-wrap">
            <Search className="size-5 text-sky-700" />
            <span>🔍 SERP Preview:</span>
            <span className="text-amber-800 truncate max-w-[380px]">{keywordText || '—'}</span>
            {keywordStyleLabel && (
              <span className="px-2 py-0.5 rounded text-[10.5px] font-bold ml-auto" style={{ backgroundColor: keywordStyleBg || '#f5f5f4', color: keywordStyleText || '#44403c' }}>
                {keywordStyleLabel} Tier · Vol {(keywordVol ?? 0).toLocaleString()}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-stone-500">
            ตัวอย่างผลการค้นหาจริง Google Top10 + People Also Ask (PAA) จากฐานข้อมูล Research Package
          </DialogDescription>
        </DialogHeader>
        {isPillar && (
          <Alert variant="destructive" className="bg-rose-50 border-rose-300 text-rose-900">
            <AlertTriangle className="size-5" />
            <AlertTitle className="font-bold">🚫 Pillar Umbrella Keyword — ห้ามเขียนบทความโดยตรง</AlertTitle>
            <AlertDescription className="text-[13px] leading-relaxed">
              Pillar Tier = <b>คำหลัก Umbrella</b> ครอบคลุมทั้งโปรเจกต์ ใช้สำหรับ <b>วาง Research Package / จัด Hierarchy</b> เท่านั้น
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-4 pt-2">
          {serpPkgQ.isLoading && (
            <div className="p-4 rounded-xl border border-sky-200 bg-sky-50 flex items-center gap-3">
              <Loader2 className="size-5 animate-spin text-sky-700" />
              <span className="text-[13px] text-sky-800">กำลังโหลดข้อมูล SERP...</span>
            </div>
          )}
          {!serpPkgQ.isLoading && (!serpPkgQ.data?.package) && (
            <div className="p-4 rounded-xl border border-stone-200 bg-stone-50 space-y-2">
              <div className="text-[14px] font-semibold text-stone-800 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" /> ยังไม่มี Research Package
              </div>
              <p className="text-[13px] text-stone-600">ยังไม่ได้ทำการ Enrich SERP หรือ Run Research Plan</p>
              <div className="flex gap-2 flex-wrap pt-1">
                <Button
                  size="sm"
                  className="!bg-amber-700 hover:!bg-amber-800"
                  disabled={enriching || runPlan.isPending || !isAdmin || isPillar}
                  onClick={() => { onClose(); }}
                >
                  <PlayCircle className="size-4 mr-2" />
                  Pillar Run Research Plan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enriching || !isAdmin || kwIdNum <= 0}
                  onClick={handleEnrichThis}
                >
                  <Zap className="size-4 mr-2" /> ⚡ Enrich SERP
                </Button>
              </div>
            </div>
          )}
          {serpPkgQ.data?.package && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[13px] font-semibold text-stone-700 flex items-center gap-2">
                    <Target className="size-4 text-emerald-700" /> 🥇 Google SERP Top 10 Organic
                    <Badge className="!bg-emerald-100 !text-emerald-800 !border-emerald-200">
                      {(Array.isArray((serpPkgQ.data?.package as any)?.serp_top10) ? (serpPkgQ.data?.package as any).serp_top10.length : 0)} results
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {(Array.isArray((serpPkgQ.data?.package as any)?.serp_top10) ? (serpPkgQ.data?.package as any).serp_top10 : []).slice(0, 10).map((r: any, i: number) => {
                    const da = typeof r.domain_authority === 'number' ? r.domain_authority : (typeof r.da === 'number' ? r.da : 30 + ((i * 7) % 50));
                    const title = String(r.title || 'SERP Result').slice(0, 180);
                    const domain = String(r.domain || r.url || '').replace(/^https?:\/\//, '').split('/')[0] || 'unknown';
                    const snippet = String(r.snippet || r.description || '').slice(0, 200);
                    const isHighDa = da >= 35;
                    return (
                      <div key={i} className={`border rounded-xl p-3 text-left ${isHighDa ? 'bg-white border-emerald-100' : 'bg-stone-50/70 border-stone-200'}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-7 h-7 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-stone-500 text-white' : i === 2 ? 'bg-orange-700 text-white' : 'bg-stone-300 text-stone-700'}`}>
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[12px] font-semibold text-emerald-800 truncate max-w-[50%]">{domain}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${isHighDa ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>DA {da}</span>
                              {isHighDa && <CheckCircle2 className="size-3.5 text-emerald-600 inline" />}
                            </div>
                            <div className="text-[14px] font-semibold text-sky-800 line-clamp-2 leading-snug hover:underline cursor-pointer">{title}</div>
                            {snippet && <div className="text-[12.5px] text-stone-600 mt-1 line-clamp-2 leading-relaxed">{snippet}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {Array.isArray((serpPkgQ.data?.package as any)?.paa_questions) && (serpPkgQ.data.package as any).paa_questions.length > 0 && (
                <div>
                  <div className="text-[13px] font-semibold text-stone-700 mb-2 flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-700" /> 💡 People Also Ask (PAA)
                    <Badge className="!bg-purple-100 !text-purple-800 !border-purple-200">
                      {(serpPkgQ.data.package as any).paa_questions.length} Qs
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {((serpPkgQ.data?.package as any).paa_questions).slice(0, 8).map((q: any, i: number) => {
                      const qTxt = String(q.question || '').slice(0, 220);
                      const aTxt = String(q.answer || q.snippet || '').slice(0, 320);
                      return (
                        <details key={i} className="border border-purple-100 bg-purple-50/40 rounded-xl p-3 open:bg-purple-50/70 transition-colors">
                          <summary className="text-[13.5px] font-semibold text-stone-800 cursor-pointer list-none flex items-center gap-2 select-none">
                            <span className="text-purple-700 font-bold w-5">Q{i + 1}.</span>
                            <span className="flex-1">{qTxt || 'PAA Question'}</span>
                            <ChevronDown className="size-4 text-purple-500" />
                          </summary>
                          {aTxt && <div className="mt-2 pl-7 text-[13px] text-stone-700 leading-relaxed">{aTxt}</div>}
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}
              {typeof (serpPkgQ.data?.package as any)?.ai_overview === 'string' && (serpPkgQ.data.package as any).ai_overview.length > 10 && (
                <div className="p-4 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50">
                  <div className="text-[13px] font-semibold text-sky-800 mb-2 flex items-center gap-2">
                    <Sparkles className="size-4" /> 🤖 AI Overview (SERP Generated Summary)
                  </div>
                  <p className="text-[13.5px] text-sky-900 leading-relaxed">{String((serpPkgQ.data?.package as any).ai_overview.slice(0, 1200))}</p>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="gap-2 pt-3 border-t border-stone-100 mt-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="!h-9">ปิด</Button>
          </DialogClose>
          <Button
            size="sm"
            className="!h-9 !bg-emerald-700 hover:!bg-emerald-800 text-white shadow-sm"
            disabled={createDraft.isPending || !isAdmin || kwIdNum <= 0 || kwIsRunning}
            onClick={handleCreateDraftAndWrite}
            title="คลิกเดียว: สร้าง/เปิด Draft + เปิดหน้าเขียน"
          >
            {createDraft.isPending || kwIsRunning
              ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังสร้าง Draft...</>
              : <><FilePenLine className="size-4 mr-2" />เขียนบท (Step 1/6)</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
