"use client";

import { useEffect, useRef, useState } from "react";
import { BathIcon, BedDoubleIcon, CheckIcon, HomeIcon, RulerIcon, ShieldCheckIcon, ShieldXIcon, VideoIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { cutscene } from "./cutscene";
import { useGameVersion } from "./game-events";
import { HOMES, homeOf, ownsHome, type Home } from "./houses-layout";
import { profile, usd } from "./profile";
import { buyHome, openRealty, realty, skipTour, startTour } from "./realty";

/*
 * Keystone Realty's listings (every home for sale, with a picture, the
 * price, beds, baths and size, and a tour), the "buy it?" screen after a
 * tour, the gate guard checking your ID, and the captions during a tour.
 */

const close = () => openRealty(null);

export function RealtyPanels() {
  useGameVersion();
  const p = realty.panel;
  if (!p) return null;
  if (p.kind === "gate") return <Gate ok={p.ok} />;
  if (p.kind === "after") return <After id={p.home} />;
  return <Listings first={p.pick} />;
}

function Frame({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={close} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className={cn("relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-[#fbf8f2] text-black shadow-2xl animate-in slide-in-from-bottom duration-300 sm:rounded-3xl", wide ? "max-w-5xl" : "max-w-md")}>
        <div className="flex items-center gap-3 bg-[#1f3a5f] px-5 py-3 text-white">
          <HomeIcon className="size-5" />
          <h2 className="flex-1 font-heading text-xl font-extrabold tracking-wide uppercase">{title}</h2>
          <button ref={ref} type="button" onClick={close} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/30">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Listings({ first }: { first?: string }) {
  const [area, setArea] = useState<"all" | "willow" | "estates">("all");
  const [pick, setPick] = useState<Home>(homeOf(first ?? "") ?? HOMES[0]);
  const list = HOMES.filter((h) => area === "all" || h.area === area);
  return (
    <Frame title="Keystone Realty" wide>
      <p className="mb-3 text-sm text-black/60">“Hi! I&apos;m Dana. Every home in the city is on my books. Take a look round before you buy, I&apos;ll give you the full tour.”</p>
      <div className="mb-4 flex gap-1">
        {(
          [
            ["all", "All homes"],
            ["willow", "Willow Lane"],
            ["estates", "Crescent Heights (gated)"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setArea(k)} className={cn("rounded-full px-4 py-1.5 text-sm font-bold", area === k ? "bg-[#1f3a5f] text-white" : "bg-black/5")}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-[1fr_22rem]">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {list.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => setPick(h)} className={cn("w-full overflow-hidden rounded-2xl bg-white text-left shadow ring-2", pick.id === h.id ? "ring-[#1f3a5f]" : "ring-transparent")}>
                <HomePicture h={h} />
                <div className="p-2.5">
                  <p className="truncate font-heading font-extrabold">{h.name}</p>
                  <p className="font-bold text-[#1f3a5f] tabular-nums">{usd(h.price)}</p>
                  <p className="text-xs text-black/60">
                    {h.beds} bd · {h.baths} ba · {h.sqft.toLocaleString("en-US")} sq ft
                  </p>
                  {ownsHome(h.id) && <p className="mt-1 text-xs font-bold text-[#2f8f3a]">Yours</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <Details h={pick} />
      </div>
    </Frame>
  );
}

function Details({ h }: { h: Home }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <HomePicture h={h} big />
      <p className="mt-3 text-xs font-bold tracking-widest text-black/50 uppercase">{h.area === "estates" ? "Crescent Heights · gated community" : "Willow Lane"}</p>
      <h3 className="font-heading text-2xl font-extrabold">{h.name}</h3>
      <p className="font-heading text-3xl font-extrabold text-[#1f3a5f] tabular-nums">{usd(h.price)}</p>
      <p className="mt-1 text-sm text-black/70">{h.blurb}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <Fact icon={<BedDoubleIcon className="size-4" />} label="Beds" value={String(h.beds)} />
        <Fact icon={<BathIcon className="size-4" />} label="Baths" value={String(h.baths)} />
        <Fact icon={<RulerIcon className="size-4" />} label="Sq ft" value={h.sqft.toLocaleString("en-US")} />
      </dl>
      {h.extras.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1">
          {h.extras.map((e) => (
            <li key={e} className="rounded-full bg-[#1f3a5f]/10 px-2.5 py-0.5 text-xs font-bold text-[#1f3a5f] capitalize">
              {e === "hottub" ? "hot tub" : e === "theater" ? "home cinema" : e}
            </li>
          ))}
        </ul>
      )}
      {ownsHome(h.id) ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-full bg-[#2f8f3a]/15 py-3 font-bold text-[#2f8f3a]">
          <CheckIcon className="size-5" /> You own this home
        </p>
      ) : (
        <button type="button" onClick={() => startTour(h.id)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1f3a5f] py-3 font-heading text-lg font-extrabold tracking-wide text-white uppercase">
          <VideoIcon className="size-5" /> Take the tour
        </button>
      )}
      <p className="mt-2 text-center text-xs text-black/40">You&apos;ll get the tour before you can buy.</p>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/5 py-1.5">
      <dt className="flex items-center justify-center gap-1 text-xs font-bold text-black/50 uppercase">
        {icon} {label}
      </dt>
      <dd className="font-heading text-lg font-extrabold">{value}</dd>
    </div>
  );
}

function After({ id }: { id: string }) {
  const h = homeOf(id)!;
  const [error, setError] = useState<string | null>(null);
  const money = profile.cash + profile.bank;
  return (
    <Frame title="So, what did you think?">
      <HomePicture h={h} big />
      <h3 className="mt-3 font-heading text-2xl font-extrabold">{h.name}</h3>
      <p className="font-heading text-3xl font-extrabold text-[#1f3a5f] tabular-nums">{usd(h.price)}</p>
      <p className="mt-1 text-sm text-black/60">You have {usd(money)} (cash and bank).</p>
      {error && <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-800">{error}</p>}
      <button
        type="button"
        disabled={money < h.price}
        onClick={() => setError(buyHome(h.id))}
        className="mt-4 w-full rounded-full bg-[#2f8f3a] py-3 font-heading text-lg font-extrabold tracking-wide text-white uppercase disabled:bg-black/10 disabled:text-black/40"
      >
        {money < h.price ? `You need ${usd(h.price - money)} more` : `Buy it for ${usd(h.price)}`}
      </button>
      <button type="button" onClick={() => openRealty({ kind: "listings", pick: h.id })} className="mt-2 w-full rounded-full bg-black/5 py-3 font-bold">
        Back to the listings
      </button>
    </Frame>
  );
}

function Gate({ ok }: { ok: boolean }) {
  return (
    <Frame title="Crescent Heights security">
      <p className="text-sm text-black/60">The guard leans out of the gatehouse.</p>
      <p className="mt-2 text-lg font-bold">“Evening. ID, please.”</p>
      <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#dfeefc] to-[#cfe6f5] p-3 ring-1 ring-black/10">
        <p className="text-xs font-extrabold tracking-[0.2em] text-[#1d4f91] uppercase">City ID card</p>
        <p className="font-heading text-xl font-extrabold">{profile.name}</p>
        <p className="font-mono text-sm font-bold">{profile.idNumber}</p>
      </div>
      <div className={cn("mt-4 flex items-start gap-3 rounded-2xl p-3", ok ? "bg-[#2f8f3a]/15" : "bg-red-100")}>
        {ok ? <ShieldCheckIcon className="mt-0.5 size-6 shrink-0 text-[#2f8f3a]" /> : <ShieldXIcon className="mt-0.5 size-6 shrink-0 text-red-700" />}
        <p className="font-semibold">
          {ok
            ? `“Welcome home, ${profile.name.split(" ")[0]}.” The barrier lifts.`
            : `“Sorry, ${profile.name.split(" ")[0]}, you're not on the residents' list. Crescent Heights is residents only. Keystone Realty in the city can show you round.”`}
        </p>
      </div>
      <button type="button" onClick={close} className="mt-4 w-full rounded-full bg-black py-3 font-heading font-extrabold tracking-wide text-white uppercase">
        {ok ? "Drive on" : "OK"}
      </button>
    </Frame>
  );
}

/** A little drawing of each home (its style, colours and size), for the listings. */
export function HomePicture({ h, big }: { h: Home; big?: boolean }) {
  const scale = Math.min(1, 0.45 + h.w / 64);
  const W = 200 * scale;
  const H = 90 * scale * (h.floors > 1 ? 1.25 : 1) * (h.floors > 2 ? 1.15 : 1);
  const x0 = 120 - W / 2;
  const base = 150;
  const top = base - H;
  const roof = (() => {
    switch (h.style) {
      case "modern":
      case "glass":
      case "contemporary":
        return <rect x={x0 - 6} y={top - 6} width={W + 12} height={8} fill={h.roof} />;
      case "aframe":
        return <path d={`M${x0 - 10} ${base} L120 ${top - 50} L${x0 + W + 10} ${base} Z`} fill={h.roof} />;
      case "chateau":
        return (
          <g fill={h.roof}>
            <path d={`M${x0} ${top} L${x0 + 18} ${top - 34} L${x0 + W - 18} ${top - 34} L${x0 + W} ${top} Z`} />
            <path d={`M${x0 - 8} ${top + 10} L${x0 + 8} ${top - 50} L${x0 + 24} ${top + 10} Z`} />
            <path d={`M${x0 + W - 24} ${top + 10} L${x0 + W - 8} ${top - 50} L${x0 + W + 8} ${top + 10} Z`} />
          </g>
        );
      case "crown":
        return (
          <g>
            <rect x={x0 - 6} y={top - 8} width={W + 12} height={10} fill={h.trim} />
            <ellipse cx={120} cy={top - 8} rx={26} ry={22} fill={h.roof} />
          </g>
        );
      case "villa":
      case "tuscan":
      case "bungalow":
        return <path d={`M${x0 - 8} ${top + 4} L${x0 + 30} ${top - 26} L${x0 + W - 30} ${top - 26} L${x0 + W + 8} ${top + 4} Z`} fill={h.roof} />;
      default:
        return <path d={`M${x0 - 8} ${top + 2} L120 ${top - 40} L${x0 + W + 8} ${top + 2} Z`} fill={h.roof} />;
    }
  })();
  const glass = h.style === "glass" || h.style === "contemporary" || h.style === "modern";
  return (
    <svg viewBox="0 0 240 170" className={cn("w-full", big ? "rounded-xl" : "")} style={{ background: "linear-gradient(#bfe3ff, #eaf6ff 70%)" }} aria-hidden>
      <rect x={0} y={base} width={240} height={20} fill={h.area === "estates" ? "#5aa84a" : "#7cbf5a"} />
      {h.extras.includes("pool") && <rect x={x0 + W - 10} y={base + 4} width={50} height={10} rx={3} fill="#4fc3f7" />}
      {h.style !== "aframe" && <rect x={x0} y={top} width={W} height={H} fill={h.wall} stroke="#0002" />}
      {roof}
      {h.style === "tuscan" && <rect x={x0 + W - 34} y={top - 40} width={26} height={H + 40} fill={h.wall} stroke="#0002" />}
      {/* Windows */}
      {Array.from({ length: Math.max(1, h.floors) }, (_, f) =>
        Array.from({ length: Math.max(2, Math.round(W / 34)) }, (_, i, a) => (
          <rect key={`${f}-${i}`} x={x0 + 10 + (i * (W - 30)) / (a.length - 1)} y={base - (f + 1) * (H / Math.max(1, h.floors)) + 10} width={glass ? (W - 30) / a.length + 4 : 12} height={H / Math.max(1, h.floors) - 22} fill={glass ? "#9fd3f0" : "#cfe9f5"} stroke={h.trim} strokeWidth={2} />
        )),
      )}
      <rect x={116} y={base - 26} width={12} height={26} fill={h.trim} />
      {h.extras.includes("porch") && <rect x={x0 + 10} y={base - H * 0.55} width={W - 20} height={4} fill={h.trim} />}
      {h.extras.includes("helipad") && (
        <g>
          <circle cx={30} cy={base + 9} r={9} fill="#2b2f36" />
          <text x={30} y={base + 13} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">
            H
          </text>
        </g>
      )}
      {(h.area === "estates" || h.price > 500000) && [14, 226].map((x) => <circle key={x} cx={x} cy={base - 14} r={14} fill="#3f8f3a" />)}
    </svg>
  );
}

/** The captions during a tour (and a skip button). */
export function TourCaption() {
  useGameVersion();
  const c = cutscene.caption;
  if (!realty.tour || !c) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[92] flex flex-col items-center px-4 text-center text-white">
      <div key={c.title} className="rounded-3xl bg-black/55 px-6 py-4 backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-500">
        <p className="font-heading text-3xl font-extrabold tracking-wide uppercase drop-shadow">{c.title}</p>
        {c.line && <p className="mt-1 text-lg font-semibold">{c.line}</p>}
        {c.facts && <p className="mt-1 text-sm font-bold text-white/80">{c.facts.join(" · ")}</p>}
      </div>
      <button type="button" onClick={skipTour} className="pointer-events-auto mt-3 rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold backdrop-blur hover:bg-white/30">
        Skip tour
      </button>
    </div>
  );
}
