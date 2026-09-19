import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Search, Copy, CheckCheck, FilePenLine, Loader2 } from "lucide-react";
import { INTENTS } from "./ClusterTierBadges";
import type { ComponentType } from "react";

export type KeywordCardRow = {
  id: string;
  keywordId: number;
  keyword: string;
  tier: string;
  intent: string;
  kd: number;
  vol: number;
  style: {
    label: string;
    bg: string;
    text: string;
    border: string;
    icon: ComponentType<{ className?: string; style?: any }>;
  };
};

type KeywordTableViewProps = {
  allCards: KeywordCardRow[];
  loading?: boolean;
  isUserAdminOrOwner: boolean;
  selectedIds: Set<number>;
  runningKwIds?: Set<number>;
  writePending?: boolean;
  onToggleSelect: (id: number) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onWriteClick?: (card: KeywordCardRow) => void;
  onSerpPreviewClick?: (card: KeywordCardRow) => void;
  onCopyClick?: (card: KeywordCardRow) => void;
  onDeleteClick?: (card: KeywordCardRow) => void;
  copiedId?: string | null;
};

export default function KeywordTableView(props: KeywordTableViewProps) {
  const {
    allCards, loading = false, isUserAdminOrOwner, selectedIds,
    runningKwIds = new Set<number>(), writePending = false,
    onToggleSelect, onSelectAll, onClearSelection,
    onWriteClick, onSerpPreviewClick, onCopyClick, onDeleteClick,
    copiedId = null,
  } = props;

  const hasSelectable = allCards.filter(c => Number(c.keywordId) > 0).length > 0;
  const allSelected = hasSelectable && selectedIds.size === allCards.filter(c => Number(c.keywordId) > 0).length;

  function toggleSelectAll() {
    if (allSelected) {
      if (onClearSelection) onClearSelection();
    } else {
      if (onSelectAll) onSelectAll();
    }
  }

  return (
    <div className="border border-stone-200 rounded-2xl overflow-hidden bg-white">
      <div className="grid grid-cols-12 border-b border-stone-200 bg-white/80 text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
        {isUserAdminOrOwner && (
          <div className="col-span-1 p-3 border-r border-stone-200 text-center">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleSelectAll}
            />
          </div>
        )}
        <div className={`${isUserAdminOrOwner ? 'col-span-4' : 'col-span-5'} p-3 border-r border-stone-200`}>Keyword</div>
        <div className="col-span-2 p-3 border-r border-stone-200 text-center">Tier / Intent</div>
        <div className="col-span-1 p-3 border-r border-stone-200 text-right">KD</div>
        <div className="col-span-1 p-3 border-r border-stone-200 text-right">Vol</div>
        <div className={`${isUserAdminOrOwner ? 'col-span-3' : 'col-span-3'} p-3 text-center`}>Action</div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {loading && allCards.length === 0 && (
          <div className="rounded-lg">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`skel-t-${i}`} className="grid grid-cols-12 border-b border-stone-100 animate-pulse">
                {isUserAdminOrOwner && <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-center"><div className="w-4 h-4 rounded bg-stone-200" /></div>}
                <div className={`${isUserAdminOrOwner ? 'col-span-4' : 'col-span-5'} p-3 border-r border-stone-100 flex items-center gap-2`}>
                  <div className="w-4 h-4 rounded bg-stone-200 shrink-0" />
                  <div className="h-4 w-3/4 rounded bg-stone-200" />
                </div>
                <div className="col-span-2 p-3 border-r border-stone-100 grid place-items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-4 rounded bg-stone-200" />
                    <div className="w-16 h-3 rounded bg-stone-100" />
                  </div>
                </div>
                <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-end">
                  <div className="w-10 h-4 rounded bg-stone-200" />
                </div>
                <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-end">
                  <div className="w-12 h-4 rounded bg-stone-100" />
                </div>
                <div className={`${isUserAdminOrOwner ? 'col-span-3' : 'col-span-3'} p-3 flex items-center justify-center gap-1.5`}>
                  <div className="h-8 w-24 rounded bg-stone-200" />
                  <div className="h-8 w-8 rounded bg-stone-100" />
                  <div className="h-8 w-8 rounded bg-stone-100" />
                  <div className="h-8 w-8 rounded bg-stone-200" />
                </div>
              </div>
            ))}
          </div>
        )}
        {allCards.map((c) => {
          const intent = INTENTS.find(i => i.key === c.intent) ?? INTENTS[3];
          const busy = runningKwIds.has(Number(c.keywordId)) || writePending;
          const btnLabel = "เขียนบท";
          const BtnIcon = FilePenLine;
          const btnClass = "!bg-emerald-700 hover:!bg-emerald-800 text-white";
          const sel = selectedIds.has(Number(c.keywordId));
          return (
            <div
              key={c.id}
              className={`grid grid-cols-12 border-b border-stone-100 last:border-b-0 hover:bg-amber-50/40 transition-colors text-[13px] ${sel ? '!bg-amber-50' : ''}`}
            >
              {isUserAdminOrOwner && (
                <div className="col-span-1 p-3 border-r border-stone-100 grid place-items-center">
                  <Checkbox
                    checked={sel}
                    onCheckedChange={() => onToggleSelect(Number(c.keywordId))}
                    aria-label={`Select ${c.keyword}`}
                  />
                </div>
              )}
              <div className={`${isUserAdminOrOwner ? 'col-span-4' : 'col-span-5'} p-3 border-r border-stone-100 flex items-center gap-2`}>
                <c.style.icon className="size-4" style={{ color: c.style.border }} aria-hidden />
                <span className="font-medium text-stone-800 truncate">{c.keyword}</span>
              </div>
              <div className="col-span-2 p-3 border-r border-stone-100 text-center">
                <div className="inline-flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-bold" style={{ backgroundColor: c.style.bg, color: c.style.text }}>
                    {c.style.label}
                  </span>
                  <span className="text-[12px]" style={{ color: intent.color }}>● {intent.label}</span>
                </div>
              </div>
              <div className="col-span-1 p-3 border-r border-stone-100 text-right font-mono text-[12.5px] font-semibold"
                title={Number(c.kd || 0) > 0 ? `Keyword Difficulty ${Number(c.kd)}%` : 'รอ Enrich SERP'}>
                {Number(c.kd || 0) > 0 ? `${c.kd}%` : <span className="text-stone-400">-</span>}
              </div>
              <div className="col-span-1 p-3 border-r border-stone-100 text-right font-mono text-[12.5px]"
                title={Number(c.vol || 0) > 0 ? `Search Volume ${Number(c.vol).toLocaleString()} คำต่อเดือน` : 'ยังไม่มีข้อมูล'}>
                {Number(c.vol || 0) > 0 ? <span className="text-stone-700">{c.vol.toLocaleString()}</span> : <span className="text-stone-400">-</span>}
              </div>
              <div className={`${isUserAdminOrOwner ? 'col-span-3' : 'col-span-3'} p-3 text-center flex items-center justify-center gap-1.5`}>
                <Button
                  size="sm"
                  className={`!h-8 !rounded-lg !px-2.5 !text-[11.5px] font-semibold shadow-sm ${btnClass}`}
                  onClick={() => onWriteClick && onWriteClick(c)}
                  disabled={!isUserAdminOrOwner || busy}
                  title="คลิกเดียว: สร้าง/เปิด Draft + เปิดหน้าเขียน"
                  aria-label={`เขียนบทความ ${c.keyword}`}
                >
                  {busy && runningKwIds.has(Number(c.keywordId))
                    ? <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    : <BtnIcon className="size-3.5 mr-1.5" aria-hidden />}
                  {busy && runningKwIds.has(Number(c.keywordId)) ? "กำลังทำ..." : btnLabel}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-sky-700 hover:!bg-sky-50"
                  onClick={() => onSerpPreviewClick && onSerpPreviewClick(c)}
                  title="SERP Preview: Top10 + PAA"
                  aria-label="SERP preview"
                >
                  <Search className="size-3.5" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`!h-8 !rounded-lg !px-2 !text-[11.5px] ${copiedId === String(c.id) ? 'text-emerald-700' : 'text-stone-600'}`}
                  onClick={() => onCopyClick && onCopyClick(c)}
                  aria-label={copiedId === String(c.id) ? "คัดลอกลิงก์แล้ว" : "คัดลอกลิงก์ keyword"}
                >
                  {copiedId === String(c.id)
                    ? <CheckCheck className="size-3.5 mr-1 inline" aria-hidden />
                    : <Copy className="size-3.5 mr-1 inline" aria-hidden />}
                </Button>
                {isUserAdminOrOwner && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!h-8 !rounded-lg !px-2 !text-[11.5px] text-rose-600"
                    onClick={() => onDeleteClick && onDeleteClick(c)}
                    disabled={busy}
                    aria-label={`ลบ ${c.keyword}`}
                  >
                    🗑️
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {allCards.length === 0 && !loading && (
          <div className="p-10 text-center text-stone-500 text-[13px]">ไม่มีข้อมูล — คลิก Import CSV หรือ Add Keyword</div>
        )}
      </div>
    </div>
  );
}
