import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ListOrdered, Search, Wand2, RefreshCw, Plus, Minus,
  ChevronUp, ChevronDown, Trash2, GripVertical, CheckCircle2, Loader2
} from "lucide-react";
import { toast } from "sonner";

export type OutlineRowEditor = {
  heading_level: 1 | 2 | 3 | 4 | 5 | 6;
  heading_text: string;
  word_target_min: number;
  word_target_max: number;
  key_points: string[];
};

export type SourceRowEditor = {
  domain: string;
  title: string;
  da: number;
  pass: boolean;
  id?: number;
  url?: string;
  snippet?: string;
};

export interface OutlineEditorSectionProps {
  outlineJson: OutlineRowEditor[];
  setOutlineJson: (v: OutlineRowEditor[] | ((prev: OutlineRowEditor[]) => OutlineRowEditor[])) => void;
  onGenerate: (force?: boolean) => void;
  onAuto?: () => void;
  running: boolean;
  sources?: SourceRowEditor[];
  setSources?: (v: SourceRowEditor[]) => void;
  fetchingSources?: boolean;
  onRefreshSources?: () => void;
  keyword?: string;
  genOutlinePending?: boolean;
  onSyncH1?: (h1Text: string) => void;
}

export default function OutlineEditorSection({
  outlineJson,
  setOutlineJson,
  onGenerate,
  running,
  sources = [],
  setSources,
  fetchingSources = false,
  onRefreshSources,
  keyword,
  genOutlinePending = false,
  onSyncH1,
}: OutlineEditorSectionProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [accordionValue, setAccordionValue] = useState<string>("outline");

  function addOutlineRow(level: OutlineRowEditor["heading_level"] = 2) {
    setOutlineJson(prev => [...prev, {
      heading_level: level,
      heading_text: 'หัวข้อใหม่',
      word_target_min: level === 2 ? 200 : 120,
      word_target_max: level === 2 ? 350 : 220,
      key_points: [],
    }]);
  }

  function setOutlineText(idx: number, v: string) {
    setOutlineJson(prev => {
      const n = [...prev];
      n[idx] = { ...n[idx], heading_text: v };
      return n;
    });
  }

  function setOutlineLevel(idx: number, lv: number) {
    setOutlineJson(prev => {
      const n = [...prev];
      n[idx] = { ...n[idx], heading_level: Math.max(1, Math.min(6, Number(lv))) as OutlineRowEditor['heading_level'] };
      return n;
    });
  }

  function delOutlineRow(idx: number) {
    if (outlineJson.length <= 2) {
      toast.error('Outline ต้องมีอย่างน้อย 2 หัวข้อ');
      return;
    }
    setOutlineJson(prev => prev.filter((_, i) => i !== idx));
  }

  function moveOutlineUp(idx: number) {
    if (idx <= 0) return;
    setOutlineJson(prev => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  }

  function moveOutlineDown(idx: number) {
    if (idx >= outlineJson.length - 1) return;
    setOutlineJson(prev => {
      const arr = [...prev];
      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
      return arr;
    });
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }

  function handleDragLeave() { setDragOverIdx(null); }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    setOutlineJson(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      let target = idx;
      if (dragIdx < idx) target = idx - 1;
      arr.splice(target, 0, moved);
      return arr;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null); }

  function toggleSelectRow(idx: number) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRows.size === outlineJson.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(outlineJson.map((_, i) => i)));
    }
  }

  function batchDelete() {
    if (selectedRows.size === 0) { toast.error('ยังไม่ได้เลือกแถวที่จะลบ'); return; }
    const remain = outlineJson.length - selectedRows.size;
    if (remain < 2) { toast.error('Outline ต้องมีอย่างน้อย 2 หัวข้อ'); return; }
    setOutlineJson(prev => prev.filter((_, i) => !selectedRows.has(i)));
    setSelectedRows(new Set());
    toast.success(`ลบสำเร็จ ${selectedRows.size} แถว`);
  }

  function batchChangeLevel(lv: number) {
    if (selectedRows.size === 0) { toast.error('ยังไม่ได้เลือกแถว'); return; }
    setOutlineJson(prev => {
      const arr = [...prev];
      selectedRows.forEach(i => {
        if (arr[i]) {
          const newLv = Math.max(1, Math.min(6, lv));
          if (newLv !== 1) {
            arr[i] = { ...arr[i], heading_level: newLv as OutlineRowEditor['heading_level'] };
          }
        }
      });
      return arr;
    });
    toast.success(`เปลี่ยน Level เป็น H${lv} สำหรับ ${selectedRows.size} แถว`);
  }

  return (
    <div className="space-y-5">
      <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ListOrdered className="size-5 text-amber-700" />3️⃣ โครงเรื่อง (Outline)
          </h2>
          <p className="text-[13px] text-stone-500 -mt-2">AI สร้างโครงจาก keyword + intent — ดู/แก้ก่อนเขียน</p>
          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              className="!bg-amber-700 hover:!bg-amber-800"
              onClick={() => onGenerate(false)}
              disabled={genOutlinePending || running}
            >
              {genOutlinePending
                ? <><Loader2 className="size-4 mr-2 animate-spin" />กำลังสร้าง Outline…</>
                : <><Wand2 className="size-4 mr-2" />🪄 AI สร้าง Outline</>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onGenerate(true)}
              disabled={genOutlinePending || running}
            >
              <RefreshCw className={`size-4 mr-2 ${genOutlinePending ? 'animate-spin' : ''}`} />🔁 สร้างใหม่ (Force)
            </Button>
            <Button size="sm" variant="outline" onClick={() => addOutlineRow(2)}>
              <Plus className="size-4 mr-2" />+ H2
            </Button>
            <Button size="sm" variant="outline" onClick={() => addOutlineRow(3)}>
              <Plus className="size-4 mr-2" />+ H3
            </Button>
            <Separator orientation="vertical" className="h-8" />
            <Button
              size="sm"
              variant="outline"
              onClick={toggleSelectAll}
              className={selectedRows.size === outlineJson.length ? '!bg-amber-50 !border-amber-300' : ''}
            >
              {selectedRows.size === outlineJson.length ? '☑️ ไม่เลือกทั้งหมด' : '⬜ เลือกทั้งหมด'}
              {selectedRows.size > 0 && <Badge className="!ml-2 !bg-amber-600 !text-white">{selectedRows.size}</Badge>}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={batchDelete}
              disabled={selectedRows.size === 0}
              className="!text-rose-700 hover:!bg-rose-50 !border-rose-200 disabled:opacity-40"
            >
              <Trash2 className="size-4 mr-2" />ลบที่เลือก
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => batchChangeLevel(2)}
              disabled={selectedRows.size === 0}
              className="disabled:opacity-40"
            >
              → H2
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => batchChangeLevel(3)}
              disabled={selectedRows.size === 0}
              className="disabled:opacity-40"
            >
              → H3
            </Button>
          </div>

          <Accordion
            type="single"
            collapsible
            value={accordionValue}
            onValueChange={setAccordionValue}
            className="w-full space-y-2"
          >
            <AccordionItem value="outline" className="border-none">
              <AccordionTrigger className="py-2 hover:no-underline">
                <span className="text-[12.5px] font-semibold text-stone-700">
                  📝 {outlineJson.length} Sections · H1={outlineJson.filter(s => s.heading_level === 1).length} · H2={outlineJson.filter(s => s.heading_level === 2).length} · H3+={outlineJson.filter(s => s.heading_level >= 3).length}
                  <span className="ml-2 text-stone-400 font-normal">(คลิกเพื่อขยาย/ย่อ)</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  {genOutlinePending ? (
                    <div className="kcp-skeleton-shimmer rounded-xl p-4 space-y-3">
                      <div className="h-10 bg-stone-200 rounded-lg w-full"></div>
                      <div className="h-10 bg-stone-200 rounded-lg w-11/12 ml-4"></div>
                      <div className="h-10 bg-stone-200 rounded-lg w-10/12 ml-4"></div>
                      <div className="h-10 bg-stone-200 rounded-lg w-9/12 ml-8"></div>
                      <div className="h-10 bg-stone-200 rounded-lg w-2/3 ml-8"></div>
                    </div>
                  ) : outlineJson.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/50 p-8 text-center text-stone-500">
                      <div className="text-[13px] mb-1">ยังไม่มีหัวข้อ Outline</div>
                      <div className="text-[11px] text-stone-400">กดปุ่ม 🪄 AI สร้าง Outline ด้านบน หรือกด + H2 เพิ่มเอง</div>
                    </div>
                  ) : outlineJson.map((sec, i) => {
                    const lvText = `H${sec.heading_level}`;
                    const isH1 = sec.heading_level === 1;
                    const isDragging = dragIdx === i;
                    const isDragOver = dragOverIdx === i;
                    const isSelected = selectedRows.has(i);
                    return (
                      <div
                        key={i}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, i)}
                        className={`border rounded-xl p-2.5 flex items-center gap-2 transition ${
                          isH1 ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'
                        } ${isDragging ? 'opacity-50' : ''} ${
                          isDragOver && !isDragging ? 'border-t-4 !border-t-amber-500' : ''
                        } ${isSelected ? '!ring-2 !ring-amber-400' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(i)}
                          className="w-4 h-4 accent-amber-600 shrink-0 cursor-pointer"
                          aria-label={`เลือกแถว ${i + 1}`}
                        />
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, i)}
                          onDragEnd={handleDragEnd}
                          className="cursor-grab active:cursor-grabbing shrink-0 select-none"
                          title="ลากเพื่อจัดลำดับ"
                        >
                          <GripVertical className={`size-4 shrink-0 ${isDragging ? 'text-amber-600' : 'text-stone-400 hover:text-stone-600'}`} aria-hidden />
                        </div>
                        {isH1 ? (
                          <div className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-gradient-to-br from-amber-200 via-amber-100 to-yellow-50 border border-amber-400 text-amber-900 text-[11px] font-black shadow-[0_1px_0_rgba(146,64,14,0.2)] shrink-0" title="หัวข้อหลักของบทความ ควรมีเพียง 1 อัน">
                            <span className="text-[13px] leading-none">🏛️</span>
                            <span className="tracking-wide">H1 · PILLAR</span>
                          </div>
                        ) : (
                          <select
                            value={sec.heading_level}
                            onChange={(e) => setOutlineLevel(i, Number(e.target.value))}
                            className={`h-8 text-[11px] font-bold px-2 rounded-md border-none outline-none cursor-pointer bg-orange-100 text-orange-800`}
                            aria-label={`Heading level row ${i + 1}`}
                          >
                            {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>H{n}</option>)}
                          </select>
                        )}
                        <input
                          value={sec.heading_text}
                          onChange={(e) => setOutlineText(i, e.target.value)}
                          onBlur={(e) => {
                            if (isH1) {
                              const nv = e.target.value.trim();
                              onSyncH1?.(nv);
                            }
                          }}
                          className={`flex-1 !h-9 px-3 rounded-lg text-sm bg-white outline-none focus:ring-2 ${isH1 ? 'border-2 border-amber-300 focus:ring-amber-200 font-bold text-amber-950' : 'border border-stone-200 focus:ring-amber-200'}`}
                          placeholder={isH1 ? 'หัวข้อเรื่อง H1 (บทความควรมี H1 แค่ 1 อันเดียว) ...' : 'หัวข้อ...'}
                          aria-label={`Outline heading text row ${i + 1}`}
                        />
                        <span className="text-[10px] text-stone-400 hidden sm:block w-14 text-right">
                          ≥{sec.word_target_min} คำ
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="!h-8 !w-8 !p-0 text-stone-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30"
                            onClick={() => moveOutlineUp(i)}
                            disabled={i === 0}
                            aria-label={`ย้ายหัวข้อขึ้น ${i + 1}`}
                            title="ย้ายขึ้น"
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="!h-8 !w-8 !p-0 text-stone-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-30"
                            onClick={() => moveOutlineDown(i)}
                            disabled={i === outlineJson.length - 1}
                            aria-label={`ย้ายหัวข้อลง ${i + 1}`}
                            title="ย้ายลง"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="!h-8 !w-8 !p-0 shrink-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => delOutlineRow(i)}
                            aria-label={`ลบหัวข้อที่ ${i + 1}`}
                          >
                            <Minus className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="text-[11px] text-stone-400 pt-1">
            📝 {outlineJson.length} Sections · H1={outlineJson.filter(s => s.heading_level === 1).length} · H2={outlineJson.filter(s => s.heading_level === 2).length} · H3+={outlineJson.filter(s => s.heading_level >= 3).length}
          </div>
        </CardContent>
      </Card>

      {sources.length > 0 || onRefreshSources ? (
        <Card className="!rounded-2xl !border !border-emerald-200 !bg-emerald-50/30">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Search className="size-5 text-emerald-700" />🔍 หา Sources
                <Badge className="!bg-purple-100 !text-purple-700 !border-purple-200">💜 Sam</Badge>
              </h2>
            </div>
            <p className="text-[13px] text-stone-500 -mt-3">
              ดึงแหล่งอ้างอิงจริงจาก SERP/DataForSEO — จะไปเป็นเอกสารอ้างอิงท้ายบทความ + citation ในเนื้อหา
            </p>
            <div className="space-y-2">
              {sources.length === 0 ? (
                <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/50 p-6 text-center text-stone-500 text-[13px]">
                  ยังไม่มีแหล่งอ้างอิง — กด "ดึง Sources ใหม่" ด้านล่าง
                </div>
              ) : (
                sources.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 border border-emerald-100 bg-white rounded-lg text-sm"
                  >
                    <span className="text-emerald-600"><CheckCircle2 className="size-4" /></span>
                    <b className="text-stone-800">{s.domain}</b>
                    <span className="text-stone-500">— {s.title}</span>
                    <span className="ml-auto text-xs text-stone-500">DA {s.da}</span>
                  </div>
                ))
              )}
            </div>
            {onRefreshSources && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={onRefreshSources}
                >
                  {fetchingSources ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />}
                  🔄 ดึง Sources ใหม่
                </Button>
                {setSources && (
                  <Button size="sm" variant="outline" className="flex-1">
                    + เพิ่มแหล่งเอง
                  </Button>
                )}
              </div>
            )}
            {sources.length >= 3 && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px]">
                ✅ พบ {sources.length} แหล่งน่าเชื่อถือ (DA ≥ 35) — แก้ root cause: บทความจะมี citation จริง → EEAT สูงขึ้น
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
