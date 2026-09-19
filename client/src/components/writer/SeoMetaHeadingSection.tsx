import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Sparkles } from "lucide-react";

export interface SeoMetaHeadingSectionProps {
  title: string;
  setTitle: (v: string) => void;
  mt: string;
  setMt: (v: string) => void;
  md?: string;
  setMd?: (v: string) => void;
  mdes: string;
  setMdes: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  h1?: string;
  setH1?: (v: string) => void;
  outlineSecs?: Array<{ heading_level: number; heading_text: string }>;
  setOutlineSecs?: (fn: any) => void;
  wordCount?: number;
  eeatEst?: number;
  ymylInjected?: boolean;
  keyword?: string;
  onValidate?: (field: string, value: string) => { ok: boolean; message?: string };
}

export default function SeoMetaHeadingSection({
  title,
  setTitle,
  mt,
  setMt,
  mdes,
  setMdes,
  slug,
  setSlug,
  h1,
  setH1,
  outlineSecs,
  setOutlineSecs,
  wordCount,
  eeatEst,
  ymylInjected,
  keyword,
  onValidate,
}: SeoMetaHeadingSectionProps) {
  const mtOk = mt.length >= 30 && mt.length <= 60;
  const mtColor = mtOk ? "bg-emerald-600" : mt.length > 60 ? "bg-rose-500" : "bg-amber-500";
  const mtBadgeText = mt.length >= 30 && mt.length <= 60
    ? "✓ Optimal 30-60"
    : mt.length === 0
    ? " (เป้าหมาย 30-60)"
    : mt.length < 30
    ? "⚠️ สั้นเกิน <30"
    : "⚠️ ยาวเกิน >60";
  const mtBadgeClass = mtOk
    ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300"
    : mt.length === 0
    ? "!bg-stone-100 !text-stone-600 !border-stone-200"
    : "!bg-amber-100 !text-amber-800 !border-amber-300";

  const mdesOk = mdes.length >= 120 && mdes.length <= 320;
  const mdesColor = mdesOk ? "bg-emerald-600" : mdes.length > 320 ? "bg-rose-500" : "bg-amber-500";
  const mdesBadgeText = mdesOk
    ? "✓ Optimal 120-320"
    : mdes.length === 0
    ? " (เป้าหมาย 120-320)"
    : mdes.length < 120
    ? "⚠️ สั้นเกิน <120"
    : "⚠️ ยาวเกิน >320";
  const mdesBadgeClass = mdesOk
    ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300"
    : mdes.length === 0
    ? "!bg-stone-100 !text-stone-600 !border-stone-200"
    : "!bg-amber-100 !text-amber-800 !border-amber-300";

  const h1Len = h1?.length ?? title.length;
  const h1Val = h1 ?? title;
  const setH1Val = setH1 ?? setTitle;
  const h1Ok = h1Len >= 40 && h1Len <= 120;
  const h1Color = h1Ok ? "bg-emerald-600" : h1Len > 120 ? "bg-amber-600" : "bg-amber-400";
  const h1BadgeText = h1Len >= 40 && h1Len <= 120
    ? "✓ ความยาวเหมาะสม (40–120)"
    : h1Len === 0
    ? " (AI จะเติมจาก Outline H1 อัตโนมัติ)"
    : " (แนะนำ 40–120 ตัว)";
  const h1BadgeClass = h1Ok
    ? "!text-emerald-700"
    : h1Len === 0
    ? "!text-amber-700"
    : "!text-amber-700";

  const slugOk = slug.length >= 5 && slug.length <= 100 && /^[a-z0-9-]+$/.test(slug);
  const slugColor = slugOk ? "bg-emerald-600" : "bg-amber-500";
  const slugBadgeClass = slugOk
    ? "!bg-emerald-100 !text-emerald-800 !border-emerald-300"
    : "!bg-amber-100 !text-amber-800 !border-amber-300";

  const hasOutlineH1 = Array.isArray(outlineSecs) && outlineSecs.some(s => s.heading_level === 1);

  return (
    <Card className="!rounded-2xl !border !border-sky-200 !bg-sky-50/30">
      <CardContent className="p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="size-5 text-sky-700" />5️⃣ รวม + Meta (Assemble)
        </h2>
        <p className="text-[13px] text-stone-500 -mt-2">
          รวมทุก section เป็นบทความเดียว + กรอก/แก้ Meta · LENGTH COLOR RULE: Title 30-60 = ✓เขียว, Description 120-320 = ✓เขียว
        </p>
        <Separator />

        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 p-3 bg-white border border-stone-200 rounded-md">
            <CheckCircle2 className="text-emerald-600 size-4 shrink-0" />
            <span>
              รวม {(outlineSecs?.filter(s => s.heading_level !== 1).length ?? 0)} section → 1 บทความ
              {typeof wordCount === 'number' && (
                <> (<b>{wordCount.toLocaleString()}</b> คำ)</>
              )}
            </span>
            {ymylInjected && (
              <Badge className="!ml-2 !bg-rose-100 !text-rose-700 !border-rose-200">
                🛡️ YMYL Disclaimer: ON
              </Badge>
            )}
          </div>

          <div className="space-y-2 p-4 rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-white shadow-[0_1px_0_rgba(146,64,14,0.05)]">
            <div className="flex items-start justify-between text-[12.5px] pl-1 pr-1 gap-3 flex-wrap">
              <label className="font-black text-amber-900 flex items-center gap-2">
                <span className="text-[16px]">🏛️</span>
                หัวข้อเรื่อง (H1 Content — <span className="text-[11px] text-amber-700">ปรากฏบนหน้าบทความจริง</span>)
              </label>
              <span className={`font-semibold ${h1BadgeClass}`}>
                <b>{h1Len}</b>/512 ตัวอักษร{h1BadgeText}
              </span>
            </div>
            <div className="relative">
              <input
                value={h1Val}
                onChange={(e) => setH1Val(e.target.value.slice(0, 512))}
                onBlur={() => {
                  if (h1Val.trim() && typeof setOutlineSecs === 'function' && Array.isArray(outlineSecs)) {
                    const idx = outlineSecs.findIndex(s => s.heading_level === 1);
                    if (idx >= 0) {
                      const cpy = outlineSecs.slice();
                      if (cpy[idx].heading_text.trim() !== h1Val.trim()) {
                        cpy[idx] = { ...cpy[idx], heading_text: h1Val.trim() };
                        setOutlineSecs(cpy);
                      }
                    }
                  }
                }}
                placeholder='เช่น ทีเด็ดบอล คู่มือ 2569: เลขเด็ด วิธีดูตารางบอล และเคล็ดลับชนะอย่างปลอดภัย'
                className="w-full !h-12 px-4 rounded-lg border-2 border-amber-200 bg-white text-[14px] font-semibold text-stone-900 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                maxLength={512}
              />
              {!h1Val.trim() && hasOutlineH1 && (
                <button
                  type="button"
                  onClick={() => {
                    const fH1 = outlineSecs?.find(s => s.heading_level === 1)?.heading_text || '';
                    if (fH1) setH1Val(fH1.slice(0, 512));
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] px-2.5 h-7 rounded-md bg-amber-600 text-white hover:bg-amber-700 shadow-sm"
                >
                  ⤵️ คัดลอกจาก Outline H1
                </button>
              )}
            </div>
            <Progress
              value={Math.min(100, (h1Len / 120) * 100)}
              className={`h-2.5 ${h1Color.replace('bg-', '!bg-')}`}
            />
            <div className="flex items-center justify-between text-[11px] pl-1 pr-1 text-amber-700/90 mt-0.5">
              <span className="font-semibold">💡 H1 = ชื่อบทความบนหน้าเว็บ (คนอ่านเห็นจริง) ความยาวประมาณ 40–120 ตัว</span>
              <span className="text-stone-400">คนละฟิลด์กับ Meta Title SERP ด้านล่าง</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12.5px] pl-1 pr-1">
              <label className="font-semibold text-stone-700">
                Meta Title (ชื่อหน้า SERP Google · <span className="text-[11px] text-sky-700">≤60 ตัว</span>)
              </label>
              <div className="flex items-center gap-2">
                <Badge className={`!border ${mtBadgeClass}`}>
                  <b>{mt.length}</b>/60 ตัวอักษร{mtBadgeText}
                </Badge>
              </div>
            </div>
            <input
              value={mt}
              onChange={(e) => {
                const v = e.target.value.slice(0, 120);
                setMt(v);
                onValidate?.('mt', v);
              }}
              placeholder='เช่น ราคาบอลไหล วันนี้ คืออะไร สอนดูตารางบอล 2569'
              className="w-full !h-11 px-4 rounded-lg border border-stone-200 bg-white text-sm outline-none focus:ring-2 focus:ring-sky-200"
              maxLength={120}
            />
            <Progress
              value={Math.min(100, (mt.length / 60) * 100)}
              className={`h-2.5 ${mtColor.replace('bg-', '!bg-')}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12.5px] pl-1 pr-1">
              <label className="font-semibold text-stone-700">
                Meta Description (คำบรรยาย SERP)
              </label>
              <div className="flex items-center gap-2">
                <Badge className={`!border ${mdesBadgeClass}`}>
                  <b>{mdes.length}</b>/320 ตัวอักษร{mdesBadgeText}
                </Badge>
              </div>
            </div>
            <textarea
              value={mdes}
              onChange={(e) => {
                const v = e.target.value.slice(0, 400);
                setMdes(v);
                onValidate?.('mdes', v);
              }}
              rows={3}
              placeholder='อธิบายสั้นๆ เกี่ยวกับเนื้อหาบทความ — ควรมี Keyword หลักอยู่ 1-2 ครั้ง และสะท้อน Search Intent ให้ชัดเจน'
              className="w-full px-4 py-2.5 rounded-lg border border-stone-200 bg-white text-sm outline-none focus:ring-2 focus:ring-sky-200 resize-none"
              maxLength={400}
            />
            <Progress
              value={Math.min(100, (mdes.length / 320) * 100)}
              className={`h-2.5 ${mdesColor.replace('bg-', '!bg-')}`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12.5px] pl-1 pr-1">
              <label className="font-semibold text-stone-700">
                Slug (URL path · <span className="text-[11px] text-sky-700">a-z 0-9 hyphen เท่านั้น</span>)
              </label>
              <Badge className={`!border ${slugBadgeClass}`}>
                {slug.length} ตัว · {slugOk ? "✓ ถูกต้อง" : "⚠️ ต้อง a-z-0-9"}
              </Badge>
            </div>
            <input
              value={slug}
              onChange={(e) => {
                let v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
                v = v.replace(/^-+|-+$/g, '').slice(0, 120);
                setSlug(v);
                onValidate?.('slug', v);
              }}
              placeholder='เช่น ราคาบอลไหล-วันนี้-คู่มือ-2569'
              className="w-full !h-11 px-4 rounded-lg border border-stone-200 bg-white text-sm font-mono outline-none focus:ring-2 focus:ring-sky-200"
              maxLength={120}
            />
            <Progress
              value={Math.min(100, (slug.length / 80) * 100)}
              className={`h-2.5 ${slugColor.replace('bg-', '!bg-')}`}
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-white border border-stone-200 rounded-md">
            <CheckCircle2 className="text-emerald-600 size-4 shrink-0" />
            <span>
              Clean markdown (H1..H6 structure 100% no # หลุด) · EEAT Score:
              <b className="text-emerald-700 ml-1">{typeof eeatEst === 'number' ? `${eeatEst}/100` : "—"}</b>
            </span>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-100/60 via-yellow-100/40 to-white border-2 border-amber-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wide text-amber-800 flex items-center gap-1.5">
                <span className="text-[14px]">🏛️</span>
                1. บทความจริง (H1) — ผู้อ่านเห็นบนหน้าเว็บ
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold shadow-sm border border-amber-400/70">
                &lt;h1&gt;
              </span>
            </div>
            <div className="p-4 rounded-lg bg-white/85 border border-amber-200 min-h-[64px] flex items-center">
              {h1Val.trim() ? (
                <h1 className="text-[22px] leading-[1.35] font-black text-amber-950 break-words">
                  {h1Val}
                </h1>
              ) : (
                <div className="text-amber-400 italic text-[13px]">
                  หัวข้อเรื่อง (H1) ยังไม่ถูกตั้งค่า — จะเติมอัตโนมัติจาก Outline Section แรกที่เป็น H1 เมื่อ AI สร้างเสร็จ
                </div>
              )}
            </div>
            <div className="mt-1.5 text-[10.5px] text-amber-800/80 flex items-center justify-between pl-0.5 pr-0.5">
              <span>👀 ปรากฏที่หัวบทความ ก่อนเนื้อหาทุกประเด็น</span>
              <span className="tabular-nums">{h1Len} ตัว</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-br from-sky-100/80 via-white to-sky-50 border-2 border-sky-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wide text-sky-800 flex items-center gap-1.5">
                <span className="text-[14px]">🔍</span>
                2. Google SERP (Meta Title) — ผู้ใช้เห็นบนผลการค้นหา
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-200 text-sky-900 font-bold shadow-sm border border-sky-400/70">
                &lt;title&gt;
              </span>
            </div>
            <div className="p-4 rounded-lg bg-white border border-sky-200 min-h-[88px]">
              <div className="text-[15px] font-bold text-sky-800 mb-1 leading-snug break-words">
                {mt || <span className="text-sky-400 italic">Meta Title ยังไม่ถูกตั้งค่า (ควร 30-60 ตัวอักษร)</span>}
              </div>
              <div className="text-[11px] text-emerald-700 mb-2 truncate">
                thaiaeo.manus.host › blog › {(keyword || "article-slug").trim().replace(/\s+/g, "-").slice(0, 80)}
              </div>
              <div className="text-[13px] text-stone-700 leading-snug break-words">
                {mdes || <span className="text-stone-400 italic">Meta Description ยังไม่ถูกตั้งค่า — คำบรรยายจะปรากฏตรงนี้บนหน้าผลการค้นหา Google (ควร 120-320 ตัว)</span>}
              </div>
            </div>
            <div className="mt-1.5 text-[10.5px] text-sky-800/80 flex items-center justify-between pl-0.5 pr-0.5">
              <span>🔝 Title 30-60 / Desc 120-320 ตัวอักษรสุดท้าย</span>
              <span className="tabular-nums">title {mt.length}/60 · desc {mdes.length}/320</span>
            </div>
          </div>
        </div>

        <div className="text-[11px] px-3 py-2 rounded-lg bg-stone-100/80 border border-stone-200 text-stone-600">
          💡 <b className="text-stone-800">ความแตกต่างสำคัญ:</b>
          <span className="text-amber-800 font-semibold"> H1 (ซ้าย)</span> ใช้บอกคนอ่านว่าบทความนี้คืออะไร (ยาวได้ 40–512 ตัว) ส่วน
          <span className="text-sky-800 font-semibold"> Meta Title (ขวา)</span> ใช้ดึงดูดผู้ใช้กดคลิกจากหน้า Google (สั้น ≤60 ตัว) — สามารถใช้คนละสำนวนกันได้เลย
        </div>
      </CardContent>
    </Card>
  );
}
