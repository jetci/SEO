import * as React from "react";
import { cn } from "@/lib/utils";

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right"; collapsible?: "icon" | "none" | "offcanvas" }
>(({ className, side = "left", collapsible, children, ...props }, ref) => (
  <div
    ref={ref}
    data-side={side}
    data-collapsible={collapsible}
    className={cn("flex h-full w-64 shrink-0 flex-col gap-2 border-r bg-background p-2", className)}
    {...props}
  >
    {children}
  </div>
));
Sidebar.displayName = "Sidebar";

export const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button ref={ref} type="button" className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent", className)} {...props} />
));
SidebarTrigger.displayName = "SidebarTrigger";

export const SidebarRail = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("h-full w-1 cursor-col-resize", className)} {...props} />
  )
);
SidebarRail.displayName = "SidebarRail";

export const SidebarInset: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex min-h-screen w-full flex-col bg-background", className)} {...props} />
);

export const SidebarProvider: React.FC<React.HTMLAttributes<HTMLDivElement> & { defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }> = ({ className, children, ..._rest }) => (
  <div className={cn("flex min-h-screen w-full bg-background", className)}>{children}</div>
);

export const SidebarContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex flex-1 flex-col gap-2 overflow-auto", className)} {...props} />
);

export const SidebarGroup: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("relative flex w-full min-w-0 flex-col p-2", className)} {...props} />
);

export const SidebarGroupLabel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("px-2 py-1 text-xs font-medium text-muted-foreground", className)} {...props} />
);

export const SidebarGroupContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("mt-1", className)} {...props} />
);

export const SidebarMenu: React.FC<React.HTMLAttributes<HTMLUListElement>> = ({ className, ...props }) => (
  <ul className={cn("flex w-full min-w-0 flex-col gap-1", className)} {...props} />
);

export const SidebarMenuItem: React.FC<React.LiHTMLAttributes<HTMLLIElement>> = ({ className, ...props }) => (
  <li className={cn("group/menu-item relative", className)} {...props} />
);

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; isActive?: boolean; variant?: "default" | "outline" | "ghost"; size?: "default" | "sm" | "lg" }
>(({ className, isActive, variant = "default", size = "default", asChild: _asChild, ...props }, ref) => (
  <button
    ref={ref}
    data-active={isActive}
    data-variant={variant}
    data-size={size}
    type="button"
    className={cn(
      "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent [&>span:last-child]:truncate",
      isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      className
    )}
    {...props}
  />
));
SidebarMenuButton.displayName = "SidebarMenuButton";

export const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; showOnHover?: boolean }
>(({ className, showOnHover, asChild: _asChild, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-none transition-transform focus-visible:ring-2 [&>svg]:size-4",
      showOnHover && "opacity-0 peer-hover/menu-button:opacity-100",
      className
    )}
    {...props}
  />
));
SidebarMenuAction.displayName = "SidebarMenuAction";

export const SidebarMenuBadge: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none", className)} {...props} />
);

export const SidebarMenuSkeleton: React.FC<React.HTMLAttributes<HTMLDivElement> & { showIcon?: boolean }> = ({ className, showIcon = false, ...props }) => (
  <div className={cn("rounded-md bg-sidebar-accent/50 h-8 animate-pulse", className)} {...props} />
);

export const SidebarSeparator: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("mx-2 my-1 h-px shrink-0 bg-sidebar-border", className)} {...props} />
);

export const SidebarHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex flex-col gap-2 p-2", className)} {...props} />
);

export const SidebarFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn("flex flex-col gap-2 p-2", className)} {...props} />
);
