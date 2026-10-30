import { player } from "./you";
import { cutscene, endCutscene, setShot } from "./cutscene";
import { notify } from "./game-events";
import { banner, pop } from "./heist";
import { HOMES, access, homeOf, homePlan, homePoint, inEstates, isResident, ownsHome, type Home } from "./houses-layout";
import { provide } from "./interact";
import { pay, profile, saveProfile, usd } from "./profile";
import { REALTOR_PLAN, inRoom, roomOf, roomPoint } from "./rooms";
import { ESTATES } from "./world-map";

/*
 * Keystone Realty and Crescent Heights' gate. Plain TypeScript.
 *
 *   Buying a home: talk to the agent at Keystone Realty (E). Browse the
 *   listings, and take a tour before you buy: the camera sweeps round the
 *   outside, in through the front door, round the living room, the kitchen
 *   and the bedroom, and up over the grounds. Then buy it (cash and bank
 *   card together) and it's yours: the keys are in your wallet, its door
 *   opens for you, and you wake up there.
 *
 *   The gate: Crescent Heights' guard asks to see your ID. Residents (anyone
 *   who owns a home in there) are waved through; anyone else is turned
 *   away. (Tours take you in with the agent.)
 */

export type RealtyPanel = { kind: "listings"; pick?: string } | { kind: "after"; home: string } | { kind: "gate"; ok: boolean };

export const realty = {
  panel: null as RealtyPanel | null,
  tour: null as null | { home: string; start: number; back: { x: number; z: number; yaw: number } },
  now: 0,
};

export function openRealty(p: RealtyPanel | null) {
  realty.panel = p;
  notify();
}

const TOUR = 22;
const FADE = 0.7;

export function startTour(id: string) {
  const h = homeOf(id);
  if (!h) return;
  realty.panel = null;
  realty.tour = { home: id, start: realty.now, back: { x: player.x, z: player.z, yaw: player.yaw } };
  access.touring = id;
  player.frozen = true;
  notify();
}

/** Where the tour camera is, t seconds in. */
function tourShot(h: Home, t: number): { pos: [number, number, number]; look: [number, number, number]; caption: typeof cutscene.caption } {
  const P = homePlan(h);
  const H = h.floors * h.storey;
  const R = Math.max(h.w, h.d) * 1.25 + 8;
  const mid = homePoint(h, 0, -h.d / 2);
  const eye = 2.9;
  const at = (lx: number, y: number, lz: number): [number, number, number] => {
    const p = homePoint(h, lx, lz);
    return [p.x, y, p.z];
  };
  const lerp = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => {
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
  };
  const facts = [`${h.beds} bed · ${h.baths} bath`, `${h.sqft.toLocaleString("en-US")} sq ft`, usd(h.price)];
  if (t < 6) {
    // 1. Round the outside.
    const a = -1.1 + (t / 6) * 2.2;
    const p = homePoint(h, Math.sin(a) * R, -h.d / 2 + Math.cos(a) * R);
    return { pos: [p.x, H * 0.7 + 4, p.z], look: [mid.x, H * 0.45, mid.z], caption: { title: h.name, line: h.blurb, facts } };
  }
  if (t < 9) {
    // 2. Up the path and in through the front door.
    return { pos: lerp(at(0, eye + 1, 14), at(0, eye, -2), (t - 6) / 3), look: at(0, eye - 0.3, P.midZ), caption: { title: "Come on in", line: "Your own front door." } };
  }
  if (t < 12.5) {
    // 3. Round the living room.
    const k = (t - 9) / 3.5;
    return { pos: at(-P.W * 0.5 + k * P.W, eye, -1.4), look: at(P.W * 0.4 - k * P.W * 0.6, eye - 0.8, P.midZ + 1), caption: { title: "The living room", line: h.extras.includes("theater") ? "With a private cinema down the hall." : "Big windows, lots of light." } };
  }
  if (t < 15.5) {
    // 4. The kitchen.
    const k = (t - 12.5) / 3;
    return { pos: lerp(at(0, eye, P.midZ + 1.5), at(-1.2, eye, P.midZ - 1.2), k), look: at(P.kitchen.lx, 1.4, P.kitchen.lz), caption: { title: "The kitchen", line: h.price > 3e6 ? "A chef's kitchen with a marble island." : "Plenty of room to cook." } };
  }
  if (t < 18.5) {
    // 5. The bedroom.
    const k = (t - 15.5) / 3;
    return { pos: lerp(at(1.2, eye, P.midZ - 1.2), at(P.W * 0.25, eye, P.splitDoorZ - 0.6), k), look: at(P.bedroom.lx, 1, P.bedroom.lz), caption: { title: `${h.beds} bedroom${h.beds > 1 ? "s" : ""}`, line: h.floors > 1 ? `Over ${h.floors} floors.` : "All on one floor." } };
  }
  // 6. Up over the grounds.
  const k = (t - 18.5) / 3.5;
  const from = at(0, H + 6, 12);
  const to = at(R * 0.6, H + R * 0.8, R * 0.7);
  const extras = h.extras.filter((e) => e !== "porch" && e !== "deck");
  return { pos: lerp(from, to, Math.min(1, k)), look: [mid.x, 1, mid.z], caption: { title: "The grounds", line: extras.length ? `With ${extras.map((e) => ({ pool: "a pool", garage: "a garage", tennis: "a tennis court", helipad: "a helipad", hottub: "a hot tub", fountain: "a fountain", gym: "a gym", theater: "a cinema" })[e as "pool"]).join(", ")}.` : "A lovely yard.", facts } };
}

/** Every frame. */
export function tickRealty(now: number, you: { x: number; z: number }) {
  realty.now = now;
  access.now = now;
  const T = realty.tour;
  if (T) {
    const h = homeOf(T.home)!;
    const t = now - T.start;
    const shot = tourShot(h, Math.min(TOUR, t));
    setShot(shot.pos, shot.look);
    if (cutscene.caption?.title !== shot.caption?.title) {
      cutscene.caption = shot.caption;
      notify();
    }
    cutscene.fade = t < FADE ? 1 - t / FADE : t > TOUR - FADE ? Math.min(1, (t - (TOUR - FADE)) / FADE) : 0;
    if (t > TOUR) {
      realty.tour = null;
      access.touring = null;
      endCutscene();
      player.frozen = false;
      Object.assign(player, { x: T.back.x, z: T.back.z, yaw: T.back.yaw, hop: true, snap: true });
      realty.panel = { kind: "after", home: h.id };
      notify();
    }
  }
  // Leaving Crescent Heights: the barrier lifts as you drive (or walk) up to it from inside.
  if (Math.abs(you.x - ESTATES.gate.x) < 16 && you.z > ESTATES.gate.z && you.z < ESTATES.gate.z + 16) access.gateOpenUntil = Math.max(access.gateOpenUntil, now + 4);
}

export function skipTour() {
  if (realty.tour) realty.tour.start = realty.now - TOUR + FADE;
}

export function buyHome(id: string) {
  const h = homeOf(id);
  if (!h) return "That home isn't for sale.";
  if (ownsHome(id)) return "You already own it.";
  if (!pay(h.price)) return `You need ${usd(h.price)} (cash and bank together). You've got ${usd(profile.cash + profile.bank)}.`;
  profile.houses.push(id);
  profile.home = id;
  saveProfile(true);
  pop(-h.price, h.name);
  banner("escaped", "It's yours!", `Welcome home to ${h.name}. The keys are in your wallet, and you'll wake up here.`, 5);
  realty.panel = null;
  notify();
  return null;
}

/** The guard checks your ID. */
function showId() {
  const ok = isResident();
  if (ok) access.gateOpenUntil = realty.now + 14;
  realty.panel = { kind: "gate", ok };
  notify();
}

export const listings = () => HOMES;

provide("realty", (you) => {
  if (!you.onFoot && !you.driving) return null;
  // At the agent's desk.
  if (you.onFoot && inRoom(roomOf("realtor"), you.x, you.z)) {
    const c = roomPoint("realtor", REALTOR_PLAN.client.lx, REALTOR_PLAN.client.lz);
    if (Math.hypot(you.x - c.x, you.z - c.z) < 4) return { key: "E", text: "Talk to the agent (homes for sale)", tone: "money", run: () => openRealty({ kind: "listings" }) };
  }
  // At the gate, from outside.
  const g = ESTATES.gate;
  if (Math.abs(you.x - g.x) < 14 && you.z < g.z && you.z > g.z - 16 && !inEstates(you.x, you.z) && realty.now > access.gateOpenUntil)
    return { key: you.driving ? "Q" : "E", text: "Show your ID to the guard", run: showId };
  return null;
});
