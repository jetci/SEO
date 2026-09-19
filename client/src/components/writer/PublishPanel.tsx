import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Save, CalendarDays, Clock, X, Loader2,
  FileDown, FileText, FileType, Eye, ShieldCheck, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { renderMdSafe, generateDocxBlob } from "@/hooks/useArticleWriter";

export interface PublishBadge {
  label: string;
  color: string;
  value?: string | number;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}

export interface PublishStats {
  wordCount?: number;
  wordTarget?: number;
  charCount?: number;
  charCountNoSpace?: number;
  headings?: { h1: number; h2: number; h3: number; total: number };
  densityPct?: number;
  densityPass?: boolean;
  citationsCount?: number;
  eeatScore?: number;
  mainKeywordAppearances?: number;
  readTimeMin?: number;
}

export interface PublishPanelProps {
  publishMut: any;
  seoScore?: number;
  badges?: PublishBadge[];
  stats?: PublishStats;
  onPublish: (unpublish?: boolean) => Promise<void> | void;
  onCancel?: () => void;
  onResetKey?: () => void;
  draftId?: string | number;
  markdown?: string;
  metaTitle?: string;
  metaDescription?: string;
  keyword?: string;
  slug?: string;
  setScheduleMut?: any;
  scheduledDateTime?: string;
  setScheduledDateTime?: (v: string) => void;
  writeHasPlaceholder?: boolean;
  seoCompliance?: { anyHardBlock?: boolean; combinedPct?: number };
  hideExport?: boolean;
}

export default function PublishPanel({
  publishMut,
  seoScore,
  badges = [],
  stats = {},
  onPublish,
  onCancel,
  onResetKey,
  draftId,
  markdown = "",
  metaTitle = "",
  metaDescription = "",
  keyword = "",
  slug = "",
  setScheduleMut,
  scheduledDateTime = "",
  setScheduledDateTime,
  writeHasPlaceholder = false,
  seoCompliance,
  hideExport = false,
}: PublishPanelProps) {
  const [status, setStatus] = useState<"draft" | "done">("done");

  const wcActual = stats.wordCount ?? 0;
  const wcTarget = stats.wordTarget ?? 1000;
  const wcPct = wcTarget > 0 ? Math.max(0, Math.round(100 * wcActual / Math.max(1, wcTarget))) : 0;
  const wcColor = wcPct >= 80 ? "bg-emerald-600" : wcPct >= 60 ? "bg-amber-500" : "bg-rose-600";
  const wcTxtColor = wcPct >= 80 ? "text-emerald-700" : wcPct >= 60 ? "text-amber-700" : "text-rose-700";

  const seoColor = typeof seoScore === "number"
    ? seoScore >= 80 ? "bg-emerald-600" : seoScore >= 60 ? "bg-amber-600" : "bg-rose-600"
    : "bg-stone-400";

  const hardBlock = !!seoCompliance?.anyHardBlock;
  const hasPH = !!writeHasPlaceholder || /\[AUTO PLACEHOLDER\s*[—\-]/.test(markdown || "");
  const wcBlock = wcPct < 80;
  const publishDisabled =
    publishMut?.isPending ||
    !draftId ||
    hasPH ||
    wcBlock ||
    hardBlock;

  async function doSetSchedule() {
    if (!setScheduleMut || !setScheduledDateTime) return;
    if (!draftId) { toast.error("ต้องมี Draft ID ก่อนตั้งเวลาเผยแพร่"); return; }
    if (!scheduledDateTime) { toast.error("เลือกวันที่และเวลาก่อน"); return; }
    const dt = new Date(scheduledDateTime);
    if (isNaN(dt.getTime())) { toast.error("รูปแบบวันที่ไม่ถูกต้อง"); return; }
    if (dt.getTime() <= Date.now() + 59_000) { toast.error("เวลาต้องอยู่ในอนาคต (มากกว่า 1 นาทีข้างหน้า)"); return; }
    const t = toast.loading(`กำลังตั้งเวลาเผยแพร่ Draft #${draftId}...`);
    setScheduleMut.mutate(
      { draftId, scheduledAt: dt.toISOString() },
      {
        onSuccess(r: any) {
          toast.dismiss(t);
          if (r?.ok) toast.success(String(r?.message || "ตั้งเวลาสำเร็จ"));
          else toast.error(String(r?.message || "set schedule fail").slice(0, 120));
        },
        onError(e: any) {
          toast.dismiss(t);
          toast.error("Schedule err: " + String(e?.message || e).slice(0, 120));
        },
      }
    );
  }

  async function doCancelSchedule() {
    if (!setScheduleMut || !setScheduledDateTime) return;
    if (!draftId) { toast.error("ไม่มี Draft ID"); return; }
    const t = toast.loading("กำลังยกเลิกตารางเวลา...");
    setScheduleMut.mutate(
      { draftId, scheduledAt: null },
      {
        onSuccess(r: any) {
          toast.dismiss(t);
          if (r?.ok) {
            setScheduledDateTime("");
            toast.success(String(r?.message || "ยกเลิกสำเร็จ"));
          } else toast.error(String(r?.message || "cancel fail").slice(0, 120));
        },
        onError(e: any) {
          toast.dismiss(t);
          toast.error("Cancel schedule err: " + String(e?.message || e).slice(0, 120));
        },
      }
    );
  }

  function exportMd() {
    const blob = new Blob([markdown || ""], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `article_${draftId || "draft"}_${Date.now()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success("⬇ ดาวน์โหลด Markdown เสร็จ");
  }

  function exportHtml() {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${metaTitle || keyword}</title><meta name="description" content="${metaDescription || ""}"></head><body>${renderMdSafe(markdown || "")}</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `article_${draftId || "draft"}_${Date.now()}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success("⬇ ดาวน์โหลด HTML เสร็จ");
  }

  async function exportDocx() {
    const t = toast.loading("กำลังสร้างไฟล์ Word (.docx)...");
    try {
      const blob = await generateDocxBlob(markdown || "", metaTitle || keyword);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `article_${draftId || "draft"}_${Date.now()}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.dismiss(t);
      toast.success("📄 ดาวน์โหลด Word (.docx) เสร็จ");
    } catch (e: any) {
      toast.dismiss(t);
      toast.error("สร้างไฟล์ Word ล้มเหลว: " + String(e?.message || e).slice(0, 100));
    }
  }

  const slugUrl = slug || (keyword || "article-slug").trim().replace(/\s+/g, "-").slice(0, 90);

  return (
    <div className="space-y-5">
      <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Eye className="size-5 text-amber-700" />7️⃣ ดูตัวอย่างก่อนบันทึก (Preview)
          </h2>
          <Separator />

          <div className="p-4 border border-stone-200 rounded-xl bg-white">
            <div className="text-[11px] text-stone-400 mb-1">🔍 SEO Preview — หน้าตาบน Google</div>
            <div className="text-[17px] text-[#1a0dab] leading-tight mt-1 mb-0.5">
              {metaTitle || <span className="text-stone-400 italic">Meta Title ยังไม่ถูกตั้งค่า</span>}
            </div>
            <div className="text-[12.5px] text-[#006621]">
              thaiaeo.manus.host › บทความ › {slugUrl}
            </div>
            <div className="text-[12.5px] text-[#4d5156] leading-snug mt-1">
              {metaDescription || <span className="text-stone-400 italic">Meta Description ยังไม่ถูกตั้งค่า</span>}
            </div>
          </div>

          <Separator />

          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <div className="p-3 bg-stone-50 border-b border-stone-200 flex gap-4 text-xs text-stone-500 flex-wrap">
              <span>📄 {wcActual.toLocaleString()} คำ</span>
              <span>🔑 density {stats.densityPct?.toFixed?.(1) ?? "—"}% {stats.densityPass ? "✓" : ""}</span>
              <span>📚 อ้างอิง {stats.citationsCount ?? sourcesPlaceholder(sourcesCountFromMd(markdown))} แหล่ง</span>
              <span>⏱ อ่าน {stats.readTimeMin ?? Math.max(1, Math.round(wcActual / 250))} นาที</span>
            </div>

            <div className="p-4 border-b border-stone-200 bg-[#fefefe] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="!border-sky-200 !bg-sky-50 !text-sky-700">
                    📄 คำ: <b className="ml-1">{wcActual.toLocaleString()}</b>/{wcTarget.toLocaleString()} ({wcPct}%)
                  </Badge>
                  <Badge variant="outline" className={`${wcColor.includes("emerald") ? "!border-emerald-200 !bg-emerald-50 !text-emerald-700" : wcColor.includes("amber") ? "!border-amber-200 !bg-amber-50 !text-amber-700" : "!border-rose-200 !bg-rose-50 !text-rose-700"}`}>
                    👓 SEO Score: <b className="ml-1">{seoScore ?? "—"}/100</b>
                  </Badge>
                  {badges.map((b, i) => (
                    <Badge key={i} className={b.color}>{b.label}{b.value !== undefined ? `: ${b.value}` : ""}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className={`text-[11px] font-semibold ${wcTxtColor}`}>
                    {wcPct >= 80 ? "✓ คำครบ 80%+" : wcPct >= 60 ? `⚠️ ${wcPct}% ต้อง≥80%` : `🚫 ${wcPct}% คำยังน้อย`}
                  </div>
                  <Progress
                    value={Math.min(100, wcPct)}
                    className={`w-32 h-2 ${wcColor.replace("bg-", "!bg-")}`}
                  />
                </div>
              </div>
              {typeof seoScore === "number" && (
                <div className="flex items-center gap-3 mt-1">
                  <Progress
                    value={Math.min(100, seoScore)}
                    className={`w-full h-2 ${seoColor.replace("bg-", "!bg-")}`}
                  />
                  <span className="text-[11px] text-stone-500 whitespace-nowrap">
                    <ShieldCheck className="size-3 inline -mt-0.5 mr-1" />
                    {seoScore >= 80 ? "✨ ดีมาก" : seoScore >= 60 ? "🙂 ดี" : "⚠️ ต้องปรับปรุง"}
                  </span>
                </div>
              )}
            </div>

            <div className="p-6 max-h-[340px] overflow-auto">
              <article
                className="prose prose-stone max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMdSafe(markdown || "") }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold">สถานะ:</span>
            <select
              className="rounded-lg border border-stone-200 p-1.5"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="draft">📝 ร่าง</option>
              <option value="done">✅ เสร็จ (พร้อมใช้)</option>
            </select>
            <span className="text-[11px] text-stone-400">บันทึกเข้าคลัง เพื่อส่งมอบลูกค้า</span>
            {onResetKey && (
              <Button
                variant="outline"
                size="sm"
                className="!h-8 ml-auto text-[12px]"
                onClick={onResetKey}
                title="Reset component state / force refetch"
              >
                <RefreshCw className="size-3.5 mr-1.5" />รีเซ็ต / โหลดใหม่
              </Button>
            )}
          </div>

          {setScheduleMut && setScheduledDateTime && (
            <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-5 text-sky-700" />
                <h3 className="font-semibold text-sky-900">
                  ⏰ ตั้งเวลาเผยแพร่อัตโนมัติ (CRON Worker ทุก 1 นาที)
                </h3>
              </div>
              <p className="text-[12.5px] text-sky-700 -mt-1">
                เลือกวันที่ + เวลา → ระบบจะเผยแพร่ให้อัตโนมัติเมื่อถึงเวลานั้น
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center gap-2">
                  <Clock className="size-4 text-stone-500 shrink-0" />
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="flex-1 !h-10 rounded-lg border border-stone-200 px-3 outline-none focus:ring-2 focus:ring-sky-200 bg-white text-sm"
                    min={new Date(Date.now() + 120_000).toISOString().slice(0, 16)}
                  />
                </div>
                <Button
                  size="sm"
                  className="!h-10 !bg-sky-700 hover:!bg-sky-800 shrink-0"
                  onClick={doSetSchedule}
                  disabled={setScheduleMut.isPending || !draftId || !scheduledDateTime}
                >
                  {setScheduleMut.isPending
                    ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังตั้งเวลา…</>
                    : <><CalendarDays className="size-4 mr-2" />ตั้งเวลาเผยแพร่</>}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="!h-10 shrink-0"
                  onClick={doCancelSchedule}
                  disabled={setScheduleMut.isPending || !draftId || !scheduledDateTime}
                >
                  <X className="size-4 mr-2" />ยกเลิก
                </Button>
              </div>
              {scheduledDateTime && (
                <div className="text-[12px] text-sky-800 bg-white/70 rounded-lg px-3 py-2 border border-sky-100">
                  📅 ตารางเวลาที่ตั้ง:
                  <b className="ml-1">
                    {new Date(scheduledDateTime).toLocaleString("th-TH", { dateStyle: "full", timeStyle: "long" })}
                  </b>
                </div>
              )}
            </div>
          )}

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
            <div className="flex flex-1 gap-2 flex-wrap">
              <Button
                className="!bg-amber-700 hover:!bg-amber-800 flex-1 min-w-[180px]"
                onClick={() => onPublish(false)}
                disabled={publishDisabled}
                title={
                  hasPH ? "มี AUTO PLACEHOLDER — ต้องแก้ก่อน Publish"
                  : wcBlock ? `จำนวนคำ ${wcPct}% ต้อง≥80%`
                  : hardBlock ? `SEO Gate FAIL (${seoCompliance?.combinedPct ?? 0}% < 75%)`
                  : ""
                }
              >
                {publishMut?.isPending
                  ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังเผยแพร่…</>
                  : <><Save className="size-4 mr-2" />✨ เผยแพร่ทันที (Publish)</>}
              </Button>
              <Button
                variant="outline"
                className="flex-1 min-w-[180px]"
                onClick={() => onPublish(true)}
                disabled={publishDisabled}
              >
                🔒 เลิกเผยแพร่
              </Button>
              {onCancel && (
                <Button
                  variant="ghost"
                  className="min-w-[100px]"
                  onClick={onCancel}
                >
                  ยกเลิก
                </Button>
              )}
            </div>
          </div>

          {!hideExport && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1 min-w-[120px]" onClick={exportMd}>
                  <FileDown className="size-4 mr-2" />⬇ Markdown
                </Button>
                <Button variant="outline" className="flex-1 min-w-[120px]" onClick={exportHtml}>
                  <FileText className="size-4 mr-2" />⬇ HTML
                </Button>
                <Button variant="outline" className="flex-1 min-w-[120px]" onClick={exportDocx}>
                  <FileType className="size-4 mr-2" />📄 Word (.docx)
                </Button>
              </div>
            </>
          )}

          {(hasPH || wcBlock || hardBlock) && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-[12.5px] text-rose-800 space-y-1">
              {hasPH && <div>🚫 มี section AUTO PLACEHOLDER เหลืออยู่ — ต้องเขียนใหม่ทั้งหมดก่อน Publish</div>}
              {wcBlock && <div>🚫 จำนวนคำไม่ถึงเกณฑ์ 80%: {wcActual.toLocaleString()}/{wcTarget.toLocaleString()} = {wcPct}%</div>}
              {hardBlock && <div>🚫 SEO Gate FAIL: {seoCompliance?.combinedPct ?? 0}% {'<'} 75% หรือมี Critical items — ต้องแก้ก่อน Publish</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function sourcesCountFromMd(md: string): number {
  const matches = md.match(/\[CITE\d+\]/gi) || [];
  return matches.length;
}
function sourcesPlaceholder(_citationMarkers: number): number {
  return 0;
}
