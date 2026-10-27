import { ArrowDownIcon, MegaphoneIcon } from "lucide-react";
import { FLAME_PATH } from "@/components/brand-mark";
import { brand } from "@/config/brand";
import { formatClock, relativeDay } from "@/lib/format";
import { pickupDays, toMinutes, type StoreInfo } from "@/lib/ordering";
import { OpenStoreButton } from "./store/enter-store-button";

/*
 * The top of the menu page, drawn like the front of a corner store: a sign
 * board with the name, a striped awning, a shop window looking into the 3D
 * store, and a glass door with an OPEN sign that says when to order by.
 * Clicking the window or the door walks you into the 3D store.
 *
 * Painted flat colours on purpose (no glows or gradients): it should look
 * like a real shop front, not a poster.
 */

const CREAM = "#f3eee4";

/** `counts`: how many drinks, snacks and candy are in the 3D store (no door to walk through if it's empty). */
export function Hero({ info, counts }: { info: StoreInfo; counts: { drinks: number; snacks: number; candy: number } }) {
  const board = scoreboard(info);
  const hasStore = counts.drinks + counts.snacks + counts.candy > 0;

  return (
    // Full-bleed: break out of the page's centered column.
    <section className="relative -mt-6 ml-[calc(50%-50vw)] w-screen bg-[#e9e2d3] pt-6 text-black sm:pt-10">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        {/* Sign board over the shop */}
        <div className="flex items-end justify-between gap-4 rounded-t-lg border-b-[6px] border-black bg-[#141414] px-4 pt-3 pb-2 sm:px-8 sm:pt-5 sm:pb-4">
          <h1 className="font-heading text-[clamp(2.9rem,10vw,7rem)] leading-[0.85] font-extrabold tracking-wide uppercase" style={{ color: CREAM }}>
            {brand.name}
          </h1>
          <p className="hidden pb-2 text-right font-heading text-xl leading-tight font-bold tracking-wide uppercase md:block" style={{ color: `${CREAM}b0` }}>
            School store
            <br />
            Drinks · Snacks · Candy
          </p>
        </div>

        {/* Awning */}
        <div aria-hidden className="awning" />

        {/* Shop front: window and door */}
        <div className="shopfront grid gap-4 bg-[#0b5d5a] px-3 pt-5 sm:gap-6 sm:px-6 sm:pt-7 md:grid-cols-[1fr_16rem] lg:grid-cols-[1fr_18rem]">
          {hasStore ? (
            <OpenStoreButton
              label="Look inside the 3D store"
              className="group relative aspect-[16/10] overflow-hidden border-[10px] border-[#ebe4d6] bg-black text-left focus-visible:ring-4 focus-visible:ring-primary focus-visible:outline-none md:aspect-auto md:min-h-[25rem]"
            >
              <span
                aria-hidden
                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
                style={{ backgroundImage: "url(/showcase/store-poster.webp)" }}
              />
              {/* Window lettering, painted on the glass */}
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-5">
                <span className="font-heading text-2xl leading-none font-extrabold tracking-wide uppercase sm:text-4xl" style={{ color: CREAM }}>
                  Cold drinks · Snacks · Candy
                </span>
                <span className="hidden shrink-0 rounded-sm bg-[#f3eee4] px-2 py-1 text-sm font-semibold text-black transition-transform group-hover:-translate-y-0.5 sm:block">
                  Look inside
                </span>
              </span>
            </OpenStoreButton>
          ) : (
            <div className="aspect-[16/10] border-[10px] border-[#ebe4d6] bg-[#10201f] md:aspect-auto md:min-h-[25rem]" />
          )}

          <Door board={board} hasStore={hasStore} />
        </div>
        {/* The step and the sidewalk */}
        <div aria-hidden className="h-4 bg-[#2a2a2a]" />
        <div aria-hidden className="h-2 bg-[#bdb5a6]" />
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-5 pb-8 sm:flex-row sm:items-center sm:justify-between sm:pb-10">
        <p className="max-w-xl text-lg">
          {brand.tagline} {hasStore && <span className="text-black/60">Walk in through the door to shop the shelves in 3D.</span>}
        </p>
        <a href="#menu" className="inline-flex shrink-0 items-center gap-2 font-semibold underline decoration-2 underline-offset-4 hover:text-[#c2410c]">
          Skip to the menu <ArrowDownIcon className="size-4" />
        </a>
      </div>
    </section>
  );
}

/**
 * The shop door: dark glass in a black frame, with a push bar and the OPEN
 * sign hanging on it. Point at it and it swings open a little, showing the
 * lit store behind.
 */
function Door({ board, hasStore }: { board: ReturnType<typeof scoreboard>; hasStore: boolean }) {
  const sign = (
    <span className="absolute top-4 left-1/2 z-10 w-40 -translate-x-1/2 -rotate-2">
      {/* The string it hangs from */}
      <span aria-hidden className="mx-auto block h-5 w-20 border-x-2 border-t-2 border-black/70 [border-radius:999px_999px_0_0]" />
      <span className="block rounded-md border-[3px] border-[#c8102e] bg-white px-3 pt-1.5 pb-2 text-center shadow-[2px_3px_0_rgb(0_0_0/0.35)]">
        <span className="block font-heading text-4xl leading-none font-extrabold tracking-wider text-[#c8102e]">
          {board.state === "open" ? "OPEN" : "CLOSED"}
        </span>
        <span className="mt-1 block text-xs font-semibold text-black/70">{board.label}</span>
        <span className="block font-heading text-2xl leading-tight font-extrabold text-black tabular-nums">{board.big}</span>
      </span>
    </span>
  );

  const panel = (
    <>
      {/* Behind the door: the lit store */}
      <span aria-hidden className="absolute inset-0 bg-[#ff5a1f] bg-cover bg-[18%_50%]" style={{ backgroundImage: "url(/showcase/store-poster.webp)" }} />
      <span className="door-panel absolute inset-0 border-[10px] border-[#1b1b1b] bg-[#152322]">
        {/* A little reflection on the glass */}
        <span aria-hidden className="absolute top-0 left-[14%] h-full w-3 -skew-x-12 bg-white/10" />
        <span aria-hidden className="absolute top-0 left-[22%] h-full w-1 -skew-x-12 bg-white/10" />
        {/* Push bar */}
        <span aria-hidden className="absolute inset-x-3 top-[62%] h-3 rounded-full bg-[#c7ccd1] shadow-[0_2px_0_#6b7075]" />
        {hasStore && (
          <span className="absolute inset-x-0 bottom-5 text-center">
            <span className="block text-xs font-bold tracking-[0.3em] text-white/50 uppercase">Push</span>
            <span className="block font-heading text-3xl leading-none font-extrabold tracking-wide uppercase" style={{ color: CREAM }}>
              Step inside
            </span>
          </span>
        )}
        {/* The OPEN sign hangs on the door, so it swings with it */}
        {sign}
      </span>
    </>
  );

  const frame = "relative mx-auto block h-80 w-full max-w-60 overflow-hidden [perspective:1100px] md:h-auto md:max-w-none";
  return hasStore ? (
    <OpenStoreButton
      label="Walk into the 3D store"
      className={`group ${frame} cursor-pointer focus-visible:ring-4 focus-visible:ring-primary focus-visible:outline-none`}
    >
      {panel}
    </OpenStoreButton>
  ) : (
    <div className={frame}>{panel}</div>
  );
}

/** What the OPEN sign says right now. */
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
