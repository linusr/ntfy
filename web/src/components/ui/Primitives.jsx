import * as React from "react";
import { Loader2, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import cn from "./cn";

export const Card = ({ className, ...props }) => (
  <div className={cn("rounded-2xl border border-border bg-surface", className)} {...props} />
);

export const Chip = ({ className, ...props }) => (
  <span
    className={cn("inline-flex items-center rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted", className)}
    {...props}
  />
);

export const Spinner = ({ className }) => <Loader2 className={cn("size-5 animate-spin text-muted", className)} aria-hidden />;

const alertStyles = {
  info: { icon: Info, className: "border-accent/30 bg-accent-soft text-text" },
  warning: { icon: AlertTriangle, className: "border-warning/30 bg-warning/10 text-text" },
  error: { icon: AlertTriangle, className: "border-danger/30 bg-danger/10 text-text" },
  success: { icon: CheckCircle2, className: "border-success/30 bg-success/10 text-text" },
};

export const Alert = ({ severity = "info", title, children, action, className }) => {
  const { icon: Icon, className: tone } = alertStyles[severity];
  return (
    <div role={severity === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", tone, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-muted")}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
};

/** Section of a settings-style page: heading, optional description, then rows. */
export const Section = ({ title, description, children, className }) => (
  <section className={cn("space-y-3", className)}>
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
    </div>
    <Card className="divide-y divide-border">{children}</Card>
  </section>
);

/** One setting: label and description on the left, control on the right (stacked on phones). */
export const Row = ({ title, description, children, className }) => (
  <div className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between", className)}>
    <div className="min-w-0">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export const EmptyState = ({ icon: Icon, title, children, action }) => (
  <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center">
    {Icon && (
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="size-7" />
      </div>
    )}
    <h2 className="text-lg font-semibold">{title}</h2>
    {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
