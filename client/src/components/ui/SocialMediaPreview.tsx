import React from "react";
import { ImageIcon, Linkedin, Twitter } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type SocialMetadata = {
  title_tag?: string;
  meta_description?: string;
  og_title?: string;
  og_description?: string;
};

export interface SocialMediaPreviewProps {
  title: string;
  content?: string | null;
  metaTags?: SocialMetadata | string | null;
  siteName?: string;
  articleUrl?: string;
}

function parseMetaTags(metaTags?: SocialMetadata | string | null): SocialMetadata {
  if (!metaTags) return {};
  if (typeof metaTags !== "string") return metaTags;
  try {
    const parsed = JSON.parse(metaTags) as unknown;
    return parsed && typeof parsed === "object" ? parsed as SocialMetadata : {};
  } catch {
    return {};
  }
}

function plainExcerpt(content?: string | null): string {
  if (!content) return "เพิ่มคำอธิบายบทความเพื่อให้ผู้อ่านเข้าใจเนื้อหาก่อนคลิกเข้าชม";
  const text = content
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text || "เพิ่มคำอธิบายบทความเพื่อให้ผู้อ่านเข้าใจเนื้อหาก่อนคลิกเข้าชม";
}

function firstImageUrl(content?: string | null): string | null {
  const match = content?.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)[^)]*\)/);
  return match?.[1] ?? null;
}

function PreviewImage({ content }: { content?: string | null }) {
  const imageUrl = firstImageUrl(content);
  if (imageUrl) {
    return <img src={imageUrl} alt="ตัวอย่างรูปประกอบบทความ" className="h-32 w-full rounded-t-lg object-cover" />;
  }
  return (
    <div className="flex h-32 items-center justify-center rounded-t-lg bg-gradient-to-br from-slate-800 via-blue-800 to-indigo-900 text-slate-100">
      <ImageIcon className="mr-2 h-5 w-5" aria-hidden="true" />
      <span className="text-xs">ยังไม่มีรูป Open Graph</span>
    </div>
  );
}

function domainFromUrl(articleUrl?: string) {
  if (!articleUrl) return "sportseeat.manus.space";
  try { return new URL(articleUrl).hostname; } catch { return articleUrl; }
}

export function SocialMediaPreview({
  title,
  content,
  metaTags,
  siteName = "Sports EEAT",
  articleUrl,
}: SocialMediaPreviewProps) {
  const metadata = parseMetaTags(metaTags);
  const socialTitle = metadata.og_title?.trim() || metadata.title_tag?.trim() || title;
  const socialDescription = metadata.og_description?.trim() || metadata.meta_description?.trim() || plainExcerpt(content);
  const domain = domainFromUrl(articleUrl);

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white dark:border-indigo-900 dark:from-indigo-950/20 dark:to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ตัวอย่าง Social Media Preview</CardTitle>
        <CardDescription>ตรวจข้อความ Open Graph ที่ผู้อ่านจะเห็นก่อนเผยแพร่จริง</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3" aria-label="ตัวอย่างการแสดงผลบนโซเชียลมีเดีย">
        <article className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-950" aria-label="ตัวอย่าง Facebook">
          <PreviewImage content={content} />
          <div className="space-y-1 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{domain}</p>
            <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{socialTitle}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{socialDescription}</p>
            <p className="pt-1 text-[11px] font-medium text-[#1877F2]">Facebook · {siteName}</p>
          </div>
        </article>

        <article className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-950" aria-label="ตัวอย่าง X">
          <PreviewImage content={content} />
          <div className="space-y-2 p-3">
            <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{socialTitle}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{socialDescription}</p>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{domain}</span>
              <span className="inline-flex items-center gap-1 font-medium text-slate-900 dark:text-slate-50"><Twitter className="h-3 w-3" aria-hidden="true" /> X</span>
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-950" aria-label="ตัวอย่าง LinkedIn">
          <PreviewImage content={content} />
          <div className="space-y-1 p-3">
            <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-50">{socialTitle}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{socialDescription}</p>
            <div className="flex items-center gap-1 pt-1 text-[11px] text-[#0A66C2]">
              <Linkedin className="h-3 w-3" aria-hidden="true" />
              <span>{siteName} · {domain}</span>
            </div>
          </div>
        </article>
      </CardContent>
    </Card>
  );
}

export default SocialMediaPreview;
