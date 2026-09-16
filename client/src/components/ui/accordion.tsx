import * as React from "react";
import { cn } from "@/lib/utils";

const Accordion = ({ children, type = "single", defaultValue, value, onValueChange }: any) => {
  const [open, setOpen] = React.useState<string[]>(() => {
    const v = value ?? defaultValue;
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  });
  const current = value !== undefined ? (Array.isArray(value) ? value : [value]) : open;
  const setValue = (v: any) => {
    if (value === undefined) {
      const next = Array.isArray(v) ? v : [v];
      setOpen(next);
    }
    onValueChange?.(type === "single" ? (Array.isArray(v) ? v[0] : v) : v);
  };
  const ctx = {
    isOpen: (k: string) => current.includes(k),
    toggle: (k: string) => {
      let next: string[];
      if (type === "single") {
        next = current.includes(k) ? [] : [k];
      } else {
        next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
      }
      setValue(next);
    },
  };
  return <AccordionCtx.Provider value={ctx}>{children}</AccordionCtx.Provider>;
};

const AccordionCtx = React.createContext<{ isOpen: (k: string) => boolean; toggle: (k: string) => void }>({
  isOpen: () => false,
  toggle: () => {},
});

const AccordionItem = ({ children, value, className }: any) => {
  const outer = React.useContext(AccordionCtx);
  return (
    <div data-state={outer.isOpen(value) ? "open" : "closed"} className={cn("border-b", className)} data-value={value} ref={React.useRef(null)}>
      <ItemCtx.Provider value={{ value }}>{children}</ItemCtx.Provider>
    </div>
  );
};
const ItemCtx = React.createContext<{ value: string }>({ value: "" });

const AccordionTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, children, ...props }, ref) => {
  const outer = React.useContext(AccordionCtx);
  const item = React.useContext(ItemCtx);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => outer.toggle(item.value)}
      className={cn("flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all hover:underline text-left", className)}
      {...props}
    >
      {children}
    </button>
  );
});
AccordionTrigger.displayName = "AccordionTrigger";

const AccordionContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const outer = React.useContext(AccordionCtx);
  const item = React.useContext(ItemCtx);
  if (!outer.isOpen(item.value)) return null;
  return (
    <div
      ref={ref}
      className={cn("overflow-hidden text-sm", className)}
      {...props}
    >
      <div className="pb-4 pt-0">{children}</div>
    </div>
  );
});
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
