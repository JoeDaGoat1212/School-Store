import { SURF, type Surface } from "./golf-course";

/*
 * The golf ball, as real physics. Plain maths (no 3D code), so it can be
 * tested on its own (golf.test.ts). Units: metres, seconds, radians.
 *
 *   In the air: gravity, air drag, and lift from backspin (the Magnus
 *   effect: a spinning ball climbs and hangs, and a tilted spin axis curves
 *   it), all worked out against the air, so wind pushes it about. Spin
 *   slowly dies away.
 *   Landing: it bounces off the ground's slope, losing speed depending on
 *   what it lands on (a firm fairway, soft green, thick rough, or it plugs in
 *   the sand), and backspin bites: wedges stop quickly, a driver runs on.
 *   Rolling: gravity pulls it down slopes (putts break), and the grass slows
 *   it (fast greens, slow rough). It drops in the hole if it's not going too
 *   fast, or lips out if it's close.
 *
 * Every club in the bag has a stock (full-swing) carry. Its ball speed is
 * worked out once by flying it on flat, still ground until the carry matches,
 * so the numbers in the bag are what you really get.
 */

export type Club = {
  id: string;
  name: string;
  /** Stock carry at a full swing (yards). */
  carry: number;
  /** Launch angle (degrees) and backspin (rpm). */
  launch: number;
  spin: number;
  /** How much a mis-hit strays with this club (bigger for longer clubs). */
  stray: number;
  putter?: boolean;
};

export const BAG: Club[] = [
  { id: "D", name: "Driver", carry: 250, launch: 11, spin: 2700, stray: 1.15 },
  { id: "3W", name: "3 Wood", carry: 230, launch: 12, spin: 3500, stray: 1.0 },
  { id: "5W", name: "5 Wood", carry: 215, launch: 13.5, spin: 4300, stray: 0.95 },
  { id: "4H", name: "4 Hybrid", carry: 200, launch: 14.5, spin: 4600, stray: 0.85 },
  { id: "5i", name: "5 Iron", carry: 185, launch: 15, spin: 5300, stray: 0.8 },
  { id: "6i", name: "6 Iron", carry: 175, launch: 16.5, spin: 6100, stray: 0.75 },
  { id: "7i", name: "7 Iron", carry: 165, launch: 18, spin: 6900, stray: 0.7 },
  { id: "8i", name: "8 Iron", carry: 150, launch: 20, spin: 7700, stray: 0.65 },
  { id: "9i", name: "9 Iron", carry: 140, launch: 22.5, spin: 8500, stray: 0.6 },
  { id: "PW", name: "Pitching Wedge", carry: 125, launch: 25, spin: 9200, stray: 0.55 },
  { id: "GW", name: "Gap Wedge", carry: 110, launch: 27.5, spin: 9700, stray: 0.5 },
  { id: "SW", name: "Sand Wedge", carry: 90, launch: 31, spin: 10100, stray: 0.45 },
  { id: "LW", name: "Lob Wedge", carry: 70, launch: 35, spin: 10400, stray: 0.4 },
  { id: "P", name: "Putter", carry: 0, launch: 0, spin: 0, stray: 0.15, putter: true },
];
export const PUTTER = BAG.length - 1;

// ---- Constants ----------------------------------------------------------------------------------

const G = 9.81;
const R = 0.02135; // ball radius
const RHO = 1.225;
const AREA = Math.PI * R * R;
const MASS = 0.04593;
const K = (0.5 * RHO * AREA) / MASS;
const RPM = (2 * Math.PI) / 60;
/** The hole's radius (a little generous: the world's people are a bit bigger than life). */
export const CUP = 0.075;
const YARD = 0.9144;

/** How each surface treats the ball: bounce (0…1), speed kept along the ground on a bounce, how fast it slows rolling (m/s²). */
const GROUND: Record<number, { e: number; keep: number; roll: number }> = {
  [SURF.fairway]: { e: 0.32, keep: 0.62, roll: 2.1 },
  [SURF.tee]: { e: 0.32, keep: 0.6, roll: 2.2 },
  [SURF.range]: { e: 0.3, keep: 0.6, roll: 2.3 },
  [SURF.rough]: { e: 0.16, keep: 0.36, roll: 5.2 },
  [SURF.fringe]: { e: 0.2, keep: 0.42, roll: 1.3 },
  [SURF.green]: { e: 0.2, keep: 0.42, roll: 0.58 },
  [SURF.bunker]: { e: 0.03, keep: 0.08, roll: 14 },
  [SURF.path]: { e: 0.55, keep: 0.82, roll: 0.9 },
  [SURF.paved]: { e: 0.55, keep: 0.82, roll: 0.9 },
  [SURF.water]: { e: 0, keep: 0, roll: 99 },
};
export const rollDecel = (s: Surface) => (GROUND[s] ?? GROUND[SURF.rough]).roll;

// ---- The ball -----------------------------------------------------------------------------------

export type Ground = {
  height: (x: number, z: number) => number;
  slope: (x: number, z: number) => { sx: number; sz: number };
  surface: (x: number, z: number) => Surface;
};
export type Wind = { x: number; z: number };

export type Phase = "air" | "roll" | "rest" | "water" | "holed";
export type Ball = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin speed (rad/s) and the axis it spins round (unit vector). */
  w: number;
  ax: number;
  ay: number;
  az: number;
  phase: Phase;
  /** Seconds since it was hit. */
  t: number;
  start: { x: number; z: number };
  /** Where it first came down (for the carry), and the highest it got (above the start). */
  landed: { x: number; z: number } | null;
  apex: number;
  bounces: number;
  /** The last spot it was on dry land (for a drop after water). */
  dry: { x: number; z: number };
  lipped: boolean;
};

const ZERO: Wind = { x: 0, z: 0 };

/** Start a shot: from (x, y, z), toward (dx, dz) (unit), at this ball speed, with the club's launch and spin. */
export function launchBall(x: number, y: number, z: number, dx: number, dz: number, speed: number, launchDeg: number, spinRpm: number, curveDeg = 0): Ball {
  const la = (launchDeg * Math.PI) / 180;
  // Backspin axis: across the line of flight (to the left of it), tilted by the curve (+ curves right).
  const bx = -dz;
  const bz = dx;
  const tilt = (-curveDeg * Math.PI) / 180;
  return {
    x,
    y,
    z,
    vx: dx * Math.cos(la) * speed,
    vy: Math.sin(la) * speed,
    vz: dz * Math.cos(la) * speed,
    w: spinRpm * RPM,
    ax: bx * Math.cos(tilt),
    ay: Math.sin(tilt),
    az: bz * Math.cos(tilt),
    phase: "air",
    t: 0,
    start: { x, z },
    landed: null,
    apex: 0,
    bounces: 0,
    dry: { x, z },
    lipped: false,
  };
}

/** A putt (or any shot along the ground): rolling from the start. */
export function rollBall(x: number, y: number, z: number, dx: number, dz: number, speed: number): Ball {
  const b = launchBall(x, y, z, dx, dz, speed, 0, 0);
  b.phase = "roll";
  b.vy = 0;
  b.landed = { x, z };
  return b;
}

/** Move the ball on by dt seconds (in small steps). `pin` is the hole (if it can go in). */
export function stepBall(b: Ball, dt: number, ground: Ground, wind: Wind = ZERO, pin?: { x: number; z: number }) {
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    if (b.phase === "air") air(b, h, ground, wind, pin);
    else if (b.phase === "roll") roll(b, h, ground, pin);
    else break;
    b.t += h;
  }
}

function air(b: Ball, h: number, ground: Ground, wind: Wind, pin?: { x: number; z: number }) {
  const rx = b.vx - wind.x;
  const ry = b.vy;
  const rz = b.vz - wind.z;
  const v = Math.hypot(rx, ry, rz) || 1e-6;
  const S = (R * b.w) / v;
  const cl = Math.min(0.3, 0.05 + 1.6 * S);
  const cd = 0.21 + 0.25 * Math.min(S, 0.4);
  // Lift: spin axis × velocity.
  const lx = b.ay * rz - b.az * ry;
  const ly = b.az * rx - b.ax * rz;
  const lz = b.ax * ry - b.ay * rx;
  const ax = -K * cd * v * rx + K * cl * v * lx;
  const ay = -G - K * cd * v * ry + K * cl * v * ly;
  const az = -K * cd * v * rz + K * cl * v * lz;
  b.vx += ax * h;
  b.vy += ay * h;
  b.vz += az * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;
  b.w *= Math.exp(-h / 24);
  const gy = ground.height(b.x, b.z);
  b.apex = Math.max(b.apex, b.y - gy);
  if (b.y > gy + 0.02) return;
  // ---- Down ----
  b.y = gy + 0.02;
  const surf = ground.surface(b.x, b.z);
  if (!b.landed) b.landed = { x: b.x, z: b.z };
  if (surf === SURF.water) {
    b.phase = "water";
    return;
  }
  b.dry = { x: b.x, z: b.z };
  // Straight in the hole?
  if (pin && Math.hypot(b.x - pin.x, b.z - pin.z) < CUP && b.vy > -12) {
    b.phase = "holed";
    b.x = pin.x;
    b.z = pin.z;
    return;
  }
  const { sx, sz } = ground.slope(b.x, b.z);
  // The ground's normal.
  const nl = Math.hypot(sx, 1, sz);
  const nx = -sx / nl;
  const ny = 1 / nl;
  const nz = -sz / nl;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  const tx = b.vx - vn * nx;
  const ty = b.vy - vn * ny;
  const tz = b.vz - vn * nz;
  const g = GROUND[surf] ?? GROUND[SURF.rough];
  // Backspin bites on the first bounces (more on soft greens, and when it comes down steeply).
  const steep = Math.min(1, Math.abs(vn) / 22);
  const soft = surf === SURF.green || surf === SURF.fringe ? 1.35 : 1;
  const bite = Math.min(0.88, (b.w / RPM / 9000) * (b.bounces === 0 ? 1 : 0.5) * (0.35 + 0.65 * steep) * soft);
  const keep = g.keep * (1 - bite);
  const out = -vn * g.e;
  b.vx = tx * keep + nx * out;
  b.vy = ty * keep + ny * out;
  b.vz = tz * keep + nz * out;
  b.w *= 0.4;
  b.bounces++;
  // Not much bounce left: rolling.
  if (out < 1.0 || surf === SURF.bunker) {
    b.phase = "roll";
    b.vy = 0;
  }
}

function roll(b: Ball, h: number, ground: Ground, pin?: { x: number; z: number }) {
  const surf = ground.surface(b.x, b.z);
  if (surf === SURF.water) {
    b.phase = "water";
    return;
  }
  const { sx, sz } = ground.slope(b.x, b.z);
  const decel = rollDecel(surf);
  const v = Math.hypot(b.vx, b.vz);
  // Gravity along the slope (5/7: a rolling ball, not a sliding one).
  const gx = -G * sx * (5 / 7);
  const gz = -G * sz * (5 / 7);
  if (v < 0.05) {
    // Stopped, unless the slope's steep enough to start it rolling again.
    if (Math.hypot(gx, gz) < decel * 1.05) {
      b.vx = b.vz = 0;
      b.phase = "rest";
      return;
    }
  }
  const fx = v > 1e-4 ? (-decel * b.vx) / v : 0;
  const fz = v > 1e-4 ? (-decel * b.vz) / v : 0;
  const nvx = b.vx + (gx + fx) * h;
  const nvz = b.vz + (gz + fz) * h;
  // Friction can stop it, but never send it backwards.
  if (v > 1e-4 && nvx * b.vx + nvz * b.vz < 0 && Math.hypot(gx, gz) < decel) {
    b.vx = b.vz = 0;
    b.phase = "rest";
    return;
  }
  b.vx = nvx;
  b.vz = nvz;
  b.x += b.vx * h;
  b.z += b.vz * h;
  b.y = ground.height(b.x, b.z) + 0.02;
  if (surf !== SURF.bunker) b.dry = { x: b.x, z: b.z };
  // The hole.
  if (pin) {
    const d = Math.hypot(b.x - pin.x, b.z - pin.z);
    const sp = Math.hypot(b.vx, b.vz);
    if (d < CUP) {
      if (sp < 1.3) {
        b.phase = "holed";
        b.x = pin.x;
        b.z = pin.z;
        b.vx = b.vz = 0;
        return;
      }
      if (sp < 1.9 && !b.lipped) {
        // Lipped out: round the rim and away, slower.
        b.lipped = true;
        const a = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const vx = b.vx * c - b.vz * s;
        const vz = b.vx * s + b.vz * c;
        b.vx = vx * 0.55;
        b.vz = vz * 0.55;
      }
    }
  }
}

// ---- Stock yardages ------------------------------------------------------------------------------

const FLAT: Ground = { height: () => 0, slope: () => ({ sx: 0, sz: 0 }), surface: () => SURF.fairway };

/** Carry (metres) for a ball hit at this speed with this launch and spin, on flat still ground. */
export function carryOf(speed: number, launchDeg: number, spinRpm: number) {
  const b = launchBall(0, 0.03, 0, 0, 1, speed, launchDeg, spinRpm);
  for (let i = 0; i < 4000 && b.phase === "air"; i++) stepBall(b, 1 / 120, FLAT);
  return b.landed ? Math.hypot(b.landed.x, b.landed.z) : 0;
}
/** The ball speed that carries this far (metres). */
export function speedFor(carryM: number, launchDeg: number, spinRpm: number) {
  let lo = 2;
  let hi = 95;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (carryOf(mid, launchDeg, spinRpm) < carryM) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Spin and speed change depending on where the ball's lying. */
export function lieEffect(surf: Surface, club: Club) {
  switch (surf) {
    case SURF.rough:
      return { speed: 0.9, spin: 0.55, stray: 1.5 };
    case SURF.bunker:
      return club.id === "SW" || club.id === "LW" || club.id === "GW" ? { speed: 0.88, spin: 0.75, stray: 1.3 } : { speed: 0.62, spin: 0.6, stray: 2.2 };
    case SURF.path:
    case SURF.paved:
      return { speed: 0.97, spin: 0.9, stray: 1.2 };
    default:
      return { speed: 1, spin: 1, stray: 1 };
  }
}

/** How fast to roll a putt so it would go this far on a flat green. */
export const puttSpeed = (metres: number) => Math.sqrt(2 * rollDecel(SURF.green) * Math.max(0.05, metres));
/** The longest putt (at full power): 30 yards. */
export const PUTT_MAX = 30 * YARD;

export type Shot = { ball: Ball; face: number; curve: number };

/**
 * Hit it: the club, how hard (0…1, a little over 1 is an overswing), which
 * way (unit dx, dz), from where, and the lie. Mis-hits (a random face angle
 * and curve) get worse with longer clubs, overswinging and bad lies.
 */
export function strike(club: Club, power: number, dx: number, dz: number, from: { x: number; y: number; z: number }, surf: Surface, random: () => number = Math.random, acc?: number): Shot {
  const gauss = () => {
    const u = Math.max(1e-6, random());
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const turn = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: dx * Math.cos(a) - dz * Math.sin(a), z: dx * Math.sin(a) + dz * Math.cos(a) };
  };
  if (club.putter) {
    // With the accuracy bar: the face is open (+, right) or shut (−, left) by where you stopped it, plus a hair of luck.
    const face = acc != null ? acc * 4.5 + gauss() * 0.12 : gauss() * 0.35 * club.stray * (1 + Math.max(0, power - 1) * 6);
    const d = turn(face);
    const metres = PUTT_MAX * Math.min(1.1, power) * (1 + gauss() * 0.02);
    return { ball: rollBall(from.x, from.y, from.z, d.x, d.z, puttSpeed(metres)), face, curve: 0 };
  }
  const lie = lieEffect(surf, club);
  const over = Math.max(0, power - 1);
  const sigma = club.stray * lie.stray * (1 + over * 9) * (0.55 + 0.45 * Math.min(1, power));
  let face: number;
  let curve: number;
  if (acc != null) {
    // The accuracy bar: dead centre flies straight; off to the right pushes and slices it right, to the left pulls and hooks it left.
    // (Longer clubs, bad lies and an overswing make a miss worse.)
    const k = (0.35 + club.stray * 0.85) * lie.stray * (1 + over * 4);
    face = acc * 2.4 * k + gauss() * 0.15 * sigma;
    curve = acc * 9 * k + gauss() * 0.4 * sigma + face * 0.8;
  } else {
    face = gauss() * 1.1 * sigma;
    curve = gauss() * 4.5 * sigma + face * 1.6;
  }
  const d = turn(face);
  // A thin or heavy strike (well off the centre) loses a little distance too.
  const flush = acc != null ? 1 - Math.min(0.12, Math.abs(acc) * Math.abs(acc) * 0.12) : 1;
  const speed = speedFor(club.carry * YARD * Math.min(1.08, power), club.launch, club.spin) * lie.speed * flush * (1 + gauss() * 0.012);
  return { ball: launchBall(from.x, from.y + 0.03, from.z, d.x, d.z, speed, club.launch * (surf === SURF.rough ? 0.92 : 1), club.spin * lie.spin, curve), face, curve };
}

/** Fly (and roll) a whole shot through to the end (for previews and tests). Returns the ball and the points it went through. */
export function playOut(ball: Ball, ground: Ground, wind: Wind = ZERO, pin?: { x: number; z: number }, maxT = 40) {
  const pts: { x: number; y: number; z: number }[] = [{ x: ball.x, y: ball.y, z: ball.z }];
  let t = 0;
  while ((ball.phase === "air" || ball.phase === "roll") && t < maxT) {
    stepBall(ball, 1 / 60, ground, wind, pin);
    t += 1 / 60;
    pts.push({ x: ball.x, y: ball.y, z: ball.z });
  }
  return { ball, pts };
}

/** The name for a score on a hole. */
export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  return d <= -3 ? "Albatross!" : d === -2 ? "Eagle!" : d === -1 ? "Birdie!" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Double bogey" : d === 3 ? "Triple bogey" : `+${d}`;
}
