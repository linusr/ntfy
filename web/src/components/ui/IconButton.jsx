import * as React from "react";
import cn from "./cn";
import Tooltip from "./Tooltip";

/** Icon-only button; `label` is both the accessible name and the tooltip. */
const IconButton = React.forwardRef(({ label, tooltip = true, size = "md", className, children, ...props }, ref) => {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "size-8" : "size-9",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
  return tooltip && label ? <Tooltip content={label}>{button}</Tooltip> : button;
});
IconButton.displayName = "IconButton";

export default IconButton;
