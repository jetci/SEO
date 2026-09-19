import { useState, useEffect } from "react";
import { trpc } from "@/trpc";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { TIER_STYLES, type ClusterTier } from "./ClusterTierBadges";

type AddClusterParentType = "top_pillar" | "pillar_parent" | "cluster_parent";

type AddClusterDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId: number | null;
  onAdded?: (clusterId: number) => void;
  parentType?: AddClusterParentType;
  parentId?: number | null;
  parentName?: string;
};

export default function AddClusterDialog(props: AddClusterDialogProps) {
  const { open, onClose, projectId, onAdded, parentType = "top_pillar", parentId = null, parentName } = props;

  const [name, setName] = useState("");
  const clusterCreateMut = trpc.clusters.create.useMutation();

  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const tier: ClusterTier = parentType === "top_pillar" ? "pillar" : parentType === "pillar_parent" ? "cluster" : "supporting";
  const effectiveParentId: number | null = parentType === "top_pillar" ? null : parentId;

  async function submitAdd() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("กรุณากรอกชื่อกลุ่ม"); return; }
    if (!projectId || projectId === 0) return;
    try {
      const res = await clusterCreateMut.mutateAsync({
        projectId: Number(projectId),
        name: trimmed,
        type: tier,
        parentId: effectiveParentId ?? undefined,
      });
      toast.success(`✅ เพิ่มกลุ่ม ${TIER_STYLES[tier].label} ใหม่สำเร็จ: ${trimmed}`);
      onClose();
      const newId = Number((res as any)?.id ?? 0);
      if (newId > 0 && onAdded) onAdded(newId);
    } catch (e: any) {
      toast.error(`❌ เพิ่มกลุ่มล้มเหลว: ${String(e?.message ?? e).slice(0, 160)}`);
    }
  }

  const placeholder =
    parentType === "top_pillar" ? "ชื่อ Pillar เช่น 'การพนันออนไลน์ YMYL'" :
    parentType === "pillar_parent" ? "ชื่อ Cluster เช่น 'สล็อตออนไลน์'" :
    "ชื่อ Supporting เช่น 'วิธีสมัครสมาชิกสล็อต pg'";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="!max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="!text-[15px]">
            {parentType === "top_pillar" && <>สร้าง Pillar ใหม่ (ระดับบนสุด)</>}
            {parentType === "pillar_parent" && <>เพิ่ม Cluster ลงใน Pillar #{parentId ?? ''}</>}
            {parentType === "cluster_parent" && <>เพิ่ม Supporting ลงใน Cluster #{parentId ?? ''}</>}
          </DialogTitle>
          <DialogDescription className="!text-[12.5px] !text-stone-600">
            Tree Structure: <strong>Pillar (บนสุด)</strong> → <strong>Cluster</strong> → <strong>Supporting (ล่างสุด)</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 my-1">
          <div>
            <Label className="!text-[12px] !text-stone-700">ชื่อกลุ่ม (Name)</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitAdd().catch(() => {}); }}
              className="!mt-1 !h-9 !text-[13px]"
              placeholder={placeholder}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              className="!rounded-md !border-0"
              style={{ backgroundColor: TIER_STYLES[tier].bg, color: TIER_STYLES[tier].text }}
            >
              Tier: {TIER_STYLES[tier].label}
            </Badge>
            {parentType !== "top_pillar" && parentName && (
              <span className="text-[12px] text-stone-600 truncate max-w-[240px]">Parent: {parentName}</span>
            )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="!h-8 !text-[12px]">ยกเลิก</Button>
          </DialogClose>
          <Button
            size="sm"
            className="!h-8 !bg-amber-600 hover:!bg-amber-700 !text-[12px] font-semibold"
            onClick={() => submitAdd().catch(() => {})}
            disabled={clusterCreateMut.isPending}
          >
            {clusterCreateMut.isPending
              ? <><Loader2 className="size-3.5 mr-1 animate-spin" /> กำลังสร้าง...</>
              : <><Plus className="size-3.5 mr-1" /> สร้าง</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { AddClusterParentType };
