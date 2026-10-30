"use client";

import { useEffect, useState } from "react";
import { DeleteIcon, PhoneIcon, PhoneOffIcon, SignalIcon, SmartphoneIcon, WifiIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGameVersion } from "./game-events";
import { backspace, dial, formatNumber, hangUp, openPhone, phone, pressKey, tickPhone } from "./phone";

/*
 * The phone (bottom right): slides up with P (or M), a keypad to dial, the
 * call screen, and the subtitles of what's said (bottom middle, shown even
 * with the phone put away). phone.ts runs it.
 */

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

export function PhoneHud({ hidden }: { hidden: boolean }) {
  useGameVersion();
  const [, setTick] = useState(0);

  // The phone's clock (rings, the call timer, the subtitles), and a redraw while a call's on.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      tickPhone(t / 1000);
      if (phone.call && t - last > 250) {
        last = t;
        setTick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keys: P / M take it out and put it away; with it out, the number keys dial, Enter calls, Backspace deletes, Esc puts it away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.code === "KeyP" || e.code === "KeyM") {
        if (hidden && !phone.open) return;
        openPhone();
        return;
      }
      if (!phone.open) return;
      if (/^[0-9]$/.test(e.key) || e.key === "*" || e.key === "#") {
        e.preventDefault();
        pressKey(e.key);
      } else if (e.code === "Backspace") {
        e.preventDefault();
        backspace();
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        if (phone.screen === "dial") dial();
        else hangUp();
      } else if (e.code === "Escape") {
        if (phone.screen === "call" || phone.screen === "ringing") hangUp();
        openPhone(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden]);

  const sub = phone.subtitle;
  return (
    <>
      {/* What's being said on the call (also while the phone's away) */}
      {sub && (
        <div key={sub.text} className="pointer-events-none absolute inset-x-0 bottom-28 z-40 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-1 sm:bottom-24">
          <p className="max-w-xl rounded-xl bg-black/80 px-4 py-2 text-center text-base text-white shadow-xl backdrop-blur">
            <span className="mr-1.5 font-bold text-[#ffd21f]">{sub.who}:</span>
            {sub.text}
          </p>
        </div>
      )}

      {/* The tab to take it out (for a mouse or a finger) */}
      {!hidden && !phone.open && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => openPhone(true)}
          className="absolute right-3 bottom-36 z-30 flex h-10 items-center gap-1.5 rounded-full bg-black/80 px-3.5 text-sm font-bold text-white shadow-md backdrop-blur transition-transform hover:-translate-y-0.5 sm:right-4 sm:bottom-4"
        >
          <SmartphoneIcon className="size-4" /> Phone <kbd className="rounded bg-white/20 px-1.5 text-xs">P</kbd>
        </button>
      )}

      {/* The phone itself: slides up from the bottom right */}
      <div
        className={cn(
          "pointer-events-auto absolute right-3 bottom-3 z-40 w-[15.5rem] origin-bottom-right transition-transform duration-300 ease-out sm:right-5 sm:bottom-5",
          phone.open && !hidden ? "translate-y-0" : "pointer-events-none translate-y-[115%]",
        )}
        aria-hidden={!phone.open}
      >
        <div className="rounded-[2.4rem] bg-[#0b0c0e] p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/15">
          <div className="relative flex h-[30rem] flex-col overflow-hidden rounded-[1.9rem] bg-gradient-to-b from-[#1b2230] to-[#0d1016] text-white">
            {/* The status bar, and the camera notch */}
            <div className="flex items-center justify-between px-5 pt-2.5 text-[11px] font-semibold">
              <Clock />
              <span className="h-5 w-20 rounded-full bg-black" />
              <span className="flex items-center gap-1">
                <SignalIcon className="size-3" />
                <WifiIcon className="size-3" />
                <span className="ml-0.5 inline-block h-2.5 w-5 rounded-[3px] border border-white/70 p-[1.5px]">
                  <span className="block h-full w-3/4 rounded-[1px] bg-white" />
                </span>
              </span>
            </div>
            {phone.screen === "dial" ? <Keypad /> : <CallScreen />}
            {/* The home bar: puts it away */}
            <button type="button" tabIndex={-1} onClick={() => openPhone(false)} className="mx-auto mt-auto mb-2 h-1.5 w-24 rounded-full bg-white/60 hover:bg-white" aria-label="Put the phone away (P)" />
          </div>
        </div>
      </div>
    </>
  );
}

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 15000);
    return () => clearInterval(i);
  }, []);
  return <span>{t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
}

function Keypad() {
  return (
    <div className="flex flex-1 flex-col px-5 pt-5">
      <div className="flex h-14 items-end justify-center">
        <p className={cn("truncate text-center font-light tracking-wide tabular-nums", phone.typed.length > 10 ? "text-2xl" : "text-3xl")}>{phone.typed ? formatNumber(phone.typed) : <span className="text-lg text-white/35">Enter a number</span>}</p>
      </div>
      {phone.recent.length > 0 && !phone.typed && (
        <p className="mt-1 truncate text-center text-[11px] text-white/45">
          Recent:{" "}
          {phone.recent.slice(0, 3).map((n) => (
            <button key={n} type="button" tabIndex={-1} onClick={() => dial(n)} className="mx-0.5 text-[#6ee7a0] hover:underline">
              {n}
            </button>
          ))}
        </p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
        {KEYS.map(([k, letters]) => (
          <button
            key={k}
            type="button"
            tabIndex={-1}
            onClick={() => pressKey(k)}
            className="mx-auto grid size-[3.6rem] place-content-center rounded-full bg-white/12 leading-none transition-colors hover:bg-white/20 active:bg-white/35"
          >
            <span className="text-2xl font-light">{k}</span>
            <span className="h-2.5 text-[8px] font-bold tracking-[0.18em] text-white/70">{letters}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 items-center gap-x-4">
        <span />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => dial()}
          disabled={!phone.typed}
          className="mx-auto grid size-[3.6rem] place-items-center rounded-full bg-[#30d158] text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
          aria-label="Call"
        >
          <PhoneIcon className="size-6 fill-white" />
        </button>
        {phone.typed ? (
          <button type="button" tabIndex={-1} onClick={backspace} className="mx-auto grid size-10 place-items-center text-white/70 hover:text-white" aria-label="Delete">
            <DeleteIcon className="size-6" />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function CallScreen() {
  const c = phone.call;
  if (!c) return null;
  const name = c.answer?.name ?? c.info.number;
  const secs = Math.max(0, Math.floor(phone.now - c.started));
  const status = phone.screen === "ringing" ? "Calling…" : phone.screen === "ended" ? "Call ended" : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-1 flex-col items-center px-5 pt-10 text-center">
      <span className={cn("grid size-20 place-items-center rounded-full bg-gradient-to-b from-[#8e9aaf] to-[#5c667a] text-3xl font-semibold", phone.screen === "ringing" && "animate-pulse")}>{name.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?"}</span>
      <p className="mt-4 text-2xl font-light">{name}</p>
      {c.answer && name !== c.info.number && <p className="text-xs text-white/55">{c.info.number}</p>}
      <p className="mt-1 text-sm text-white/70 tabular-nums">{status}</p>
      <button
        type="button"
        tabIndex={-1}
        onClick={hangUp}
        className="mt-auto mb-8 grid size-[3.8rem] place-items-center rounded-full bg-[#ff3b30] shadow-lg transition-transform hover:scale-105 active:scale-95"
        aria-label="Hang up"
      >
        <PhoneOffIcon className="size-6" />
      </button>
    </div>
  );
}
