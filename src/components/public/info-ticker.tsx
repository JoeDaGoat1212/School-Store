import { MegaphoneIcon } from "lucide-react";
import { FLAME_PATH } from "@/components/brand-mark";
import { formatClock } from "@/lib/format";
import type { StoreInfo } from "@/lib/ordering";

/**
 * The strip at the top of the list view with the banner, hours and pickup spot, like the
 * scrolling LED sign over a store counter. Screen readers get the same facts
 * once, as a list.
 */
export function InfoTicker({ info }: { info: StoreInfo }) {
  const facts: { text: string; loud?: boolean }[] = [
    ...(info.banner_text ? [{ text: info.banner_text, loud: true }] : []),
    { text: info.store_hours },
    { text: `Pick up at ${info.pickup_location}` },
    { text: "Pay with cash or debit when you pick up" },
    ...(info.today_is_open ? [{ text: `Same-day orders close at ${formatClock(info.order_cutoff_time)}` }] : []),
  ];

  // Repeat so the strip is always wider than the screen, then double it for the loop.
  const row = Array.from({ length: 3 }, () => facts).flat();

  return (
    <div className="ticker mb-10 ml-[calc(50%-50vw)] w-screen overflow-hidden border-y border-white/10 bg-black text-white">
      <ul className="sr-only">
        {facts.map((f) => (
          <li key={f.text}>{f.text}</li>
        ))}
      </ul>
      <div aria-hidden className="ticker-track flex w-max">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {row.map((f, i) => (
              <span
                key={i}
                className={`flex items-center gap-4 py-3 pr-4 font-mono text-xs tracking-[0.16em] whitespace-nowrap uppercase sm:text-sm ${f.loud ? "text-primary" : "text-white/85"}`}
              >
                {f.loud && <MegaphoneIcon className="size-4" />}
                {f.text}
                <svg viewBox="0 0 32 32" className="size-3.5 fill-primary">
                  <path fillRule="evenodd" d={FLAME_PATH} />
                </svg>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
