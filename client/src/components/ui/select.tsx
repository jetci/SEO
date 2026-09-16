import * as React from "react";
import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  onValueChange?: (value: string) => void;
};

function collectWrapperProps(node: React.ReactNode): Record<string, any> {
  const out: Record<string, any> = {};
  React.Children.forEach(node, (child) => {
    if (child == null || typeof child !== "object") return;
    const c = child as any;
    if (c.props) {
      const keys = [
        "id", "aria-label", "aria-labelledby", "aria-describedby",
        "disabled", "required", "name", "form", "autoComplete",
        "aria-required", "aria-invalid", "aria-expanded", "aria-haspopup",
        "aria-controls", "aria-owns", "aria-activedescendant",
        "aria-autocomplete", "aria-multiselectable", "aria-placeholder",
        "aria-roledescription", "title", "tabIndex", "lang", "dir",
      ];
      for (const k of keys) {
        if (c.props[k] !== undefined && out[k] === undefined) out[k] = c.props[k];
      }
      const nested = collectWrapperProps(c.props.children);
      for (const k of Object.keys(nested)) {
        if (out[k] === undefined) out[k] = nested[k];
      }
    }
  });
  return out;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, onValueChange, value, defaultValue, onChange, ...props }, ref) => {
    const collected = collectWrapperProps(children);
    const mergedProps = { ...collected, ...props };
    const handleChange = onChange ?? ((e: React.ChangeEvent<HTMLSelectElement>) => {
      onValueChange?.(e.target.value);
    });
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        {...mergedProps}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

type WrapperProps = {
  children?: React.ReactNode;
  className?: string;
  ref?: React.Ref<HTMLElement>;
  [key: string]: any;
};

const SelectTrigger: React.FC<WrapperProps> = ({ className, children, ...rest }) => (
  <>{children}</>
);
SelectTrigger.displayName = "SelectTrigger";

const SelectValue = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { placeholder?: string; asChild?: boolean; as?: "span" | "fragment" }>(
  ({ placeholder, children, className, asChild, as, ...props }, ref) => {
    const content = placeholder ?? children;
    if (asChild) return <>{content}</>;
    if (as === "span" || className) {
      return <span ref={ref as React.Ref<HTMLSpanElement>} className={className} {...props}>{content}</span>;
    }
    return <>{content}</>;
  }
);
SelectValue.displayName = "SelectValue";

const SelectContent: React.FC<WrapperProps> = ({ className, children, ...rest }) => (
  <>{children}</>
);
SelectContent.displayName = "SelectContent";

function extractText(node: React.ReactNode): string {
  let s = "";
  React.Children.forEach(node, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (typeof child === "string" || typeof child === "number") {
      s += String(child);
    } else if (Array.isArray(child)) {
      s += extractText(child);
    } else if ("props" in (child as any) && (child as any).props) {
      s += extractText((child as any).props.children);
    }
  });
  return s;
}

const SelectItem = React.forwardRef<HTMLOptionElement, React.OptionHTMLAttributes<HTMLOptionElement>>(
  ({ children, ...rest }, ref) => {
    const text = extractText(children);
    return (
      <option ref={ref} {...rest}>
        {text || children}
      </option>
    );
  }
);
SelectItem.displayName = "SelectItem";

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
