"use client";

import { useEffect, useRef, useState } from "react";
import { Building2Icon, LandmarkIcon, StarIcon, StoreIcon, Volume2Icon, VolumeXIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { player } from "./bump";
import { BANK } from "./city-layout";
import { inCity } from "./city-plan";
import { ESCAPE_DISTANCE, game, rob, setTeller, talk, toggleMute, transfer, useGame, usd } from "./heist";
import { DROP } from "./world-layout";

/*
 * The city game's buttons and signs over the 3D world: your money (cash on
 * hand and in the bank, in US dollars), "+$45,000" as loot comes in, the
 * wanted stars and getaway timer, big ALARM / YOU GOT AWAY / BUSTED banners,
 * what you can do where you're standing ("R  Rob the bank!"), the bank
 * teller's window, and a quick hop between the store and the city.
 */

export function CityHud({
  show,
  canTravel,
  nearCar,
  calm,
  onPanel,
}: {
  /** False in the drone view (before you've gone in). */
  show: boolean;
  /** Walking around outside (not driving, not in the store, not mid-flight). */
  canTravel: boolean;
  /** Next to a car (E gets you in, so E doesn't talk to the teller). */
  nearCar: boolean;
  calm: boolean;
  /** The teller's window opened or closed (the page stops the walking keys while it's open). */
  onPanel: (open: boolean) => void;
}) {
  const g = useGame();
  const [rolling, setRolling] = useState(g.cash);
  const rolled = useRef(g.cash);
  const [here, setHere] = useState<"city" | "town">("town");

  // The cash counter rolls up (or down) to the new amount.
  useEffect(() => {
    if (calm) return;
    let raf = 0;
    const step = () => {
      const diff = g.cash - rolled.current;
      rolled.current = Math.abs(diff) < 1 ? g.cash : rolled.current + Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.12);
      setRolling(rolled.current);
      if (rolled.current !== g.cash) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [g.cash, calm]);
  const shown = calm ? g.cash : rolling;

  // In the city or the town? (For the quick-hop button.)
  useEffect(() => {
    const t = setInterval(() => setHere(inCity(player.x, player.z) ? "city" : "town"), 400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => onPanel(g.teller), [g.teller, onPanel]);

  // R robs, E talks to the teller (unless you're next to a car).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.code === "KeyR" && game.prompt?.rob) rob();
      else if (e.code === "KeyE" && game.prompt?.talk && !nearCar) talk();
      else if (e.code === "Escape" && game.teller) setTeller(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearCar]);

  if (!show) return null;

  const hop = (to: "city" | "store") => {
    if (to === "city") {
      // The sidewalk in front of the bank, looking at it.
      Object.assign(player, { x: BANK.x, z: BANK.z + 15, yaw: 0, hop: true });
    } else {
      Object.assign(player, { x: DROP.x, z: DROP.z, yaw: 0, hop: true });
    }
  };

  const w = g.wanted;
  const left = w ? Math.max(0, Math.ceil(w.until - g.now)) : 0;
  const togo = w ? Math.max(0, Math.round(ESCAPE_DISTANCE - g.distance)) : 0;

  return (
    <>
      {/* ---- Money, top middle ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-[7.4rem] flex flex-col items-center gap-2 px-3 sm:top-[4.4rem]">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border-[3px] border-black bg-[#6cc04a] py-1 pr-1 pl-3 shadow-[0_4px_0_#000]">
          <span className="font-heading text-2xl leading-none font-extrabold tracking-wide text-black tabular-nums" aria-label={`Cash ${usd(g.cash)}`}>
            {usd(Math.round(shown))}
          </span>
          <span className="ml-1.5 flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-1 text-xs font-bold text-white tabular-nums" title="In the bank">
            <LandmarkIcon className="size-3.5" /> {usd(g.bank)}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={g.muted ? "Turn city sounds on" : "Turn city sounds off"}
            className="grid size-7 place-items-center rounded-full bg-black/80 text-white transition-transform hover:scale-105"
          >
            {g.muted ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
          </button>
        </div>

        {/* Loot coming in */}
        <div className="relative h-0 w-full">
          {g.pops.map((p) => (
            <span key={p.key} aria-hidden className="cash-pop absolute top-0 left-1/2 font-heading text-4xl font-extrabold whitespace-nowrap text-[#6cc04a] [-webkit-text-stroke:1.5px_#000]">
              +{usd(p.amount)}
            </span>
          ))}
        </div>

        {/* Wanted: stars, and the getaway clock */}
        {w && (
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-2xl border-[3px] border-black bg-black/85 px-4 py-2 text-white shadow-lg" role="status">
            <div className="flex gap-1">
              {[0, 1, 2].map((k) => (
                <StarIcon key={k} className={cn("size-6 fill-[#ffd21f] text-[#ffd21f]", !calm && "wanted-blink")} style={{ animationDelay: `${k * 0.15}s` }} />
              ))}
            </div>
            <p className="font-heading text-lg leading-none font-extrabold tracking-wide uppercase">
              Get away! <span className={cn("tabular-nums", left <= 15 && "text-[#ff5a4a]")}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
            </p>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-[#6cc04a] transition-[width] duration-300" style={{ width: `${Math.min(100, (g.distance / ESCAPE_DISTANCE) * 100)}%` }} />
            </div>
            <p className="text-xs text-white/75">
              {togo} m to go · loot on you: <span className="font-bold text-[#6cc04a]">{usd(w.haul)}</span>
            </p>
          </div>
        )}
      </div>

      {/* ---- Big banners ---- */}
      {g.banner && (
        <div key={g.banner.key} className="pointer-events-none absolute inset-x-0 top-[34%] flex flex-col items-center px-4 text-center" role="alert">
          <p
            className={cn(
              "city-banner font-heading text-6xl leading-none font-extrabold tracking-wide uppercase [-webkit-text-stroke:2.5px_#000] sm:text-8xl",
              g.banner.kind === "alarm" && "text-[#ff4a3d]",
              g.banner.kind === "escaped" && "text-[#6cc04a]",
              g.banner.kind === "busted" && "text-[#3d8bff]",
              g.banner.kind === "info" && "text-[#ffd21f]",
            )}
          >
            {g.banner.title}
          </p>
          <p className="mt-3 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg sm:text-base">{g.banner.line}</p>
        </div>
      )}
      {w && !calm && <div aria-hidden className="alarm-wash pointer-events-none absolute inset-0" />}

      {/* ---- What you can do here ---- */}
      {g.prompt && !g.teller && (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 flex flex-wrap justify-center gap-2 px-4 sm:bottom-32">
          {g.prompt.rob && (
            <button
              type="button"
              onClick={rob}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-[#e5483b] py-2.5 pr-5 pl-2.5 font-heading text-lg font-extrabold tracking-wide text-white uppercase shadow-[0_5px_0_#000] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#000] animate-in fade-in zoom-in-95 duration-200"
            >
              <kbd className="grid size-8 place-items-center rounded-lg bg-white font-heading text-lg text-black">R</kbd>
              {g.prompt.rob.text}
            </button>
          )}
          {g.prompt.talk && (
            <button
              type="button"
              onClick={talk}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/85 py-2.5 pr-5 pl-2.5 font-heading text-lg font-extrabold tracking-wide text-white uppercase shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5 animate-in fade-in zoom-in-95 duration-200"
            >
              <kbd className="grid size-8 place-items-center rounded-lg bg-primary font-heading text-lg text-black">E</kbd>
              {g.prompt.talk.text}
            </button>
          )}
        </div>
      )}

      {/* ---- Quick hop between the store and the city ---- */}
      {canTravel && !w && (
        <div className="absolute top-[10.6rem] right-3 sm:top-20 sm:right-4">
          <button
            type="button"
            onClick={() => hop(here === "city" ? "store" : "city")}
            className="flex h-10 items-center gap-1.5 rounded-full bg-white/90 px-4 font-heading text-base font-extrabold tracking-wide uppercase shadow-md backdrop-blur transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
          >
            {here === "city" ? <StoreIcon className="size-4" /> : <Building2Icon className="size-4" />}
            {here === "city" ? "Back to the store" : "Go to the city"}
          </button>
        </div>
      )}

      {g.teller && <TellerWindow />}
    </>
  );
}

/** The bank teller's window: put cash in the bank (safe if you get busted) or take it out. */
function TellerWindow() {
  const g = useGame();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const move = (amount: number) => {
    if (amount === 0) return setNote("Nothing to move!");
    setNote(transfer(amount) ? (amount > 0 ? `Deposited ${usd(amount)}.` : `Withdrew ${usd(-amount)}.`) : "Not enough money for that.");
  };
  const btn = "h-11 rounded-full border-2 border-black font-heading text-lg font-extrabold uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0";
  return (
    <div role="dialog" aria-modal="true" aria-label="City Bank teller" className="fixed inset-0 z-[85] flex justify-end">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={() => setTeller(false)} className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-[#fbf7ee] text-black shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-start justify-between gap-3 border-b-4 border-black bg-[#0b6b67] px-5 py-4 text-white">
          <div>
            <h2 className="font-heading text-3xl leading-none font-extrabold tracking-wide text-[#ffd21f] uppercase">City Bank</h2>
            <p className="mt-1 text-sm text-white/80">Cash in the bank is safe, even if you get busted.</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setTeller(false)}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border-2 border-black bg-[#6cc04a] p-3">
              <p className="text-xs font-bold uppercase">Cash on you</p>
              <p className="font-heading text-2xl font-extrabold tabular-nums">{usd(g.cash)}</p>
            </div>
            <div className="rounded-2xl border-2 border-black bg-white p-3">
              <p className="text-xs font-bold uppercase">In the bank</p>
              <p className="font-heading text-2xl font-extrabold tabular-nums">{usd(g.bank)}</p>
            </div>
          </div>
          <section>
            <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide text-[#0b6b67] uppercase">Deposit</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={cn(btn, "bg-[#ffd21f]")} disabled={g.cash < 100} onClick={() => move(100)}>
                $100
              </button>
              <button type="button" className={cn(btn, "bg-[#ffd21f]")} disabled={g.cash < 1000} onClick={() => move(1000)}>
                $1,000
              </button>
              <button type="button" className={cn(btn, "bg-[#ffd21f]")} disabled={g.cash <= 0} onClick={() => move(g.cash)}>
                All
              </button>
            </div>
          </section>
          <section>
            <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide text-[#0b6b67] uppercase">Withdraw</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={cn(btn, "bg-white")} disabled={g.bank < 100} onClick={() => move(-100)}>
                $100
              </button>
              <button type="button" className={cn(btn, "bg-white")} disabled={g.bank < 1000} onClick={() => move(-1000)}>
                $1,000
              </button>
              <button type="button" className={cn(btn, "bg-white")} disabled={g.bank <= 0} onClick={() => move(-g.bank)}>
                All
              </button>
            </div>
          </section>
          <p aria-live="polite" className="min-h-6 text-center text-sm font-semibold text-black/70">
            {note}
          </p>
          <p className="rounded-2xl bg-black/5 p-4 text-xs text-black/60">This is pretend money for the 3D city only. It isn&apos;t real and can&apos;t be spent in the store.</p>
        </div>
      </div>
    </div>
  );
}
