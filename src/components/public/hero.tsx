import { ArrowDownIcon, MegaphoneIcon } from "lucide-react";
import { FLAME_PATH } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { formatClock, relativeDay } from "@/lib/format";
import { pickupDays, toMinutes, type StoreInfo } from "@/lib/ordering";
import { EnterStoreButton } from "./store/enter-store-button";

/**
 * The top of the menu page: a full-screen look into the store (a real render
 * of the 3D store), the big "Enter store" button, and a printed ticket that
 * tells students the one thing they need — when to order by.
 *
 * `counts` is how many drinks, snacks and candy are in the 3D store
 * (no store button if there's nothing in it).
 */
export function Hero({ info, counts }: { info: StoreInfo; counts: { drinks: number; snacks: number; candy: number } }) {
  const board = scoreboard(info);
  const inStore = counts.drinks + counts.snacks + counts.candy;
  const tally = [
    counts.drinks && `${counts.drinks} drinks`,
    counts.snacks && `${counts.snacks} snacks`,
    counts.candy && `${counts.candy} candy`,
  ].filter(Boolean);

  return (
    // Full-bleed: break out of the page's centered column.
    <section className="dark relative -mt-6 ml-[calc(50%-50vw)] flex min-h-[max(34rem,calc(92svh-4rem))] w-screen overflow-hidden bg-black text-white">
      {/* The store, slowly pushing in */}
      <div aria-hidden className="hero-push absolute inset-0 bg-cover bg-[center_40%]" style={{ backgroundImage: "url(/showcase/store-poster.webp)" }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent max-sm:bg-black/45" />
      <div aria-hidden className="grain absolute inset-0" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col justify-end px-4 pt-24 pb-8 sm:pb-12">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            {/* A price-gun sticker */}
            <p className="mb-4 inline-flex -rotate-3 items-center gap-2 rounded-md bg-primary px-3 py-1 font-heading text-lg font-extrabold tracking-wide text-black uppercase shadow-[3px_3px_0_#000]">
              New · 3D store
            </p>
            <h1 className="font-heading text-[clamp(4.2rem,16vw,10.5rem)] leading-[0.8] font-extrabold tracking-[-0.015em] uppercase">
              <span className="sr-only">{brand.name}: </span>
              Walk into
              <br />
              the <span className="text-primary">Nest</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-white/80 sm:text-xl">
              Grab a drink from the fridge, snacks off the shelf, candy at the counter. Tap it, it&apos;s in your cart.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {inStore > 0 && <EnterStoreButton />}
              <a
                href="#menu"
                className="inline-flex h-14 items-center gap-2 rounded-2xl border-2 border-white/25 px-6 font-semibold transition-colors hover:border-white hover:bg-white hover:text-black focus-visible:ring-4 focus-visible:ring-white/50 focus-visible:outline-none"
              >
                Just show me the menu <ArrowDownIcon className="size-4" />
              </a>
            </div>
            {tally.length > 0 && <p className="mt-5 font-mono text-xs tracking-[0.18em] text-white/55 uppercase">In stock now: {tally.join(" / ")}</p>}
          </div>

          <Ticket board={board} />
        </div>
      </div>
    </section>
  );
}

/** The "order by" time, printed on a little paper ticket with a torn top edge. */
function Ticket({ board }: { board: ReturnType<typeof scoreboard> }) {
  return (
    <div className="ticket w-full max-w-xs rotate-2 bg-[#f3eee4] px-5 pt-6 pb-5 text-black shadow-[0_18px_40px_rgb(0_0_0/0.55)] sm:w-72 lg:mb-3">
      <p className="flex items-center justify-between font-mono text-[0.7rem] tracking-[0.2em] text-black/60 uppercase">
        <span>Pickup</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-full ${board.state === "open" ? "animate-pulse bg-[#0a9a8e]" : board.state === "later" ? "bg-[#e08a2c]" : "bg-black/30"}`} />
          {board.state === "open" ? "Open" : board.state === "later" ? "Next" : "Closed"}
        </span>
      </p>
      <p className="mt-3 text-sm font-semibold">{board.label}</p>
      <p className="font-heading text-6xl leading-[0.9] font-extrabold tabular-nums">{board.big}</p>
      <p className="mt-2 border-t border-dashed border-black/30 pt-2 text-sm text-black/70">{board.detail}</p>
    </div>
  );
}

/** What the ticket says right now. */
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
 * The strip under the hero with the banner, hours and pickup spot, like the
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
