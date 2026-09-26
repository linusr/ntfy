import * as React from "react";
import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import cn from "./cn";

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export const MenuContent = ({ align = "end", className, children, ...props }) => (
  <RadixMenu.Portal>
    <RadixMenu.Content
      align={align}
      sideOffset={6}
      className={cn("z-50 min-w-52 rounded-xl border border-border bg-surface p-1 text-sm text-text shadow-xl", className)}
      {...props}
    >
      {children}
    </RadixMenu.Content>
  </RadixMenu.Portal>
);

export const MenuItem = ({ icon: Icon, danger = false, className, children, ...props }) => (
  <RadixMenu.Item
    className={cn(
      "flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none",
      "data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50",
      danger && "text-danger",
      className,
    )}
    {...props}
  >
    {Icon && <Icon className="size-4 shrink-0 opacity-80" />}
    {children}
  </RadixMenu.Item>
);

export const MenuSeparator = () => <RadixMenu.Separator className="my-1 h-px bg-border" />;

export const MenuLabel = ({ children }) => (
  <RadixMenu.Label className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted">{children}</RadixMenu.Label>
);
