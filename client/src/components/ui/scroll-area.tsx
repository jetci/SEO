import * as React from "react";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  )
);
ScrollArea.displayName = "ScrollArea";
const ScrollBar = (props: any) => null;
const ScrollAreaThumb = (props: any) => null;
const ScrollAreaCorner = (props: any) => null;
const ScrollAreaViewport = (props: any) => null;

export { ScrollArea, ScrollBar, ScrollAreaThumb, ScrollAreaCorner, ScrollAreaViewport };
