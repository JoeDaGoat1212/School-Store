import type { LucideIcon } from "lucide-react";

/** Title row at the top of every staff page, with optional buttons on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-prose text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Shown when a list has nothing in it yet. Tell people what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-ember-ink">
        <Icon className="size-6" />
      </span>
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
