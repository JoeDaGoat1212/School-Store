"use client";

import { useEffect, useRef, useState } from "react";
import { EyeIcon, FlagIcon, NavigationIcon, TrophyIcon, WindIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { golfLeaderboard, recordGolfRound } from "@/app/(public)/game-actions";
import { useGameVersion } from "./game-events";
import { HOLES, PAR, SURF_NAME, YARD, golfWaters, type Hole } from "./golf-course";
import { BAG, PUTT_MAX } from "./golf-physics";
import {
  aimDir,
  cancelAddress,
  changeClub,
  currentHole,
  fmtPar,
  golf,
  loadBoard,
  lookingAtTarget,
  onGreen,
  quitGolf,
  releaseCharge,
  setGolfRemote,
  startCharge,
  startRound,
  toPar,
  toPin,
  toggleLookTarget,
  totalStrokes,
  turnAim,
} from "./golf-state";
import { player } from "./you";

/*
 * The golf screen (golf-state.ts runs the game): the hole, your score and
 * the wind; at the ball, the bag (every club's stock carry), the swing
 * meter, a map of the hole to plan the shot on, and the controls; the
 * scorecard; the leaderboard at the end of the round; and the range's
 * numbers.
 */

const fmtYd = (y: number) => `${Math.max(0, Math.round(y))}`;

export function GolfHud() {
  useGameVersion();
  const [, setTick] = useState(0);
  // The swing meter and the distances change every frame: redraw a few times a second (more while swinging).
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (golf.mode === "off") return;
      if (t - last > (golf.charging ? 16 : 120)) {
        last = t;
        setTick((n) => n + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // Signed-in players' rounds go on everyone's leaderboard.
  useEffect(() => {
    setGolfRemote({ record: recordGolfRound, board: golfLeaderboard });
    void loadBoard();
  }, []);
  useGolfKeys();

  if (golf.mode === "off") return null;
  const h = currentHole();
  const round = golf.mode === "round";
  const at = golf.stage === "address";
  const club = BAG[golf.club];
  const pin = toPin();
  const dx = golf.ball.x - player.x;
  const dz = golf.ball.z - player.z;
  const ballYards = Math.hypot(dx, dz) / YARD;
  const arrow = ((Math.atan2(dx, -dz) - player.yaw) * 180) / Math.PI;
  const windMph = Math.hypot(golf.wind.x, golf.wind.z) * 2.237;
  const ad = aimDir();
  // The wind arrow points the way it's blowing, turned so "up" is the way you're aiming (aim angles grow to the left; CSS turns clockwise).
  const windAngle = (-(Math.atan2(golf.wind.x, golf.wind.z) - Math.atan2(ad.x, ad.z)) * 180) / Math.PI;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      {/* ---- The hole and the score ---- */}
      <div className="pointer-events-auto absolute top-[4.75rem] left-3 w-64 overflow-hidden rounded-2xl border border-white/15 bg-[#0e2a1f]/90 text-white shadow-xl backdrop-blur sm:top-[5.25rem] sm:left-4">
        {round ? (
          <>
            <div className="flex items-center justify-between bg-[#14382a] px-4 py-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.2em] text-[#d4b55a] uppercase">Firebird Ridge</p>
                <p className="font-heading text-xl leading-tight font-extrabold">
                  Hole {h.n} <span className="text-sm font-semibold text-white/70">{h.name}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">Par {h.par}</p>
                <p className="text-xs text-white/70">{h.yards} yds</p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/10 px-1 py-2 text-center">
              <Stat label="Strokes" value={String(golf.strokes)} />
              <Stat label="Round" value={fmtPar(toPar())} tone={toPar() < 0 ? "good" : toPar() > 0 ? "bad" : undefined} />
              <Stat label="Total" value={String(totalStrokes())} />
            </div>
          </>
        ) : (
          <div className="bg-[#14382a] px-4 py-2">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#d4b55a] uppercase">Firebird Ridge</p>
            <p className="font-heading text-xl font-extrabold">Driving range</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <WindIcon className="size-4 text-white/70" />
            <span className="inline-block" style={{ transform: `rotate(${windAngle}deg)` }}>
              <NavigationIcon className="size-4 fill-[#7cc4ff] text-[#7cc4ff]" />
            </span>
            {Math.round(windMph)} mph
          </span>
          <span className="text-white/80">{SURF_NAME[golf.lie]}</span>
        </div>
        {round && pin && (
          <div className="border-t border-white/10 px-4 py-2 text-sm">
            <span className="font-bold">{onGreen() ? `${Math.max(1, Math.round(pin.yards * 3))} ft` : `${fmtYd(pin.yards)} yds`}</span> to the pin
            {Math.abs(pin.rise) >= 1 && !onGreen() && (
              <span className="text-white/70">
                {" "}
                · {pin.rise > 0 ? "uphill" : "downhill"} {Math.round(Math.abs(pin.rise))} yds
              </span>
            )}
          </div>
        )}
        <div className="flex gap-2 border-t border-white/10 px-3 py-2">
          {round && (
            <button type="button" onClick={() => ((golf.showCard = !golf.showCard), setTick((n) => n + 1))} className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs font-bold tracking-wide uppercase hover:bg-white/20">
              Scorecard
            </button>
          )}
          <button type="button" onClick={quitGolf} className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs font-bold tracking-wide uppercase hover:bg-[#a3172b]">
            {round ? "Quit round" : "Leave range"}
          </button>
        </div>
      </div>

      {/* ---- Walking to the ball ---- */}
      {round && golf.stage === "walk" && (
        <div className="absolute inset-x-0 top-[22%] flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-black/70 py-2 pr-5 pl-2 text-white shadow-lg backdrop-blur">
            <span className="grid size-9 place-items-center rounded-full bg-white/15">
              <NavigationIcon className="size-5 fill-white" style={{ transform: `rotate(${arrow}deg)` }} />
            </span>
            <span className="text-sm">
              {ballYards < 4.5 / YARD ? (
                <>
                  At your ball. Press <kbd className="rounded bg-white/20 px-1.5 font-bold">E</kbd> to step up
                </>
              ) : (
                <>
                  Your ball: <b>{fmtYd(ballYards)} yds</b> away. Walk or take a cart
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* ---- The note (what just happened) ---- */}
      {golf.note && (
        <div key={golf.note.key} className="absolute inset-x-0 top-[30%] flex flex-col items-center px-4 text-center animate-in fade-in zoom-in-95">
          <p className={cn("font-heading text-4xl font-extrabold tracking-wide text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.6)] sm:text-5xl", golf.note.tone === "good" && "text-[#ffe27a]", golf.note.tone === "bad" && "text-[#ff8f80]")}>{golf.note.title}</p>
          {golf.note.line && <p className="mt-1 rounded-full bg-black/55 px-4 py-1 text-sm text-white backdrop-blur">{golf.note.line}</p>}
        </div>
      )}

      {/* ---- At the ball: the bag, the meter, the map ---- */}
      {at && (
        <>
          {lookingAtTarget() && golf.preview && (
            <div className="absolute inset-x-0 top-[16%] flex justify-center px-4">
              <p className="rounded-full bg-black/65 px-4 py-1.5 text-sm text-white shadow-lg backdrop-blur">
                {club.putter ? (
                  <>Where this putt rolls to</>
                ) : (
                  <>
                    <b className="text-[#ffe27a]">{club.name}</b> lands here: <b>{club.carry} yds</b> carry
                    {pin && <span className="text-white/75"> · {fmtYd(pin.yards)} to the pin</span>}
                  </>
                )}
              </p>
            </div>
          )}
          {round && <HoleMap hole={h} />}
          <div className="pointer-events-auto absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-2">
            <PowerMeter />
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-black/70 p-1.5 shadow-xl backdrop-blur">
              {BAG.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    changeClub(i - golf.club);
                    // (So Space swings, rather than pressing this button again.)
                    e.currentTarget.blur();
                  }}
                  className={cn("flex min-w-12 flex-col items-center rounded-xl px-2 py-1 text-white transition-colors", i === golf.club ? "bg-[#d4b55a] text-black" : "hover:bg-white/15")}
                >
                  <span className="font-heading text-sm font-extrabold">{c.id}</span>
                  <span className="text-[10px] tabular-nums opacity-80">{c.putter ? `≤${Math.round(PUTT_MAX / YARD)}` : c.carry}</span>
                </button>
              ))}
            </div>
            <p className="rounded-full bg-black/60 px-4 py-1 text-center text-xs text-white/90 backdrop-blur">
              <b>{club.name}</b> {club.putter ? "· the dotted line reads the putt" : `· ${club.carry} yds stock carry`} · <Key>←</Key>
              <Key>→</Key> aim (Shift: fine) · <Key>↑</Key>
              <Key>↓</Key> club · <Key>C</Key> see where it lands · hold <Key>Space</Key> to swing · <Key>Esc</Key> step away
            </p>
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                toggleLookTarget();
                e.currentTarget.blur();
              }}
              className={cn("hidden rounded-full px-4 py-1.5 text-xs font-bold tracking-wide uppercase shadow-lg backdrop-blur sm:block", golf.lookTarget ? "bg-[#d4b55a] text-black" : "bg-black/60 text-white hover:bg-black/80")}
            >
              {golf.lookTarget ? "Back to the ball (C)" : "Fly to the landing spot (C)"}
            </button>
            <TouchControls />
          </div>
        </>
      )}

      {/* ---- The range's numbers ---- */}
      {!round && golf.rangeShots.length > 0 && (
        <div className="absolute top-[19rem] right-3 w-48 rounded-2xl bg-black/70 p-3 text-white shadow-xl backdrop-blur sm:top-[13.5rem] sm:right-4">
          <p className="mb-1 text-xs font-bold tracking-widest text-[#d4b55a] uppercase">Your shots</p>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-[10px] text-white/60 uppercase">
              <tr>
                <th className="text-left">Club</th>
                <th className="text-right">Carry</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {golf.rangeShots.map((s, i) => (
                <tr key={i} className={i === 0 ? "font-bold" : "text-white/80"}>
                  <td>{s.club}</td>
                  <td className="text-right">{s.carry}</td>
                  <td className="text-right">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- The scorecard, and the end of the round ---- */}
      {round && (golf.showCard || golf.stage === "done") && <Scorecard onClose={() => ((golf.showCard = false), setTick((n) => n + 1))} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-white/60 uppercase">{label}</p>
      <p className={cn("font-heading text-2xl leading-none font-extrabold tabular-nums", tone === "good" && "text-[#ff6b5b]", tone === "bad" && "text-[#9fd3ff]")}>{value}</p>
    </div>
  );
}
const Key = ({ children }: { children: React.ReactNode }) => <kbd className="mx-0.5 rounded bg-white/20 px-1 font-bold">{children}</kbd>;

/** The swing meter: fills while you hold, red past the top (an overswing). */
function PowerMeter() {
  const club = BAG[golf.club];
  const p = golf.charging ? golf.power : 0;
  const yards = club.putter ? (Math.min(1.1, p) * PUTT_MAX) / YARD : Math.min(1.08, p) * club.carry;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/70 px-4 py-2 text-white shadow-xl backdrop-blur">
      <div className="relative h-4 w-64 overflow-hidden rounded-full bg-white/15 sm:w-80">
        <div className="absolute inset-y-0 left-[90.9%] right-0 bg-[#a3172b]/50" />
        <div className={cn("absolute inset-y-0 left-0 rounded-full", p > 1 ? "bg-[#ff5a4a]" : "bg-gradient-to-r from-[#7fd68a] to-[#ffe27a]")} style={{ width: `${(Math.min(1.1, p) / 1.1) * 100}%` }} />
        <div className="absolute inset-y-0 left-[90.9%] w-0.5 bg-white" />
      </div>
      <span className="w-24 text-sm tabular-nums">
        {golf.charging ? (club.putter ? `${Math.round(yards * 3)} ft` : `${Math.round(yards)} yds`) : "Hold Space"}
      </span>
    </div>
  );
}

/** For phones: aim, club, swing. */
function TouchControls() {
  const hold = (f: () => void) => {
    let t: ReturnType<typeof setInterval> | null = null;
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        f();
        t = setInterval(f, 30);
      },
      onPointerUp: () => t && clearInterval(t),
      onPointerLeave: () => t && clearInterval(t),
    };
  };
  const btn = "grid size-12 place-items-center rounded-2xl bg-black/70 font-heading text-lg font-extrabold text-white shadow-lg active:bg-black";
  return (
    <div className="flex gap-2 sm:hidden">
      <button type="button" className={btn} {...hold(() => turnAim(1, 0.03, false))}>
        ◀
      </button>
      <button type="button" className={btn} {...hold(() => turnAim(-1, 0.03, false))}>
        ▶
      </button>
      <button type="button" className={btn} onClick={() => changeClub(-1)}>
        −
      </button>
      <button type="button" className={btn} onClick={() => changeClub(1)}>
        +
      </button>
      <button
        type="button"
        className={cn(btn, "w-24 bg-[#d4b55a] text-black")}
        onPointerDown={(e) => {
          e.preventDefault();
          startCharge();
        }}
        onPointerUp={releaseCharge}
      >
        Swing
      </button>
      <button type="button" className={btn} onClick={toggleLookTarget} aria-label="See where it lands">
        <EyeIcon className="size-5" />
      </button>
      <button type="button" className={btn} onClick={cancelAddress}>
        <XIcon className="size-5" />
      </button>
    </div>
  );
}

/** The keys while you're at the ball. */
function useGolfKeys() {
  const held = useRef(new Set<string>());
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (golf.mode === "off" || golf.stage !== "address") return;
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const k = e.code;
      if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "KeyW", "KeyS", "Space"].includes(k)) e.preventDefault();
      if (k === "Escape") cancelAddress();
      if (e.repeat) return;
      held.current.add(k);
      if (k === "ArrowUp" || k === "KeyW") changeClub(-1);
      if (k === "ArrowDown" || k === "KeyS") changeClub(1);
      if (k === "Space") startCharge();
      if (k === "KeyC") toggleLookTarget();
    };
    const up = (e: KeyboardEvent) => {
      held.current.delete(e.code);
      if (e.code === "Space") releaseCharge();
    };
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const h = held.current;
      const dir = (h.has("ArrowRight") || h.has("KeyD") ? 1 : 0) - (h.has("ArrowLeft") || h.has("KeyA") ? 1 : 0);
      if (dir) turnAim(-dir, dt, h.has("ShiftLeft") || h.has("ShiftRight"));
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
}

/** A map of the hole, tee at the bottom and green at the top: where you are, where you're aiming and where this club carries. */
function HoleMap({ hole }: { hole: Hole }) {
  const W = 150;
  const H = 260;
  // Turn the hole so it runs up the map.
  const a = Math.atan2(hole.green.x - hole.tee.x, hole.green.z - hole.tee.z);
  const cx = (hole.tee.x + hole.green.x) / 2;
  const cz = (hole.tee.z + hole.green.z) / 2;
  const span = Math.max(...hole.pts.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 30;
  const k = (H / 2 - 8) / span;
  const map = (x: number, z: number) => {
    const dx = x - cx;
    const dz = z - cz;
    const u = dx * Math.cos(a) - dz * Math.sin(a);
    const v = dx * Math.sin(a) + dz * Math.cos(a);
    return { x: W / 2 - u * k, y: H / 2 - v * k };
  };
  const line = hole.pts.filter((_, i) => i % 4 === 0).map((p) => map(p.x, p.z));
  const g = map(hole.green.x, hole.green.z);
  const pin = map(hole.pin.x, hole.pin.z);
  const ball = map(golf.ball.x, golf.ball.z);
  const pv = golf.preview;
  const carry = pv?.carry ? map(pv.carry.x, pv.carry.z) : null;
  const end = pv ? map(pv.end.x, pv.end.z) : null;
  const waters = golfWaters().filter((w) => Math.hypot(w.x - cx, w.z - cz) < span + Math.max(w.rx, w.rz));
  const club = BAG[golf.club];
  return (
    <div className="absolute right-3 hidden overflow-hidden rounded-2xl border border-white/15 bg-[#1f4d2c]/85 shadow-xl backdrop-blur sm:top-[13.5rem] sm:right-4 sm:block">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {waters.map((w, i) => {
          const c = map(w.x, w.z);
          return <ellipse key={i} cx={c.x} cy={c.y} rx={w.rx * k} ry={w.rz * k} transform={`rotate(${((-w.turn + a) * 180) / Math.PI} ${c.x} ${c.y})`} fill="#2f6f9a" />;
        })}
        <polyline points={line.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#6fbf5a" strokeWidth={hole.hw * 2 * k} strokeLinecap="round" strokeLinejoin="round" />
        {hole.bunkers.map((b, i) => {
          const c = map(b.x, b.z);
          return <ellipse key={i} cx={c.x} cy={c.y} rx={b.rx * k} ry={b.rz * k} fill="#e8d9a8" />;
        })}
        <ellipse cx={g.x} cy={g.y} rx={hole.green.rx * k * 1.1} ry={hole.green.rz * k * 1.1} fill="#8fe07a" />
        {end && <line x1={ball.x} y1={ball.y} x2={(carry ?? end).x} y2={(carry ?? end).y} stroke="#fff" strokeWidth={1.5} strokeDasharray="3 3" />}
        {carry && <circle cx={carry.x} cy={carry.y} r={Math.max(4, 9 * k * (club.stray * 2))} fill="none" stroke="#ffe27a" strokeWidth={1.5} />}
        {end && carry && <circle cx={end.x} cy={end.y} r={2.5} fill="#ffe27a" />}
        <line x1={pin.x} y1={pin.y} x2={pin.x} y2={pin.y - 10} stroke="#fff" strokeWidth={1.2} />
        <path d={`M${pin.x} ${pin.y - 10} l7 2.5 l-7 2.5z`} fill="#c8102e" />
        <circle cx={ball.x} cy={ball.y} r={3.2} fill="#fff" stroke="#000" strokeWidth={1} />
      </svg>
      <p className="bg-black/40 px-2 py-1 text-center text-[10px] text-white/90">{club.putter ? "Reading the putt" : `${club.name}: ring = ${club.carry} yds carry`}</p>
    </div>
  );
}

function Scorecard({ onClose }: { onClose: () => void }) {
  const done = golf.stage === "done";
  const out = golf.scores.reduce<number>((s, v) => s + (v ?? 0), 0);
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/40 p-3 backdrop-blur-[2px]" role="dialog" aria-label="Scorecard">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#d4b55a]/40 bg-[#fbf8ef] shadow-2xl">
        <div className="flex items-center justify-between bg-[#14382a] px-5 py-3 text-white">
          <div className="flex items-center gap-2">
            <FlagIcon className="size-5 text-[#d4b55a]" />
            <p className="font-heading text-xl font-extrabold tracking-wide">{done ? "Round complete" : "Scorecard"} · Firebird Ridge</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-white/15" aria-label="Close">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center text-sm tabular-nums">
            <tbody>
              <tr className="bg-[#14382a]/10 font-bold">
                <td className="px-2 py-1 text-left">Hole</td>
                {HOLES.map((h) => (
                  <td key={h.n} className={cn("px-1", h.n === golf.hole + 1 && !done && "bg-[#d4b55a]/40")}>
                    {h.n}
                  </td>
                ))}
                <td className="px-2">Out</td>
              </tr>
              <tr className="text-[#555]">
                <td className="px-2 py-1 text-left">Yards</td>
                {HOLES.map((h) => (
                  <td key={h.n}>{h.yards}</td>
                ))}
                <td>{HOLES.reduce((s, h) => s + h.yards, 0)}</td>
              </tr>
              <tr>
                <td className="px-2 py-1 text-left">Par</td>
                {HOLES.map((h) => (
                  <td key={h.n}>{h.par}</td>
                ))}
                <td className="font-bold">{PAR}</td>
              </tr>
              <tr className="font-heading text-lg font-extrabold">
                <td className="px-2 py-1 text-left font-sans text-sm">Score</td>
                {HOLES.map((h, i) => {
                  const v = golf.scores[i];
                  const d = v == null ? 0 : v - h.par;
                  return (
                    <td key={h.n} className="py-1">
                      {v == null ? (
                        <span className="text-[#bbb]">·</span>
                      ) : (
                        <span className={cn("inline-grid size-8 place-items-center", d <= -2 && "rounded-full border-4 border-double border-[#c8102e] text-[#c8102e]", d === -1 && "rounded-full border-2 border-[#c8102e] text-[#c8102e]", d === 1 && "border-2 border-[#1d3557]", d >= 2 && "border-4 border-double border-[#1d3557]")}>{v}</span>
                      )}
                    </td>
                  );
                })}
                <td>{out || "–"}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-center text-sm text-[#444]">
            {fmtPar(toPar())} through {golf.scores.filter((s) => s != null).length} {golf.scores.filter((s) => s != null).length === 1 ? "hole" : "holes"}
          </p>
        </div>
        {done && <Leaderboard />}
        {done && (
          <div className="flex justify-center gap-3 border-t border-black/10 p-4">
            <button type="button" onClick={startRound} className="rounded-full bg-[#14382a] px-5 py-2 font-heading font-extrabold tracking-wide text-white uppercase hover:bg-[#1d4d39]">
              Play again
            </button>
            <button type="button" onClick={quitGolf} className="rounded-full bg-black/10 px-5 py-2 font-heading font-extrabold tracking-wide uppercase hover:bg-black/20">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Leaderboard() {
  const list = golf.board;
  return (
    <div className="border-t border-black/10 px-5 py-3">
      <p className="mb-2 flex items-center gap-2 font-heading text-lg font-extrabold">
        <TrophyIcon className="size-5 text-[#b8902a]" /> Leaderboard <span className="text-xs font-normal text-[#666]">{golf.boardFrom === "everyone" ? "everyone's best rounds" : "rounds on this device (sign in to join everyone's)"}</span>
      </p>
      <ol className="max-h-48 space-y-1 overflow-y-auto">
        {list.slice(0, 10).map((r, i) => (
          <li key={i} className={cn("flex items-center gap-3 rounded-lg px-2 py-1 text-sm", r.you && golf.finished && r.total === golf.finished.total ? "bg-[#d4b55a]/30 font-bold" : i % 2 ? "bg-black/[0.03]" : "")}>
            <span className="w-6 text-right tabular-nums text-[#666]">{i + 1}</span>
            <span className="flex-1 truncate">{r.name}</span>
            <span className="tabular-nums">{r.total}</span>
            <span className={cn("w-10 text-right font-bold tabular-nums", r.toPar < 0 ? "text-[#c8102e]" : "")}>{fmtPar(r.toPar)}</span>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-[#666]">No rounds yet. Be the first!</li>}
      </ol>
    </div>
  );
}
