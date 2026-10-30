"use client";

import { useEffect, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronUpIcon, PlaneIcon, XIcon } from "lucide-react";
import { drive } from "./drive";
import { freecam, freecamHeight, startFreecam, stopFreecam } from "./freecam";
import { useGameVersion } from "./game-events";
import { golf } from "./golf-state";
import { life } from "./life";
import { police } from "./police-state";

/*
 * The "Fly around" button (under the camera and graphics buttons), and
 * while you're flying, the controls and a button to come back.
 */

export function FlyHud({ hidden }: { hidden: boolean }) {
  useGameVersion();
  const [, setTick] = useState(0);
  // The height and speed readout: a few times a second while flying.
  useEffect(() => {
    if (!freecam.on) return;
    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [freecam.on]);
  // (Leaving the page with it on: put things back.)
  useEffect(() => () => stopFreecam(), []);

  if (freecam.on) return <FlyPanel />;
  const busy = hidden || life.dead || life.inJail || police.arrest || drive.active || (golf.mode !== "off" && golf.stage !== "walk");
  if (busy) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        startFreecam();
        e.currentTarget.blur();
      }}
      title="Fly anywhere round the map to look at everything"
      className="absolute top-[19.6rem] right-3 flex h-9 items-center gap-1.5 rounded-full bg-[#1d6fd8] px-3.5 text-sm font-bold text-white shadow-md backdrop-blur transition-transform hover:-translate-y-0.5 sm:top-[13.4rem] sm:right-4"
    >
      <PlaneIcon className="size-4" /> Fly around
    </button>
  );
}

const Key = ({ children }: { children: React.ReactNode }) => <kbd className="mx-0.5 rounded bg-white/20 px-1.5 font-bold">{children}</kbd>;

function FlyPanel() {
  const hold = (set: (v: number) => void, v: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      set(v);
    },
    onPointerUp: () => set(0),
    onPointerLeave: () => set(0),
    onPointerCancel: () => set(0),
  });
  const fwd = (v: number) => (freecam.touch.fwd = v);
  const up = (v: number) => (freecam.touch.up = v);
  const btn = "grid size-12 place-items-center rounded-2xl bg-black/70 text-white shadow-lg active:bg-black select-none touch-none";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3">
        <p className="hidden rounded-full bg-black/65 px-4 py-1.5 text-center text-xs text-white/90 backdrop-blur sm:block">
          <Key>W</Key>
          <Key>S</Key> fly the way you look · <Key>A</Key>
          <Key>D</Key> slide · <Key>←</Key>
          <Key>→</Key> turn · drag to look · <Key>Space</Key> up · <Key>Q</Key> down · hold <Key>Shift</Key> to go fast · scroll for speed
        </p>
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#1d6fd8] py-1.5 pr-1.5 pl-4 text-white shadow-xl">
          <PlaneIcon className="size-4" />
          <span className="font-heading text-lg font-extrabold tracking-wide uppercase">Fly mode</span>
          <span className="text-sm tabular-nums text-white/85">
            {freecamHeight()} m up · speed {Math.round(freecam.speed)}
          </span>
          <button type="button" onClick={stopFreecam} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-[#1d6fd8] hover:bg-white/90">
            <XIcon className="size-4" /> Done <span className="hidden text-xs opacity-70 sm:inline">(Esc)</span>
          </button>
        </div>
        <div className="pointer-events-auto flex gap-2 sm:hidden">
          <button type="button" aria-label="Forward" className={btn} {...hold(fwd, 1)}>
            <ChevronUpIcon className="size-6" />
          </button>
          <button type="button" aria-label="Back" className={btn} {...hold(fwd, -1)}>
            <ChevronDownIcon className="size-6" />
          </button>
          <button type="button" aria-label="Up" className={btn} {...hold(up, 1)}>
            <ArrowUpIcon className="size-5" />
          </button>
          <button type="button" aria-label="Down" className={btn} {...hold(up, -1)}>
            <ArrowDownIcon className="size-5" />
          </button>
        </div>
      </div>
    </>
  );
}
