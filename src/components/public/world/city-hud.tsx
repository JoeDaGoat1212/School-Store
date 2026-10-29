"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon, LandmarkIcon, MapPinIcon, NavigationIcon, StarIcon, UtensilsIcon, Volume2Icon, VolumeXIcon, WalletIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { player } from "./bump";
import { BANK } from "./city-layout";
import { DELIVER_TIME, DROP_ZONE, game, setTeller, toggleMute, useGame } from "./heist";
import { interaction, press, type Action } from "./interact";
import { jail } from "./jail";
import { life } from "./life";
import { police } from "./police";
import { pockets, profile, transfer, usd } from "./profile";
import { WalletPanel } from "./wallet-panel";
import { AIRPORT, ESTATES, MAIN_ROAD_Z } from "./world-map";
import { DROP } from "./world-layout";

/*
 * The city game's buttons and signs over the 3D world: your money (cash and
 * bank, in US dollars), hunger and health, "+$45,000" as money comes in, the
 * wanted stars and the countdown to get the loot to the secret base (with an
 * arrow pointing the way), big ALARM / STASHED / BUSTED / WASTED banners,
 * what you can do where you're standing ("R  Rob the bank!"), the bank
 * teller's window, your wallet (I), and quick trips round the map.
 */

/** Places the quick-trip menu can take you (not the secret base: that's secret). */
const TRIPS = [
  { key: "store", label: "The store", x: DROP.x, z: DROP.z, yaw: 0 },
  { key: "city", label: "The city (bank)", x: BANK.x, z: BANK.z + 15, yaw: 0 },
  { key: "airport", label: "The airport", x: AIRPORT.terminal.x, z: MAIN_ROAD_Z + 4, yaw: Math.PI },
  { key: "estates", label: "Crescent Heights gate", x: ESTATES.gate.x + 6, z: ESTATES.gate.z - 18, yaw: Math.PI },
];

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
  /** Next to a car (E gets you in, so E doesn't do anything else). */
  nearCar: boolean;
  calm: boolean;
  /** A full-screen panel opened or closed (the page stops the walking keys while one's open). */
  onPanel: (open: boolean) => void;
}) {
  const g = useGame();
  const [rolling, setRolling] = useState(profile.cash);
  const rolled = useRef(profile.cash);
  const [walletOpen, setWalletOpen] = useState(false);
  const [trips, setTrips] = useState(false);
  // Where the secret base is, compared to the way you're facing (degrees), while carrying loot.
  const [arrow, setArrow] = useState(0);
  const [stats, setStats] = useState({ hunger: 100, health: 100 });
  const [fade, setFade] = useState(0);
  const [cell, setCell] = useState(0);

  // The cash counter rolls up (or down) to the new amount.
  useEffect(() => {
    if (calm) return;
    let raf = 0;
    const step = () => {
      const diff = profile.cash - rolled.current;
      rolled.current = Math.abs(diff) < 0.01 ? profile.cash : rolled.current + diff * 0.14 + Math.sign(diff) * 0.01;
      setRolling(rolled.current);
      if (rolled.current !== profile.cash) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
  const shown = calm ? profile.cash : rolling;

  // A few times a second: hunger, health, and the arrow to the base.
  useEffect(() => {
    const t = setInterval(() => {
      setStats({ hunger: Math.round(life.hunger), health: Math.round(life.health) });
      if (game.wanted) {
        const dx = DROP_ZONE.x - player.x;
        const dz = DROP_ZONE.z - player.z;
        // player.yaw 0 = facing -z; the arrow points up when the base is straight ahead.
        setArrow(((Math.atan2(dx, -dz) - player.yaw) * 180) / Math.PI);
      }
    }, 250);
    // The fade to black on the way to jail, and the cell door countdown (more often, so the fade is smooth).
    const f = setInterval(() => {
      setFade(police.fade);
      setCell(life.inJail ? jail.left : 0);
    }, 50);
    return () => {
      clearInterval(t);
      clearInterval(f);
    };
  }, []);

  const panel = g.teller || walletOpen;
  useEffect(() => onPanel(panel), [panel, onPanel]);

  // Keys: E / R / F / Q do what's on offer here, I opens your wallet, Escape closes things.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.code === "Escape") {
        if (game.teller) setTeller(false);
        setWalletOpen(false);
        setTrips(false);
        return;
      }
      if (e.code === "KeyI") {
        setWalletOpen((o) => !o);
        return;
      }
      if (game.teller || walletOpen || player.frozen) return;
      if (e.code === "KeyR") press("R");
      else if (e.code === "KeyF") press("F");
      else if (e.code === "KeyQ") press("Q");
      // E gets you into a car when you're next to one; otherwise it's for whatever's here.
      else if (e.code === "KeyE" && !nearCar) press("E");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nearCar, walletOpen]);

  if (!show) return null;

  const go = (trip: (typeof TRIPS)[number]) => {
    Object.assign(player, { x: trip.x, z: trip.z, yaw: trip.yaw, hop: true });
    setTrips(false);
  };

  const w = g.wanted;
  const left = w ? Math.max(0, Math.ceil(w.until - g.now)) : 0;
  const actions = interaction.actions.filter((a) => !(a.key === "E" && nearCar));

  return (
    <>
      {/* ---- Money, hunger and health, top middle ---- */}
      <div className="pointer-events-none absolute inset-x-0 top-[7.4rem] flex flex-col items-center gap-1.5 px-3 sm:top-[4.4rem]">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border-[3px] border-black bg-[#6cc04a] py-1 pr-1 pl-3 shadow-[0_4px_0_#000]">
          <span className="font-heading text-2xl leading-none font-extrabold tracking-wide text-black tabular-nums" aria-label={`Cash ${usd(profile.cash)}`}>
            {usd(Math.round(shown * 100) / 100)}
          </span>
          <span className="ml-1.5 flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-1 text-xs font-bold text-white tabular-nums" title="In the bank">
            <LandmarkIcon className="size-3.5" /> {usd(profile.bank)}
          </span>
          <button
            type="button"
            onClick={() => setWalletOpen(true)}
            aria-label="Open your wallet (I)"
            className="grid size-7 place-items-center rounded-full bg-black/80 text-white transition-transform hover:scale-105"
          >
            <WalletIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={profile.muted ? "Turn city sounds on" : "Turn city sounds off"}
            className="grid size-7 place-items-center rounded-full bg-black/80 text-white transition-transform hover:scale-105"
          >
            {profile.muted ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
          </button>
        </div>
        <div className="flex gap-2" aria-label={`Hunger ${stats.hunger}%, health ${stats.health}%`}>
          <Meter icon={<UtensilsIcon className="size-3" />} value={stats.hunger} color={stats.hunger < 25 ? "#ff7a2a" : "#ffd21f"} warn={stats.hunger < 15 && !calm} />
          <Meter icon={<HeartIcon className="size-3" />} value={stats.health} color={stats.health < 35 ? "#ff3b30" : "#ff5a7a"} warn={stats.health < 35 && !calm} />
        </div>

        {/* Money coming in (or going out) */}
        <div className="relative h-0 w-full">
          {g.pops.map((p) => (
            <span
              key={p.key}
              aria-hidden
              className={cn(
                "cash-pop absolute top-0 left-1/2 font-heading text-4xl font-extrabold whitespace-nowrap [-webkit-text-stroke:1.5px_#000]",
                p.amount < 0 ? "text-[#ff4a3d]" : p.label === "loot" ? "text-[#ffd21f]" : "text-[#6cc04a]",
              )}
            >
              {p.amount < 0 ? "-" : "+"}
              {usd(Math.abs(p.amount))}
              {p.label === "loot" && <span className="ml-2 text-xl">loot</span>}
            </span>
          ))}
        </div>

        {/* Wanted: stars, the countdown and the way to the secret base */}
        {w && (
          <div className="pointer-events-auto mt-1 flex items-center gap-3 rounded-2xl border-[3px] border-black bg-black/85 px-4 py-2 text-white shadow-lg" role="status">
            <div className="grid size-11 place-items-center rounded-full bg-[#ffd21f]/15" title="The secret base is this way">
              <NavigationIcon className="size-6 fill-[#ffd21f] text-[#ffd21f] transition-transform duration-200" style={{ transform: `rotate(${arrow}deg)` }} />
            </div>
            <div className="flex flex-col items-start gap-0.5">
              <div className="flex gap-1">
                {[0, 1, 2].map((k) => (
                  <StarIcon key={k} className={cn("size-4 fill-[#ffd21f] text-[#ffd21f]", !calm && "wanted-blink")} style={{ animationDelay: `${k * 0.15}s` }} />
                ))}
              </div>
              <p className="font-heading text-base leading-none font-extrabold tracking-wide uppercase">
                {w.haul > 0 ? "Get the loot to the base!" : "Grab the loot!"}{" "}
                <span className={cn("tabular-nums", left <= 30 && "text-[#ff5a4a]")}>
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </span>
              </p>
              <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-[#ffd21f] transition-[width] duration-300" style={{ width: `${Math.max(0, (left / DELIVER_TIME) * 100)}%` }} />
              </div>
              <p className="text-xs text-white/75">
                {Math.round(g.distance)} m to the secret base · loot in your bag: <span className="font-bold text-[#ffd21f]">{usd(w.haul)}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ---- In jail: the cell door, and your stolen keycard ---- */}
      {life.inJail && (
        <div className="pointer-events-none absolute inset-x-0 top-[13.5rem] flex justify-center px-3 sm:top-[9.5rem]">
          <div className="rounded-2xl border-[3px] border-black bg-[#ff7a1a] px-4 py-2 text-center font-heading font-extrabold tracking-wide text-black uppercase shadow-lg">
            {cell > 0 ? (
              <>
                Cell door opens in <span className="tabular-nums">0:{String(cell).padStart(2, "0")}</span>
              </>
            ) : pockets.keycard ? (
              "Keycard: security doors open for you. Get to the lobby exit!"
            ) : (
              "Sneak up behind a guard and pickpocket a keycard (F)"
            )}
          </div>
        </div>
      )}

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
              g.banner.kind === "dead" && "text-[#ff2a1a]",
            )}
          >
            {g.banner.title}
          </p>
          <p className="mt-3 max-w-lg rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg sm:text-base">{g.banner.line}</p>
        </div>
      )}
      {w && !calm && <div aria-hidden className="alarm-wash pointer-events-none absolute inset-0" />}
      {fade > 0 && <div aria-hidden className="pointer-events-none fixed inset-0 z-[90] bg-black" style={{ opacity: fade }} />}
      {life.dead && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(120_0_0/0.55))] duration-700 animate-in fade-in" />}

      {/* ---- What you can do here ---- */}
      {actions.length > 0 && !panel && !life.dead && (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 flex flex-wrap justify-center gap-2 px-4 sm:bottom-32">
          {actions.map((a) => (
            <ActionButton key={`${a.key}${a.text}`} action={a} />
          ))}
        </div>
      )}

      {/* ---- Quick trips round the map ---- */}
      {canTravel && !w && !life.dead && (
        <div className="absolute top-[10.6rem] right-3 flex flex-col items-end gap-2 sm:top-20 sm:right-4">
          <button
            type="button"
            onClick={() => setTrips((o) => !o)}
            aria-expanded={trips}
            className="flex h-10 items-center gap-1.5 rounded-full bg-white/90 px-4 font-heading text-base font-extrabold tracking-wide uppercase shadow-md backdrop-blur transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-primary/60 focus-visible:outline-none"
          >
            <MapPinIcon className="size-4" /> Go to…
          </button>
          {trips && (
            <ul className="w-56 overflow-hidden rounded-2xl bg-white/95 p-1 shadow-lg backdrop-blur animate-in fade-in slide-in-from-top-1">
              {TRIPS.map((t) => (
                <li key={t.key}>
                  <button type="button" onClick={() => go(t)} className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-black/5">
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {g.teller && <TellerWindow />}
      {walletOpen && <WalletPanel onClose={() => setWalletOpen(false)} />}
    </>
  );
}

function Meter({ icon, value, color, warn }: { icon: React.ReactNode; value: number; color: string; warn: boolean }) {
  return (
    <div className={cn("flex items-center gap-1 rounded-full bg-black/75 py-0.5 pr-1.5 pl-1.5 text-white", warn && "animate-pulse")}>
      {icon}
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, value)}%`, background: color }} />
      </div>
    </div>
  );
}

function ActionButton({ action }: { action: Action }) {
  const bg = action.tone === "crime" ? "bg-[#e5483b] text-white" : action.tone === "money" ? "bg-[#6cc04a] text-black" : "bg-black/85 text-white";
  return (
    <button
      type="button"
      onClick={action.run}
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-full py-2.5 pr-5 pl-2.5 font-heading text-lg font-extrabold tracking-wide uppercase shadow-[0_5px_0_#000] backdrop-blur transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#000] animate-in fade-in zoom-in-95 duration-200",
        bg,
      )}
    >
      <kbd className={cn("grid size-8 place-items-center rounded-lg font-heading text-lg text-black", action.tone === "crime" ? "bg-white" : "bg-primary")}>{action.key}</kbd>
      {action.text}
    </button>
  );
}

/** The bank teller's window: put cash in the bank (safe if you pass out) or take it out. */
function TellerWindow() {
  useGame();
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
            <p className="mt-1 text-sm text-white/80">Money in the bank is safe, even if you pass out.</p>
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
              <p className="font-heading text-2xl font-extrabold tabular-nums">{usd(profile.cash)}</p>
            </div>
            <div className="rounded-2xl border-2 border-black bg-white p-3">
              <p className="text-xs font-bold uppercase">In the bank</p>
              <p className="font-heading text-2xl font-extrabold tabular-nums">{usd(profile.bank)}</p>
            </div>
          </div>
          <section>
            <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide text-[#0b6b67] uppercase">Deposit</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={cn(btn, "bg-[#ffd21f]")} disabled={profile.cash < 100} onClick={() => move(100)}>
                $100
              </button>
              <button type="button" className={cn(btn, "bg-[#ffd21f]")} disabled={profile.cash < 1000} onClick={() => move(1000)}>
                $1,000
              </button>
              <button type="button" className={cn(btn, "bg-[#ffd21f]")} disabled={profile.cash <= 0} onClick={() => move(profile.cash)}>
                All
              </button>
            </div>
          </section>
          <section>
            <h3 className="mb-2 font-heading text-xl font-extrabold tracking-wide text-[#0b6b67] uppercase">Withdraw</h3>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className={cn(btn, "bg-white")} disabled={profile.bank < 100} onClick={() => move(-100)}>
                $100
              </button>
              <button type="button" className={cn(btn, "bg-white")} disabled={profile.bank < 1000} onClick={() => move(-1000)}>
                $1,000
              </button>
              <button type="button" className={cn(btn, "bg-white")} disabled={profile.bank <= 0} onClick={() => move(-profile.bank)}>
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
