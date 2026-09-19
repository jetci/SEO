import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2 } from "lucide-react";

type StepDef = { n: number; id: string; label: string; desc: string };

const STEPS: StepDef[] = [
  { n: 1, id: "input",    label: "ข้อมูลตั้งต้น",     desc: "Keyword + Intent + AI Model" },
  { n: 2, id: "kwplan",   label: "คำนวณคีย์",      desc: "Target Words + 20/50/30 split" },
  { n: 3, id: "outline",  label: "โครง + Sources",   desc: "Outline H1/H2 + แหล่งอ้างอิง DA≥35" },
  { n: 4, id: "write",    label: "เขียนเนื้อหา",      desc: "เขียนทีละ Section" },
  { n: 5, id: "assemble", label: "รวม + Meta",       desc: "Meta Title + Description" },
  { n: 6, id: "review",   label: "ตรวจ/แก้ไข",       desc: "Density ≤2% + Inline Edit" },
  { n: 7, id: "preview",  label: "ดู + เก็บคลัง",    desc: "SERP preview + Export" },
];

export interface StepProgressBarProps {
  stepStatus: Record<number, any>;
  currentStep: number;
  wordCount?: number;
  savedAt?: string | null;
  status?: string;
  onStepClick?: (stepIdx: number) => void;
}

export default function StepProgressBar({
  stepStatus,
  currentStep,
  wordCount,
  savedAt,
  status,
  onStepClick,
}: StepProgressBarProps) {
  const doneCount = Object.entries(stepStatus).filter(
    ([, s]) => (s as any) === 'done'
  ).length;
  const progressPct = STEPS.length > 0 ? Math.round((doneCount / STEPS.length) * 100) : 0;

  return (
    <Card className="!rounded-2xl !border !border-stone-200 !bg-white mb-5">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-stone-500 font-semibold uppercase tracking-wider">
              Progress Pipeline 7 Steps
            </span>
            {typeof wordCount === 'number' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 font-medium">
                📄 {wordCount.toLocaleString()} คำ
              </span>
            )}
            {savedAt && (
              <span className="text-[10.5px] text-stone-500 flex items-center gap-1">
                {status === 'saving' ? (
                  <>
                    <Loader2 className="size-3 animate-spin text-amber-600" />
                    <span className="text-amber-700 font-medium">กำลังบันทึก…</span>
                  </>
                ) : status === 'saved' ? (
                  <>
                    <CheckCircle2 className="size-3 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">บันทึกแล้ว · {savedAt}</span>
                  </>
                ) : (
                  <>บันทึกล่าสุด: {savedAt}</>
                )}
              </span>
            )}
          </div>
          <div className="text-[11px] text-stone-500 tabular-nums">
            Step {currentStep + 1}/{STEPS.length} · {progressPct}%
          </div>
        </div>

        <Progress value={progressPct} className="h-2" />

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {STEPS.map((s, i) => {
            const active = i === currentStep;
            const done = (stepStatus[s.n] as any) === 'done' || i < currentStep;
            const running = (stepStatus[s.n] as any) === 'running';
            const error = (stepStatus[s.n] as any) === 'error';
            return (
              <div
                key={s.id}
                className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}
                onClick={() => onStepClick?.(i)}
                style={{ cursor: onStepClick ? "pointer" : "default" }}
              >
                <div className="w-full flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-stone-50">
                  <div
                    className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold border-2 ${
                      error
                        ? "bg-rose-600 text-white border-rose-600"
                        : running
                        ? "bg-amber-500 text-white border-amber-500 animate-pulse"
                        : active
                        ? "bg-amber-700 text-white border-amber-700"
                        : done
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-stone-200 text-stone-500 border-stone-200"
                    }`}
                  >
                    {done && !running ? (
                      <CheckCircle2 className="size-5" />
                    ) : running ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      s.n
                    )}
                  </div>
                  <div className="ml-2 hidden sm:block min-w-0">
                    <div
                      className={`text-[13px] truncate ${
                        active
                          ? "text-amber-800 font-semibold"
                          : done
                          ? "text-emerald-800 font-medium"
                          : error
                          ? "text-rose-700 font-medium"
                          : "text-stone-500"
                      }`}
                    >
                      {s.label}
                    </div>
                    <div className="text-[11px] text-stone-400 truncate">{s.desc}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
