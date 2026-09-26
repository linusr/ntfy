import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import cn from "./cn";

const variants = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  subtle: "bg-accent-soft text-accent hover:brightness-95 dark:hover:brightness-110",
  danger: "bg-danger text-white hover:brightness-95",
};

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-11 px-5 text-base gap-2 rounded-xl",
};

const Button = React.forwardRef(({ variant = "primary", size = "md", asChild = false, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
Button.displayName = "Button";

export default Button;
