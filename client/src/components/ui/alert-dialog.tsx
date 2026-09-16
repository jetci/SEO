import * as React from "react";
import { cn } from "@/lib/utils";

type DialogStateContext = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const AlertDialogCtx = React.createContext<DialogStateContext | undefined>(undefined);

export const AlertDialog: React.FC<{ open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }> = ({ open: openProp, defaultOpen, onOpenChange, children }) => {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const open = openProp !== undefined ? openProp : uncontrolled;
  const handleChange = (v: boolean) => {
    if (openProp === undefined) setUncontrolled(v);
    onOpenChange?.(v);
  };
  return <AlertDialogCtx.Provider value={{ open, onOpenChange: handleChange }}>{children}</AlertDialogCtx.Provider>;
};

function useAlertDialog() {
  const ctx = React.useContext(AlertDialogCtx);
  if (!ctx) throw new Error("AlertDialog subcomponents must be wrapped in <AlertDialog>");
  return ctx;
}

export const AlertDialogTrigger: React.FC<React.HTMLAttributes<HTMLElement> & { asChild?: boolean }> = ({ className, children, asChild, onClick, ...rest }) => {
  const { onOpenChange } = useAlertDialog();
  const handleClick = (e: React.MouseEvent) => {
    (onClick as any)?.(e);
    if (!e.defaultPrevented) onOpenChange(true);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, { ...rest, onClick: handleClick } as any);
  }
  return <button type="button" className={className} onClick={handleClick} {...rest as any}>{children}</button>;
};

export const AlertDialogPortal: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  if (typeof document === "undefined") return null;
  return ReactDOMCreatePortal(children, document.body);
};

function ReactDOMCreatePortal(node: React.ReactNode, el: HTMLElement) {
  return <PortalHost mount={el}>{node}</PortalHost>;
}

const PortalHost: React.FC<{ mount: HTMLElement; children?: React.ReactNode }> = ({ children }) => <>{children}</>;

export const AlertDialogOverlay = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, onClick, ...props }, ref) => {
  const { onOpenChange } = useAlertDialog();
  return (
    <div
      ref={ref}
      onClick={(e) => {
        (onClick as any)?.(e);
        if (!e.defaultPrevented) onOpenChange(false);
      }}
      className={cn("fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", className)}
      {...props}
    />
  );
});
AlertDialogOverlay.displayName = "AlertDialogOverlay";

export const AlertDialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => {
  const { open } = useAlertDialog();
  if (!open) return null;
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out sm:rounded-lg",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = "AlertDialogContent";

export const AlertDialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);

export const AlertDialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);

export const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h2 ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

export const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

export const AlertDialogAction = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, onClick, ...props }, ref) => {
  const { onOpenChange } = useAlertDialog();
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        (onClick as any)?.(e);
        if (!e.defaultPrevented) onOpenChange(false);
      }}
      className={cn("inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    />
  );
});
AlertDialogAction.displayName = "AlertDialogAction";

export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(({ className, onClick, ...props }, ref) => {
  const { onOpenChange } = useAlertDialog();
  return (
    <button
      ref={ref}
      type="button"
      onClick={(e) => {
        (onClick as any)?.(e);
        if (!e.defaultPrevented) onOpenChange(false);
      }}
      className={cn("mt-2 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mt-0", className)}
      {...props}
    />
  );
});
AlertDialogCancel.displayName = "AlertDialogCancel";
