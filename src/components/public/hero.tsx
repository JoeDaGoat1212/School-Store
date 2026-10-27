import { MegaphoneIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { FLAME_PATH } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { formatClock, relativeDay } from "@/lib/format";
import { pickupDays, toMinutes, type StoreInfo } from "@/lib/ordering";
import { Embers } from "./embers";

/**
 * The black band at the top of the menu: the burning wordmark, embers, and a
 * scoreboard that tells students the one thing they need — when to order by.
 */
export function Hero({ info }: { info: StoreInfo }) {
  const board = scoreboard(info);

  return (
    // Full-bleed: break out of the page's centered column.
    <section className="dark relative -mt-6 mb-0 ml-[calc(50%-50vw)] w-screen overflow-hidden bg-black text-white">
      <div aria-hidden className="coal-glow absolute inset-0" />
      <Embers className="absolute inset-0 size-full" />

      <div className="relative mx-auto grid max-w-5xl gap-6 px-4 pt-8 pb-8 sm:gap-8 sm:pt-14 sm:pb-12 lg:grid-cols-[1fr_auto] lg:items-end lg:pb-16">
        <div>
          <h1 aria-label={brand.name} className="font-heading leading-[0.82] font-extrabold tracking-[-0.01em] uppercase">
            <Wordmark />
          </h1>
          <p className="mt-4 max-w-sm text-white/75 sm:mt-5 sm:text-lg">{brand.tagline}</p>
        </div>

        {/* Scoreboard */}
        <div className="w-full rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 backdrop-blur-sm sm:w-80 sm:py-5 lg:mb-2">
          <p className="flex items-center gap-2 text-sm font-medium text-white/70">
            <span
              aria-hidden
              className={`size-2 rounded-full ${board.state === "open" ? "animate-pulse bg-teal" : board.state === "later" ? "bg-[#ffb66e]" : "bg-white/40"}`}
            />
            {board.label}
          </p>
          <p className="mt-1 font-heading text-5xl leading-none sm:text-6xl font-extrabold text-primary tabular-nums">{board.big}</p>
          <p className="mt-1.5 text-white/80 sm:mt-2">{board.detail}</p>
        </div>
      </div>
    </section>
  );
}

/** "FIREBIRDS / NEST", one span per letter so they can rise in one after another. */
function Wordmark() {
  // Split the name into lines at the last space ("Firebirds Nest" → 2 lines).
  const name = brand.name.toUpperCase();
  const cut = name.lastIndexOf(" ");
  const lines = cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name];
  let i = 0;

  return lines.map((line) => (
    <span key={line} aria-hidden className="block text-[clamp(4.75rem,24vw,11.5rem)] whitespace-nowrap">
      {[...line].map((ch, j) => (
        <span key={j} className="burn-letter" style={{ "--i": i++ } as CSSProperties}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  ));
}

/** What the scoreboard says right now. */
function scoreboard(info: StoreInfo) {
  const days = pickupDays(info);
  const today = days.find((d) => d.isToday);
  const nextToday = today?.windows.find((w) => w.open);

  if (nextToday) {
    const orderBy = toMinutes(nextToday.window.starts_at) - info.order_lead_minutes;
    const hhmm = `${Math.floor(orderBy / 60)}:${String(orderBy % 60).padStart(2, "0")}`;
    const [time, ampm] = formatClock(hhmm).split(" ");
    return {
      state: "open" as const,
      label: "Order by",
      big: (
        <>
          {time}
          <span className="ml-1 text-3xl">{ampm}</span>
        </>
      ),
      detail: `to pick up today, ${nextToday.window.label.toLowerCase()}.`,
    };
  }

  const later = days.find((d) => !d.isToday && d.anyOpen);
  if (later) {
    return {
      state: "later" as const,
      label: "Today's pickups are done",
      big: relativeDay(later.date, info.today),
      detail: `Order now for ${later.windows[0]?.window.label.toLowerCase() ?? "pickup"} or later.`,
    };
  }

  return { state: "closed" as const, label: "Online ordering", big: "Closed", detail: info.store_hours };
}

/**
 * The teal strip under the hero with the banner, hours and pickup spot.
 * It scrolls sideways; screen readers get the same facts once, as a list.
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
    <div className="ticker mb-6 ml-[calc(50%-50vw)] w-screen overflow-hidden bg-teal text-black">
      <ul className="sr-only">
        {facts.map((f) => (
          <li key={f.text}>{f.text}</li>
        ))}
      </ul>
      <div aria-hidden className="ticker-track flex w-max">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {row.map((f, i) => (
              <span key={i} className="flex items-center gap-3 py-2.5 pr-3 text-sm font-semibold whitespace-nowrap sm:text-base">
                {f.loud && <MegaphoneIcon className="size-4" />}
                {f.text}
                <svg viewBox="0 0 32 32" className="size-4 fill-black/80">
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
