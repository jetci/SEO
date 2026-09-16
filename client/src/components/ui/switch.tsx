import * as React from "react";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (c: boolean) => void }>(
  ({ className, checked, defaultChecked, onCheckedChange, disabled, ...props }, ref) => {
    const [internal, setInternal] = React.useState<boolean>(defaultChecked ?? checked ?? false);
    const value = checked ?? internal;
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={value}
        data-state={value ? "checked" : "unchecked"}
        disabled={disabled}
        onClick={() => {
          const next = !value;
          if (checked === undefined) setInternal(next);
          onCheckedChange?.(next);
        }}
        className={cn(
          "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          value ? "bg-primary" : "bg-input",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
            value ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
