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
      <div>
        <h1 className="relative w-fit font-heading text-4xl leading-none font-bold tracking-tight sm:text-[2.6rem]">
          {title}
          <MarkerStroke />
        </h1>
        {description && <p className="mt-3 max-w-prose text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A quick swipe of orange marker under a page title, like a hand-made shelf sign. */
function MarkerStroke() {
  return (
    <svg aria-hidden viewBox="0 0 300 14" preserveAspectRatio="none" className="absolute -bottom-2.5 left-0 h-3 w-[calc(100%+0.5rem)] text-[var(--label,var(--brand))]">
      <path d="M3 9 C 60 4, 120 3, 180 6 S 270 10, 297 5" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
    </svg>
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
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <h2 className="font-hand text-3xl leading-none font-bold">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
