import { BanknoteIcon, ClockIcon, ShoppingBasketIcon, SparklesIcon } from "lucide-react";
import { formatClock } from "@/lib/format";
import type { StoreInfo } from "@/lib/ordering";

/** Three (or four) steps: what to do, start to finish. */
export function HowItWorks({ info }: { info: StoreInfo }) {
  const steps = [
    { icon: ShoppingBasketIcon, title: "Pick your snacks", text: "Walk the 3D store or tap + on anything below." },
    {
      icon: ClockIcon,
      title: "Choose a pickup time",
      text: info.today_is_open ? `Order by ${formatClock(info.order_cutoff_time)} for same-day pickup.` : "Pick the day and time that works for you.",
    },
    { icon: BanknoteIcon, title: "Pay at the window", text: `Cash or debit when you pick it up at ${info.pickup_location.charAt(0).toLowerCase()}${info.pickup_location.slice(1)}.` },
    ...(info.rewards_enabled ? [{ icon: SparklesIcon, title: "Earn rewards", text: `${info.points_per_dollar ?? 1} point${(info.points_per_dollar ?? 1) === 1 ? "" : "s"} for every dollar, for free snacks later.` }] : []),
  ];
  return (
    <section aria-labelledby="how-title">
      <h2 id="how-title" className="font-heading text-5xl leading-none font-extrabold uppercase sm:text-6xl">
        How it works
      </h2>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative overflow-hidden rounded-3xl border bg-card p-5 shadow-soft">
            <span aria-hidden className="absolute -top-3 -right-1 font-heading text-8xl leading-none font-extrabold text-primary/15">
              {i + 1}
            </span>
            <s.icon className="size-7 text-primary" />
            <p className="mt-3 font-heading text-2xl leading-tight font-extrabold">{s.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
