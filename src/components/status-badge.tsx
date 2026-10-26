import { cn } from "@/lib/utils";
import { ORDER_STATUS, type OrderStatus } from "@/lib/order-status";

const TONES = {
  info: "bg-primary/10 text-primary ring-primary/20",
  warning: "bg-warning/12 text-warning ring-warning/25",
  success: "bg-success/12 text-success ring-success/25",
  neutral: "bg-muted text-muted-foreground ring-border",
  danger: "bg-destructive/10 text-destructive ring-destructive/20",
} as const;

export type Tone = keyof typeof TONES;

/** A small colored pill. Use `tone` for meaning (success = good, danger = problem). */
export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Order status pill. `audience="student"` uses the friendlier student wording. */
export function StatusBadge({ status, audience = "staff" }: { status: OrderStatus; audience?: "staff" | "student" }) {
  const s = ORDER_STATUS[status];
  return <Pill tone={s.tone}>{audience === "student" ? s.studentLabel : s.label}</Pill>;
}
