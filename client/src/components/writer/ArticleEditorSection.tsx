import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FileText, Eye, BookCheck, Type, Hash,
} from "lucide-react";
import { renderMdSafe } from "@/hooks/useArticleWriter";

export type EditorPreviewMode = "editor" | "split" | "preview";

export interface ArticleEditorSectionProps {
  markdown: string;
  setMarkdown: (v: string) => void;
  previewMode: EditorPreviewMode;
  setPreviewMode: (m: EditorPreviewMode) => void;
  seoScore?: number;
  wordCount?: number;
  charCount?: number;
  title?: string;
  mt?: string;
  mdes?: string;
  slug?: string;
  keyword?: string;
}

export default function ArticleEditorSection({
  markdown,
  setMarkdown,
  previewMode,
  setPreviewMode,
  seoScore,
  wordCount,
  charCount,
  title,
  mt,
  mdes,
  keyword,
}: ArticleEditorSectionProps) {
  const renderedHtml = useMemo(() => renderMdSafe(markdown || ""), [markdown]);

  const seoColor = typeof seoScore === "number"
    ? seoScore >= 80 ? "bg-emerald-600" : seoScore >= 60 ? "bg-amber-600" : "bg-rose-600"
    : "bg-stone-400";

  const seoTextColor = typeof seoScore === "number"
    ? seoScore >= 80 ? "text-emerald-700" : seoScore >= 60 ? "text-amber-700" : "text-rose-700"
    : "text-stone-500";

  const seoLabel = typeof seoScore === "number"
    ? seoScore >= 80 ? "✨ ดีมาก" : seoScore >= 60 ? "🙂 ดี" : "⚠️ ต้องปรับปรุง"
    : "—";

  return (
    <Card className="!rounded-2xl !border !border-stone-200 !bg-white">
      <CardContent className="p-0 overflow-hidden">
        <div className="p-4 border-b border-stone-200 bg-gradient-to-br from-stone-50 to-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Type className="size-5 text-amber-700" />
            <h2 className="text-lg font-bold">บทความ Editor</h2>
            <span className="text-[12px] text-stone-500">
              Markdown ซ้าย · Live Preview ขวา
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {typeof wordCount === "number" && (
              <Badge variant="outline" className="!border-stone-300 !text-stone-700">
                <FileText className="size-3 mr-1.5" />
                {wordCount.toLocaleString()} คำ
              </Badge>
            )}
            {typeof charCount === "number" && (
              <Badge variant="outline" className="!border-stone-300 !text-stone-600">
                <Hash className="size-3 mr-1.5" />
                {charCount.toLocaleString()} ตัวอักษร
              </Badge>
            )}
            {typeof seoScore === "number" && (
              <Badge
                className={`!border ${
                  seoScore >= 80
                    ? "!bg-emerald-50 !border-emerald-200 !text-emerald-800"
                    : seoScore >= 60
                    ? "!bg-amber-50 !border-amber-200 !text-amber-800"
                    : "!bg-rose-50 !border-rose-200 !text-rose-800"
                }`}
              >
                <BookCheck className="size-3 mr-1.5" />
                SEO: {seoScore}/100 · {seoLabel}
              </Badge>
            )}

            <div className="w-24 h-6 rounded-full overflow-hidden bg-stone-200 border border-stone-300">
              <div
                className={`h-full transition-all duration-500 ${seoColor}`}
                style={{ width: `${Math.max(0, Math.min(100, seoScore ?? 0))}%` }}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-stone-100 bg-stone-50/50">
          <Tabs
            value={previewMode}
            onValueChange={(v) => setPreviewMode(v as EditorPreviewMode)}
            className="w-full"
          >
            <TabsList className="grid grid-cols-3 max-w-md">
              <TabsTrigger value="editor" className="text-sm">
                ✏️ Editor เท่านั้น
              </TabsTrigger>
              <TabsTrigger value="split" className="text-sm">
                📑 Split (แยก 2 หน้าต่าง)
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-sm">
                👁️ Preview เท่านั้น
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="min-h-[520px]">
          {previewMode === "editor" && (
            <EditorPane markdown={markdown} setMarkdown={setMarkdown} />
          )}

          {previewMode === "preview" && (
            <PreviewPane renderedHtml={renderedHtml} mt={mt} keyword={keyword} />
          )}

          {previewMode === "split" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              <div className="border-r border-stone-200">
                <EditorPane markdown={markdown} setMarkdown={setMarkdown} split />
              </div>
              <div>
                <PreviewPane renderedHtml={renderedHtml} mt={mt} keyword={keyword} split />
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-stone-200 bg-stone-50/80 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-stone-500">
          <div className="flex items-center gap-3 flex-wrap">
            <span>💡 Markdown: # H1 / ## H2 / ### H3 / **หนา** / *เอียง* / `โค้ด` / [Anchor](url) / - bullet</span>
          </div>
          <div className="flex items-center gap-3">
            {title && (
              <span className="px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-600 truncate max-w-[200px]">
                Title: {title.slice(0, 40)}{title.length > 40 ? "…" : ""}
              </span>
            )}
            {mdes && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-600 truncate max-w-[200px]">
                MDes: {mdes.slice(0, 40)}{mdes.length > 40 ? "…" : ""}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditorPane({
  markdown,
  setMarkdown,
  split = false,
}: {
  markdown: string;
  setMarkdown: (v: string) => void;
  split?: boolean;
}) {
  return (
    <div className={`${split ? "" : ""}`}>
      <div className={`p-2 text-[11px] uppercase tracking-wider text-stone-500 font-semibold border-b border-stone-100 bg-stone-50/70 flex items-center justify-between`}>
        <span>📝 Markdown Source (แก้ไขตรงนี้)</span>
        <span className="tabular-nums text-stone-400">
          {markdown.length.toLocaleString()} chars
        </span>
      </div>
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        className={`w-full p-4 font-mono text-[13px] leading-7 outline-none resize-none bg-white focus:bg-stone-50/40 text-stone-800 ${split ? "min-h-[480px]" : "min-h-[520px]"}`}
        placeholder={`# หัวข้อหลัก H1\n\nเนื้อหาบทนำ...\n\n## หัวข้อย่อย H2\n\nเนื้อหา Section 2 ส่วนหนึ่ง...\n\n- จุดที่ 1\n- จุดที่ 2\n- จุดที่ 3\n\n### หัวข้อย่อย H3\n\nเนื้อหาย่อย ฯลฯ`}
        spellCheck={false}
      />
    </div>
  );
}

function PreviewPane({
  renderedHtml,
  mt,
  keyword,
  split = false,
}: {
  renderedHtml: string;
  mt?: string;
  keyword?: string;
  split?: boolean;
}) {
  const safeMt = mt || keyword || "";
  return (
    <div className={`${split ? "" : ""}`}>
      <div className="p-2 text-[11px] uppercase tracking-wider text-stone-500 font-semibold border-b border-stone-100 bg-stone-50/70 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Eye className="size-3" /> Live Preview (เหมือนหน้าเว็บจริง)
        </span>
        <span className="text-stone-400">HTML rendered</span>
      </div>
      <div className={`p-6 overflow-y-auto bg-white ${split ? "max-h-[560px]" : "max-h-[640px]"}`}>
        {safeMt && (
          <div className="mb-4 pb-3 border-b border-dashed border-stone-200">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 mb-1">Meta Title (แสดงใน SERP)</div>
            <div className="text-[17px] font-bold text-sky-800 leading-snug break-words">
              {safeMt}
            </div>
          </div>
        )}
        <article
          className="prose prose-stone max-w-none text-[14.5px] leading-7 prose-headings:font-black prose-h1:text-[26px] prose-h1:text-stone-900 prose-h2:text-[20px] prose-h2:text-stone-800 prose-h2:pb-2 prose-h2:border-b prose-h2:border-stone-200 prose-h3:text-[16.5px] prose-h3:text-stone-800 prose-h4:text-[15px] prose-p:my-3 prose-li:my-0.5 prose-strong:text-stone-800 prose-blockquote:border-rose-400 prose-blockquote:text-rose-900 prose-blockquote:bg-rose-50 prose-blockquote:py-3 prose-blockquote:rounded-r prose-code:text-rose-700 prose-code:bg-stone-100 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-a:text-sky-700 prose-a:underline prose-a:underline-offset-2"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    </div>
  );
}
