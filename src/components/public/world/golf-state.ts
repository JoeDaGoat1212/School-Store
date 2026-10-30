import { cutscene, endCutscene, setShot } from "./cutscene";
import { notify } from "./game-events";
import { provide } from "./interact";
import { profile } from "./profile";
import { player } from "./you";
import {
  CLUB,
  HOLES,
  PAR,
  RANGE,
  SURF,
  SURF_NAME,
  YARD,
  along,
  golfHeight,
  golfSlope,
  outOfBounds,
  surfaceAt,
  teeSpot,
  type Surface,
} from "./golf-course";
import { BAG, PUTTER, PUTT_MAX, playOut, puttSpeed, rollBall, scoreName, speedFor, launchBall, stepBall, strike, type Ball, type Ground, type Wind } from "./golf-physics";

/*
 * Playing golf. Plain TypeScript; golf.tsx draws it and golf-hud.tsx is the
 * screen.
 *
 *   - Start a round at the starter's hut by the 1st tee (or anywhere in the
 *     clubhouse grounds). Nine holes, par 37. Your score is kept for you,
 *     stroke by stroke, penalties and all.
 *   - Walk (or drive a golf cart) to your ball, and press E to step up to it.
 *     ← → aim, ↑ ↓ change club (each shows its stock carry). Then two
 *     presses of Space: the power bar fills and empties, press to set the
 *     power (past the top is an overswing, which makes a miss worse); then
 *     the accuracy needle swings side to side, press when it's in the green
 *     in the middle (left of it hooks it left, right slices it right). A ring shows where
 *     your club carries to, along with the wind; on the green a dotted line
 *     reads the putt for you.
 *   - The ball flies with real physics and leaves a shot tracer. Then go to
 *     where it stopped and hit again. Water: one-stroke penalty and a drop.
 *     Out of bounds: stroke and distance. The cart path: free relief. Ten on
 *     a hole and you pick up.
 *   - Finish the ninth and your round's saved to the leaderboard.
 *   - The driving range: step up to a mat and hit as many as you like; the
 *     carry and total come up after each one.
 */

export type Stage = "walk" | "address" | "flight" | "holed" | "done";
export type Note = { title: string; line?: string; tone: "good" | "bad" | "info"; until: number; key: number };
export type RoundRecord = { name: string; total: number; toPar: number; holes: number[]; date: string; you?: boolean };

const ground: Ground = { height: golfHeight, slope: golfSlope, surface: surfaceAt };
const MAX_STROKES = 10;

export const golf = {
  mode: "off" as "off" | "round" | "range",
  stage: "walk" as Stage,
  hole: 0,
  /** Strokes on each hole played (null: not yet). */
  scores: Array<number | null>(HOLES.length).fill(null),
  strokes: 0,
  /** Where the ball is lying. */
  ball: { x: 0, y: 0, z: 0 },
  lie: SURF.tee as Surface,
  /** Where the last shot was hit from (for stroke and distance). */
  last: { x: 0, z: 0, lie: SURF.tee as Surface },
  club: 0,
  /** Which way you're aiming (radians: 0 = +z, like the holes' turn). */
  aim: 0,
  /** The swing meters. The power bar fills and empties until you press Space; that sets the power (and "charging" goes true). Then the accuracy needle swings left and right until you press Space again: dead centre is straight, either side curves it. */
  power: 0,
  charging: false,
  /** When the power bar (or, once the power's set, the accuracy needle) started moving. */
  chargeAt: 0,
  /** The accuracy needle: −1 (far left) … 0 (dead centre) … 1 (far right). */
  acc: -1,
  /** The swing's animation: -1 at the top of the backswing, 0 at impact, 1 at the finish. */
  swing: 0,
  swingAt: -1,
  shot: null as Ball | null,
  tracer: [] as { x: number; y: number; z: number }[],
  wind: { x: 0, z: 0 } as Wind,
  note: null as Note | null,
  /** The range: which mat, and the last shot's numbers. */
  mat: 0,
  rangeShots: [] as { club: string; carry: number; total: number }[],
  /** The finished round (for the screen), and the leaderboard. */
  finished: null as RoundRecord | null,
  board: [] as RoundRecord[],
  boardFrom: "device" as "device" | "everyone",
  showCard: false,
  /** The predicted flight and where the club carries (for the aim ring), or the putt's read. */
  preview: null as null | { pts: { x: number; y: number; z: number }[]; carry: { x: number; y: number; z: number } | null; end: { x: number; y: number; z: number } },
  previewKey: "",
  now: 0,
  restAt: -1,
  /** The camera's spot while watching the ball. */
  cam: { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, ready: false },
  /** While aiming: when you last turned or changed club (the camera flies out to where it lands), how far out it's flown (0 at the ball, 1 over the landing spot), and whether you've asked to stay out there (C). */
  aimAt: -10,
  camBlend: 0,
  lookTarget: false,
};

/** How long the camera stays out over the landing spot after you stop aiming. */
const LOOK_HOLD = 2.4;

let counter = 0;
function say(title: string, line: string | undefined, tone: Note["tone"], seconds = 3.5) {
  golf.note = { title, line, tone, until: golf.now + seconds, key: ++counter };
  notify();
}

// ---- Asking about the round -----------------------------------------------------------------------

export const currentHole = () => HOLES[golf.hole];
export const pinOf = () => (golf.mode === "round" ? currentHole().pin : null);
export const toPar = () => golf.scores.reduce<number>((s, v, i) => (v == null ? s : s + v - HOLES[i].par), 0);
export const totalStrokes = () => golf.scores.reduce<number>((s, v) => s + (v ?? 0), 0);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const aimDir = () => ({ x: Math.sin(golf.aim), z: Math.cos(golf.aim) });
/** Yards to the pin from the ball (and how much higher or lower the green is, in yards). */
export function toPin() {
  const pin = pinOf();
  if (!pin) return null;
  return { yards: dist(golf.ball, pin) / YARD, rise: (golfHeight(pin.x, pin.z) - golf.ball.y) / YARD };
}
export const onGreen = () => golf.lie === SURF.green || golf.lie === SURF.fringe;

function windFor(seed: number) {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const r = a - Math.floor(a);
  const mph = Math.round(r * 13);
  const dir = r * 977 * Math.PI;
  const ms = mph / 2.237;
  return { x: Math.sin(dir) * ms, z: Math.cos(dir) * ms };
}

// ---- Starting and finishing ------------------------------------------------------------------------

function placeBall(x: number, z: number, lie?: Surface) {
  golf.ball = { x, y: golfHeight(x, z), z };
  golf.lie = lie ?? surfaceAt(x, z);
}

function toTee(n: number) {
  golf.hole = n;
  golf.strokes = 0;
  const h = HOLES[n];
  const t = teeSpot(h);
  placeBall(t.x, t.z, SURF.tee);
  golf.last = { x: t.x, z: t.z, lie: SURF.tee };
  golf.wind = windFor(n + 1 + Math.floor(Date.now() / 3.6e6));
  golf.aim = Math.atan2(h.teeDir.x, h.teeDir.z);
  golf.tracer = [];
  golf.stage = "walk";
  say(`Hole ${h.n}: ${h.name}`, `Par ${h.par} · ${h.yards} yards. Head to the tee.`, "info", 5);
}

export function startRound() {
  golf.mode = "round";
  golf.scores = Array(HOLES.length).fill(null);
  golf.finished = null;
  golf.showCard = false;
  toTee(0);
}

export function startRange(mat: number) {
  golf.mode = "range";
  golf.mat = mat;
  golf.rangeShots = [];
  golf.wind = windFor(99);
  const m = RANGE.mats[mat];
  placeBall(m.x, m.z, SURF.tee);
  golf.aim = 0;
  golf.club = 0;
  address();
  say("Driving range", "Hit as many as you like. Esc to stop.", "info", 4);
}

/** Stop playing (or leave the range). */
export function quitGolf() {
  if (golf.stage === "address" || golf.stage === "flight") stepAway();
  golf.mode = "off";
  golf.stage = "walk";
  golf.shot = null;
  golf.tracer = [];
  golf.preview = null;
  notify();
}

function finishHole() {
  const h = currentHole();
  golf.scores[golf.hole] = golf.strokes;
  const over = golf.strokes - h.par;
  say(golf.strokes >= MAX_STROKES ? "Picked up" : scoreName(golf.strokes, h.par), `${golf.strokes} on the ${ordinal(h.n)} · ${fmtPar(toPar())} for the round`, over < 0 ? "good" : over > 1 ? "bad" : "info", 4.5);
  golf.stage = "holed";
  golf.restAt = golf.now;
  golf.showCard = true;
}

function finishRound() {
  const holes = golf.scores.map((s) => s ?? MAX_STROKES);
  const total = holes.reduce((a, b) => a + b, 0);
  const rec: RoundRecord = { name: profile.signedIn ? profile.name : "You", total, toPar: total - PAR, holes, date: new Date().toISOString(), you: true };
  golf.finished = rec;
  golf.stage = "done";
  golf.showCard = true;
  saveLocal(rec);
  void sendRound(rec);
  say("Round complete!", `${total} (${fmtPar(total - PAR)}). Saved to the leaderboard.`, "good", 6);
}

// ---- Addressing the ball and swinging ----------------------------------------------------------------

/** Pick the club for the distance (the putter on the green). */
function bestClub() {
  if (golf.mode === "range") return golf.club;
  if (onGreen()) return PUTTER;
  const t = toPin();
  if (!t) return 0;
  const want = t.yards - t.rise * 0.8;
  // From the tee on a long hole: the driver.
  if (golf.lie === SURF.tee && currentHole().par > 3) return 0;
  // Otherwise the club that carries closest to the distance (but not past it by much).
  let best = BAG.length - 2;
  for (let i = 0; i < BAG.length - 1; i++) if (BAG[i].carry <= want * 1.04) return golf.lie === SURF.rough && i === 0 ? 1 : i;
  return best;
}

/** Aim at the pin, or (from the tee on a bending hole) at the fairway where your drive comes down. */
function defaultAim() {
  if (golf.mode === "range") return 0;
  const h = currentHole();
  const pin = h.pin;
  const club = BAG[golf.club];
  if (club.putter || dist(golf.ball, pin) < club.carry * YARD * 1.1) return Math.atan2(pin.x - golf.ball.x, pin.z - golf.ball.z);
  // How far along the hole the ball is, plus the club's carry.
  let s = 0;
  let bd = Infinity;
  for (const p of h.pts) {
    const d = dist(p, golf.ball);
    if (d < bd) {
      bd = d;
      s = p.s;
    }
  }
  const target = along(h, s + club.carry * YARD);
  return Math.atan2(target.x - golf.ball.x, target.z - golf.ball.z);
}

function address() {
  golf.stage = "address";
  golf.club = bestClub();
  golf.aim = defaultAim();
  golf.power = 0;
  golf.charging = false;
  golf.chargeAt = golf.now;
  golf.acc = -1;
  golf.swing = 0;
  golf.swingAt = -1;
  golf.restAt = -1;
  // (Whatever button was last clicked mustn't take the Space presses.)
  if (typeof document !== "undefined") (document.activeElement as HTMLElement | null)?.blur?.();
  golf.previewKey = "";
  // Fly out and show where this club lands, then come back to the ball.
  golf.aimAt = golf.now + 0.8;
  golf.camBlend = 0;
  player.frozen = true;
  player.showBody = true;
  standAtBall();
  notify();
}

/** Stand beside the ball, side-on to the target (a right-handed golfer). */
function standAtBall() {
  const d = aimDir();
  const putt = BAG[golf.club].putter;
  const back = putt ? 0.85 : 1.25;
  // The golfer stands on the left of the line (looking at the target) and faces across it.
  player.x = golf.ball.x - d.z * back;
  player.z = golf.ball.z + d.x * back;
  player.y = golfHeight(player.x, player.z);
  // Facing the ball: yaw 0 looks toward -z (sin yaw, -cos yaw).
  const fx = golf.ball.x - player.x;
  const fz = golf.ball.z - player.z;
  player.yaw = Math.atan2(fx, -fz);
  player.anim.golf = 1;
}

function stepAway() {
  player.frozen = false;
  player.anim.golf = 0;
  player.anim.swing = 0;
  golf.charging = false;
  endCutscene();
  // Back where you were standing, looking down the line.
  Object.assign(player, { hop: true, snap: true });
  player.yaw = Math.atan2(Math.sin(golf.aim), -Math.cos(golf.aim));
  player.showBody = player.view === "third";
  golf.preview = null;
  notify();
}

/** Step back from the ball without hitting. */
export function cancelAddress() {
  if (golf.stage !== "address") return;
  if (golf.mode === "range") {
    quitGolf();
    return;
  }
  golf.stage = "walk";
  stepAway();
}

/** ← → (dir −1 / 1), finer with Shift. */
export function turnAim(dir: number, dt: number, fine: boolean) {
  if (golf.stage !== "address" || golf.charging) return;
  const putt = BAG[golf.club].putter;
  golf.aim += dir * dt * (fine ? 0.05 : putt ? 0.16 : 0.5);
  golf.aimAt = golf.now;
  standAtBall();
}
export function changeClub(step: number) {
  if (golf.stage !== "address" || golf.charging) return;
  golf.club = Math.min(BAG.length - 1, Math.max(0, golf.club + step));
  golf.aimAt = golf.now;
  standAtBall();
  notify();
}
/** C: fly out over the landing spot and stay there (or come back to the ball). */
export function toggleLookTarget() {
  if (golf.stage !== "address" || golf.charging) return;
  golf.lookTarget = !golf.lookTarget;
  if (!golf.lookTarget) golf.aimAt = -10;
  notify();
}
/** How long the power bar takes to fill (it then empties again, and so on). */
const POWER_UP = 1.3;
/** The power bar: 0 → 1.1 (the top 10% is an overswing) → 0, over and over. */
export function powerBar(t: number) {
  const u = t % (POWER_UP * 2);
  return (u < POWER_UP ? u / POWER_UP : 2 - u / POWER_UP) * 1.1;
}
/** How long the accuracy needle takes to go across and back (quicker on a harder swing; slow and easy for a putt). */
export function needlePeriod(putt: boolean, power: number) {
  return putt ? 3 : 2.4 - 0.6 * Math.min(1, power);
}
/** The accuracy needle: starts far left, across to the right, and back. */
export function needle(t: number, period: number) {
  const u = (t % period) / period;
  return u < 0.5 ? -1 + u * 4 : 3 - u * 4;
}
/** Inside this (either side of the middle) is a perfect strike. */
export const PERFECT = 0.08;
/** And inside this, a good one. */
export const GOOD = 0.25;

/** The putter's power bar: full is about 1.6 times the distance to the hole (so short putts aren't a hair's breadth on the bar), up to 30 yards. In metres. */
export function puttReach() {
  const pin = pinOf();
  if (!pin) return PUTT_MAX;
  return Math.min(PUTT_MAX, Math.max(3, dist(golf.ball, pin) * 1.6));
}
/** What the power bar means for the club in hand (for strike(): a fraction of the putter's longest putt). */
const strikePower = () => (BAG[golf.club].putter ? (golf.power * puttReach()) / PUTT_MAX : golf.power);

/** Space: the first press sets the power, the second sets the accuracy and hits it. */
export function pressSwing() {
  if (golf.stage !== "address") return;
  if (!golf.charging) {
    golf.power = Math.max(0.04, powerBar(golf.now - golf.chargeAt));
    golf.charging = true;
    golf.chargeAt = golf.now;
    golf.acc = -1;
    golf.lookTarget = false;
    notify();
    return;
  }
  golf.acc = needle(golf.now - golf.chargeAt, needlePeriod(Boolean(BAG[golf.club].putter), golf.power));
  golf.charging = false;
  golf.swingAt = golf.now;
  golf.stage = "flight";
  golf.shot = null;
  // (The last shot's "it's stopped" time mustn't end this one before the club gets to the ball.)
  golf.restAt = -1;
  if (!BAG[golf.club].putter && Math.abs(golf.acc) < PERFECT) say("Perfect strike!", undefined, "good", 1.3);
  notify();
}

function hit() {
  const club = BAG[golf.club];
  const d = aimDir();
  const shot = strike(club, strikePower(), d.x, d.z, golf.ball, golf.lie, Math.random, golf.acc);
  golf.shot = shot.ball;
  golf.tracer = [{ x: golf.ball.x, y: golf.ball.y + 0.05, z: golf.ball.z }];
  golf.last = { x: golf.ball.x, z: golf.ball.z, lie: golf.lie };
  if (golf.mode === "round") golf.strokes++;
  golf.restAt = -1;
  golf.cam.ready = false;
  notify();
}

function landed(b: Ball) {
  const club = BAG[golf.club];
  const carry = b.landed ? dist(b.landed, b.start) / YARD : 0;
  const total = dist(b, b.start) / YARD;
  if (golf.mode === "range") {
    golf.rangeShots = [{ club: club.id, carry: Math.round(carry), total: Math.round(total) }, ...golf.rangeShots].slice(0, 8);
    say(`${club.name}: ${Math.round(carry)} yds carry`, `${Math.round(total)} yds total`, "info", 3);
    return;
  }
  if (b.phase === "holed") {
    placeBall(b.x, b.z);
    finishHole();
    return;
  }
  if (b.phase === "water") {
    golf.strokes++;
    // Drop on dry land where it went in, a couple of yards back toward where it was hit from.
    const back = Math.atan2(golf.last.x - b.dry.x, golf.last.z - b.dry.z);
    let x = b.dry.x;
    let z = b.dry.z;
    for (let k = 0; k < 20 && (surfaceAt(x, z) === SURF.water || surfaceAt(x, z) === SURF.bunker || surfaceAt(x, z) === SURF.path); k++) {
      x += Math.sin(back) * 1.5;
      z += Math.cos(back) * 1.5;
    }
    placeBall(x, z);
    say("Splash! In the water", "One-stroke penalty. Take your drop.", "bad");
  } else if (outOfBounds(b.x, b.z)) {
    golf.strokes++;
    placeBall(golf.last.x, golf.last.z, golf.last.lie);
    say("Out of bounds", "Stroke and distance: play again from where you hit it.", "bad");
  } else {
    let x = b.x;
    let z = b.z;
    let free = false;
    if (surfaceAt(x, z) === SURF.path) {
      // Free relief: the nearest spot off the path, no closer to the hole.
      const pin = currentHole().pin;
      for (let r = 1; r < 6 && !free; r += 0.5)
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const px = b.x + Math.sin(a) * r;
          const pz = b.z + Math.cos(a) * r;
          if (surfaceAt(px, pz) !== SURF.path && surfaceAt(px, pz) !== SURF.water && dist({ x: px, z: pz }, pin) >= dist(b, pin) - 0.5) {
            x = px;
            z = pz;
            free = true;
            break;
          }
        }
    }
    placeBall(x, z);
    const lie = SURF_NAME[golf.lie];
    if (free) say("Free relief from the cart path", `${Math.round(total)} yds`, "info");
    else if (club.putter) {
      const t = toPin();
      say(t ? `${Math.max(1, Math.round((t.yards * 3)))} ft to go` : "Good putt", undefined, "info", 2.5);
    } else say(`${Math.round(carry)} yds carry · ${Math.round(total)} total`, `In the ${lie.toLowerCase()}`, golf.lie === SURF.fairway || golf.lie === SURF.green ? "good" : "info");
  }
  if (golf.strokes >= MAX_STROKES) {
    golf.strokes = MAX_STROKES;
    finishHole();
  }
}

// ---- Every frame ---------------------------------------------------------------------------------------

/** Move the round on (call every frame). */
export function tickGolf(now: number, dt: number) {
  golf.now = now;
  if (golf.note && now > golf.note.until) {
    golf.note = null;
    notify();
  }
  if (golf.mode === "off") return;
  const club = BAG[golf.club];

  if (golf.stage === "address") {
    // The club goes back with the power bar, and waits at the top while the accuracy needle swings.
    if (!golf.charging) golf.power = powerBar(now - golf.chargeAt);
    else golf.acc = needle(now - golf.chargeAt, needlePeriod(Boolean(club.putter), golf.power));
    golf.swing = -Math.min(1, golf.power) * (club.putter ? 0.35 : 1);
    player.anim.swing = golf.swing;
    updatePreview();
    addressCamera(club.putter ?? false, dt);
  } else if (golf.stage === "flight") {
    const t = now - golf.swingAt;
    // Down to impact (0.22 s), then the follow-through.
    const down = club.putter ? 0.28 : 0.22;
    if (!golf.shot) {
      golf.swing = -Math.min(1, golf.power) * (club.putter ? 0.35 : 1) * (1 - Math.min(1, t / down));
      if (t >= down) hit();
    } else golf.swing = Math.min(club.putter ? 0.3 : 1, (t - down) / (club.putter ? 0.4 : 0.45));
    player.anim.swing = golf.swing;
    const b = golf.shot;
    if (b && (b.phase === "air" || b.phase === "roll")) {
      stepBall(b, dt, ground, golf.mode === "range" ? golf.wind : golf.wind, pinOf() ?? undefined);
      const last = golf.tracer[golf.tracer.length - 1];
      if (!last || Math.hypot(last.x - b.x, last.y - b.y, last.z - b.z) > 0.6) golf.tracer.push({ x: b.x, y: b.y, z: b.z });
      if (golf.tracer.length > 900) golf.tracer.splice(1, 1);
    }
    if (b && golf.restAt < 0 && b.phase !== "air" && b.phase !== "roll") {
      golf.restAt = now;
      landed(b);
    }
    flightCamera(dt);
    // A moment to watch it stop, then walk to it (or, at the range, the next ball's teed up).
    if (golf.restAt >= 0 && now - golf.restAt > (golf.mode === "range" ? 1.6 : 2.2) && golf.stage === "flight") {
      golf.shot = null;
      if (golf.mode === "range") {
        const m = RANGE.mats[golf.mat];
        placeBall(m.x, m.z, SURF.tee);
        address();
      } else {
        golf.stage = "walk";
        stepAway();
      }
    }
  } else if (golf.stage === "holed") {
    flightCamera(dt);
    if (now - golf.restAt > 3.5) {
      golf.shot = null;
      stepAway();
      if (golf.hole >= HOLES.length - 1) finishRound();
      else toTee(golf.hole + 1);
    }
  }
}

type V3 = [number, number, number];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * At the ball: the camera's behind you, looking down the line. When you
 * aim or change club it flies out along the shot, up and over, to hang
 * above where the ball comes down (looking at the ring and where it rolls
 * to), then flies back once you've stopped aiming. C keeps it out there;
 * starting the swing brings it straight back.
 */
function addressCamera(putt: boolean, dt: number) {
  const d = aimDir();
  const b = golf.ball;
  const back = putt ? 4.2 : 7;
  const up = putt ? 2.1 : 3.2;
  const home: V3 = [b.x - d.x * back, b.y + up, b.z - d.z * back];
  const ahead = putt ? 9 : 45;
  const homeLook: V3 = [b.x + d.x * ahead, b.y + (putt ? 0 : 3), b.z + d.z * ahead];

  const pv = golf.preview;
  const land = pv ? (pv.carry ?? pv.end) : null;
  const out = Boolean(land) && !golf.charging && (golf.lookTarget || golf.now - golf.aimAt < LOOK_HOLD);
  const rate = out ? 2.3 : golf.charging ? 5 : 2.2;
  golf.camBlend += ((out ? 1 : 0) - golf.camBlend) * (1 - Math.exp(-dt * rate));
  if (golf.camBlend < 0.002) golf.camBlend = 0;
  let pos = home;
  let look = homeLook;
  if (land && pv && golf.camBlend > 0) {
    const e = golf.camBlend * golf.camBlend * (3 - 2 * golf.camBlend);
    const span = Math.hypot(land.x - b.x, land.z - b.z);
    // Behind and above the landing spot, looking down on it (and on where it runs out to). For a putt: up over the whole line.
    const mid: V3 = [(b.x + land.x) / 2, (b.y + land.y) / 2, (b.z + land.z) / 2];
    const tb = Math.max(16, span * 0.24);
    const tu = Math.max(13, span * 0.17);
    const there: V3 = putt ? [mid[0] - d.x * span * 0.45, mid[1] + Math.max(3.5, span * 0.95), mid[2] - d.z * span * 0.45] : [land.x - d.x * tb, land.y + tu, land.z - d.z * tb];
    const thereLook: V3 = putt ? mid : [(land.x * 2 + pv.end.x) / 3, (land.y * 2 + pv.end.y) / 3, (land.z * 2 + pv.end.z) / 3];
    pos = mix(home, there, e);
    // Up and over on the way (like following the ball's flight).
    pos[1] += Math.sin(Math.PI * e) * (putt ? 1.5 : Math.min(38, 6 + span * 0.16));
    pos[1] = Math.max(pos[1], golfHeight(pos[0], pos[2]) + 1.4);
    look = mix(homeLook, thereLook, Math.min(1, e * 1.25));
  }
  setShot(pos, look);
  Object.assign(golf.cam, { x: pos[0], y: pos[1], z: pos[2], lx: look[0], ly: look[1], lz: look[2], ready: true });
}

/** Is the aiming camera out over the landing spot? (For the screen.) */
export const lookingAtTarget = () => golf.stage === "address" && golf.camBlend > 0.5;

function flightCamera(dt: number) {
  const b = golf.shot;
  const c = golf.cam;
  if (!b) return;
  const putt = BAG[golf.club].putter;
  // Watch it go from behind, then follow it down (and swing round to see it stop).
  const vx = b.vx;
  const vz = b.vz;
  const sp = Math.hypot(vx, vz);
  const dx = sp > 1 ? vx / sp : Math.sin(golf.aim);
  const dz = sp > 1 ? vz / sp : Math.cos(golf.aim);
  const t = golf.now - golf.swingAt;
  const away = putt ? 4.5 : 11 + Math.min(10, b.apex * 0.25);
  const want = { x: b.x - dx * away, y: b.y + (putt ? 2 : 5 + Math.min(8, b.apex * 0.2)), z: b.z - dz * away };
  const k = t < 0.6 ? 0.03 : 1 - Math.exp(-dt * (putt ? 4 : 2.2));
  c.x += (want.x - c.x) * k;
  c.y += (Math.max(want.y, golfHeight(c.x, c.z) + 1.5) - c.y) * k;
  c.z += (want.z - c.z) * k;
  c.lx += (b.x - c.lx) * Math.min(1, dt * 8);
  c.ly += (b.y - c.ly) * Math.min(1, dt * 8);
  c.lz += (b.z - c.lz) * Math.min(1, dt * 8);
  setShot([c.x, c.y, c.z], [c.lx, c.ly, c.lz]);
}

/** The predicted flight (no mis-hit, with the wind) for the aim ring, or the putt's line. Worked out when the aim or club changes. */
function updatePreview() {
  const club = BAG[golf.club];
  // (The putt read follows the power bar; a full swing's ring shows the club's stock carry.)
  const power = club.putter ? Math.min(1.1, golf.power) : 1;
  const key = `${golf.club}|${golf.aim.toFixed(3)}|${golf.mode}|${club.putter ? power.toFixed(2) : ""}|${golf.ball.x.toFixed(2)}`;
  if (key === golf.previewKey) return;
  golf.previewKey = key;
  const d = aimDir();
  const b = golf.ball;
  if (club.putter) {
    // The read: how a putt this hard rolls (at a guess of the distance before you start the stroke).
    const pin = pinOf();
    const guess = power > 0.02 ? power * puttReach() : pin ? Math.min(PUTT_MAX, dist(b, pin) * 1.05) : 6;
    const ball = rollBall(b.x, b.y, b.z, d.x, d.z, puttSpeed(guess));
    const { pts } = playOut(ball, ground, undefined, undefined, 20);
    golf.preview = { pts: pts.filter((_, i) => i % 3 === 0), carry: null, end: { x: ball.x, y: ball.y, z: ball.z } };
    return;
  }
  const speed = speedFor(club.carry * YARD, club.launch, club.spin);
  const ball = launchBall(b.x, b.y + 0.03, b.z, d.x, d.z, speed, club.launch, club.spin);
  const { pts } = playOut(ball, ground, golf.wind, undefined, 20);
  const land = ball.landed ? { x: ball.landed.x, y: golfHeight(ball.landed.x, ball.landed.z), z: ball.landed.z } : null;
  golf.preview = { pts: pts.filter((_, i) => i % 4 === 0), carry: land, end: { x: ball.x, y: ball.y, z: ball.z } };
}

// ---- Things to do here (E) -------------------------------------------------------------------------------

provide("golf", (you) => {
  if (!you.onFoot || you.driving) return null;
  if (golf.mode === "off") {
    // The starter's hut, the 1st tee and the clubhouse terrace.
    const s = CLUB.starter;
    const nearStart = Math.hypot(you.x - s.x, you.z - s.z) < 14 || Math.hypot(you.x - HOLES[0].tee.x, you.z - HOLES[0].tee.z) < 16 || (you.x > CLUB.terrace.x0 && you.x < CLUB.terrace.x1 && you.z > CLUB.terrace.z0 - 2 && you.z < CLUB.terrace.z1 + 6);
    if (nearStart) return { key: "E", text: "Play 9 holes (par 37)", tone: "money", run: startRound, first: true };
    const mat = RANGE.mats.findIndex((m) => Math.hypot(you.x - m.x, you.z - m.z) < 4);
    if (mat >= 0) return { key: "E", text: "Hit balls at the driving range", tone: "plain", run: () => startRange(mat), first: true };
    return null;
  }
  if (golf.mode === "round" && golf.stage === "walk" && Math.hypot(you.x - golf.ball.x, you.z - golf.ball.z) < 4.5) return { key: "E", text: "Step up to your ball", tone: "plain", run: address, first: true };
  return null;
});

// ---- The leaderboard ------------------------------------------------------------------------------------

const LOCAL = "nest:golf-rounds";
type Remote = { record: (holes: number[]) => Promise<unknown>; board: () => Promise<RoundRecord[] | null> };
let remote: Remote | null = null;

/** golf-hud.tsx hands over the server calls (signed-in players' rounds go on everyone's leaderboard). */
export function setGolfRemote(r: Remote) {
  remote = r;
}
function readLocal(): RoundRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveLocal(rec: RoundRecord) {
  const list = [...readLocal(), rec].sort((a, b) => a.total - b.total || a.date.localeCompare(b.date)).slice(0, 25);
  try {
    localStorage.setItem(LOCAL, JSON.stringify(list));
  } catch {
    // Private browsing.
  }
  if (golf.boardFrom === "device") golf.board = list.map((r) => ({ ...r, you: true }));
}
async function sendRound(rec: RoundRecord) {
  if (!remote || !profile.signedIn) return;
  await remote.record(rec.holes).catch(() => {});
  await loadBoard();
}
/** Load the leaderboard (everyone's, if the server has it; else this device's). */
export async function loadBoard() {
  const server = remote ? await remote.board().catch(() => null) : null;
  if (server && server.length) {
    golf.board = server;
    golf.boardFrom = "everyone";
  } else {
    golf.board = readLocal().map((r) => ({ ...r, you: true }));
    golf.boardFrom = "device";
  }
  notify();
}

// ---- Words ---------------------------------------------------------------------------------------------

export const fmtPar = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);
export const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
/** Is the golf camera in charge? */
export const golfCamera = () => golf.mode !== "off" && (golf.stage === "address" || golf.stage === "flight" || golf.stage === "holed") && cutscene.on;
