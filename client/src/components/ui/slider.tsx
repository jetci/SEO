import * as React from "react";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & { value?: number[]; defaultValue?: number[]; onValueChange?: (v: number[]) => void; min?: number; max?: number; step?: number }>(
  ({ className, value, defaultValue, onValueChange, min = 0, max = 100, step = 1, disabled, ...props }, ref) => {
    const [internal, setInternal] = React.useState<number[]>(defaultValue ?? value ?? [0]);
    const current = value ?? internal;
    return (
      <input
        ref={ref as any}
        type="range"
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        value={current[0] ?? 0}
        onChange={(e) => {
          const v = [Number(e.target.value)];
          if (value === undefined) setInternal(v);
          onValueChange?.(v);
        }}
        className={cn("relative flex w-full touch-none select-none items-center accent-primary", className)}
        {...props as any}
      />
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
