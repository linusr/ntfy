import * as React from "react";
import cn from "./cn";

const controlClass =
  "w-full rounded-xl border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-muted/70 transition-colors " +
  "focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft disabled:opacity-60";

export const Input = React.forwardRef(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(controlClass, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlClass, "min-h-24 py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const NativeSelect = React.forwardRef(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(controlClass, "h-10 pr-8", className)} {...props}>
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

/** Label, control and optional hint or error, stacked. */
export const Field = ({ label, htmlFor, hint, error, className, children }) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    {label && (
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
      </label>
    )}
    {children}
    {error ? <p className="text-xs text-danger">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
  </div>
);
