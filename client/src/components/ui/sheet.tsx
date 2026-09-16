import * as React from "react";
import { cn } from "@/lib/utils";

const Sheet = (props: { children: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) => {
  const { children } = props;
  return <>{children}</>;
};
const SheetTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(({ asChild: _asChild, ...props }, ref) => <button ref={ref} {...props} />);
SheetTrigger.displayName = "SheetTrigger";
const SheetContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { side?: "top" | "bottom" | "left" | "right" }>(({ className, side, ...props }, ref) => (
  <div ref={ref} className={cn("fixed inset-0 z-50 bg-background p-6 shadow-lg border", className)} {...props} />
));
SheetContent.displayName = "SheetContent";
const SheetHeader = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />;
const SheetFooter = (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />;
const SheetTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => <h3 ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />);
SheetTitle.displayName = "SheetTitle";
const SheetDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />);
SheetDescription.displayName = "SheetDescription";
const SheetClose = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, ...props }, ref) => <button ref={ref} {...props} />);
SheetClose.displayName = "SheetClose";

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetClose };
