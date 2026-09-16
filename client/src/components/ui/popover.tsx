import * as React from "react";
import { cn } from "@/lib/utils";

const Popover = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const PopoverTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(({ asChild: _asChild, ...props }, ref) => <button ref={ref} {...props} />);
PopoverTrigger.displayName = "PopoverTrigger";
const PopoverContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { align?: "start" | "center" | "end"; sideOffset?: number }>(({ className, align, sideOffset = 4, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden", className)}
    {...props}
  />
));
PopoverContent.displayName = "PopoverContent";
const PopoverAnchor = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
