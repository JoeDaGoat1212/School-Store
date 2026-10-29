import { player } from "./you";
import { banner, pop } from "./heist";
import { notify } from "./game-events";
import { provide } from "./interact";
import { eat, life } from "./life";
import { describe, MENUS, NAMES, priceOf, randomOrder, score, shortName, verdict, type Build } from "./menus";
import { JOB_LEVELS, earn, pay, profile, saveProfile, transfer, usd, type JobProgress } from "./profile";
import { inRoom, roomOf, roomPoint, shopPlan } from "./rooms";
import { SHOPS, type ShopKey } from "./world-map";

/*
 * Working at the shops on Restaurant Row. Plain TypeScript: shops.tsx draws
 * the customers and staff, job-panels.tsx is the on-screen résumé, order
 * screen and kitchen, and this runs it all.
 *
 *   Applying: walk into a shop and ask for an application (Q). Fill in the
 *   résumé; it goes to the store's admins (Admin → City jobs), who hire you
 *   (or not). Once you're hired, walk in and clock in (E).
 *
 *   On shift: customers come in (sometimes a rush, sometimes steady,
 *   sometimes nobody for a while), order at the kiosk by the door and wait.
 *   Take their order at the order screen on the counter, make it in the
 *   kitchen (by hand: building it, then baking / grilling / pulling the
 *   shot / scooping / trimming), and hand it over at the counter. Everyone
 *   has a timer: take too long and they walk out. Three walkouts in one
 *   shift and you're fired.
 *
 *   Pay: $15.50 an hour to start (an hour of shift time is 40 seconds), paid
 *   into your bank when you clock out, plus tips (paid in cash, better for
 *   better food). Serve enough customers and you're promoted (JOB_LEVELS):
 *   more pay each time.
 *
 *   When nobody's working a shop, an NPC does the job.
 */

/** Real seconds in an hour of shift time. */
export const GAME_HOUR = 40;
/** Walkouts in one shift before you're fired. */
export const STRIKES = 3;
/** Customers served (well) to reach each level. */
export const PROMOTE_AT = [0, 10, 25, 45, 70, 100];

type P = { x: number; z: number };

export type Customer = {
  id: number;
  name: string;
  seed: number;
  order: Build;
  price: number;
  state: "in" | "queue" | "kiosk" | "ordered" | "waiting" | "leaving";
  /** Seconds on the game clock. */
  arrived: number;
  patience: number;
  /** When they finished at the kiosk (ordered) or the order was taken. */
  at: number;
  pos: P;
  /** Where they're walking to, and the stops after that. */
  path: P[];
  yaw: number;
  moving: boolean;
  mood: "ok" | "happy" | "angry";
  /** Holding their food (on the way out). */
  holding: boolean;
  /** Which waiting spot (along the counter). */
  slot: number;
  /** What they thought (the speech bubble). */
  said: string;
};

export type Ticket = { customer: number; name: string; order: Build; price: number; takenAt: number };

type ShopSim = {
  customers: Customer[];
  phase: "rush" | "steady" | "quiet";
  phaseUntil: number;
  nextAt: number;
  /** The NPC's next move (taking an order, serving it). */
  npcAt: number;
};

export type Shift = {
  shop: ShopKey;
  startedAt: number;
  served: number;
  walkouts: number;
  tips: number;
  tickets: Ticket[];
  /** What you're carrying to the counter. */
  carrying: null | { customer: number; name: string; label: string; quality: number; made: Build };
};

export type Panel =
  | { kind: "resume"; shop: ShopKey }
  | { kind: "orders"; shop: ShopKey }
  | { kind: "kitchen"; shop: ShopKey; ticket: number }
  | { kind: "job"; shop: ShopKey };

/** The server (world-app.tsx hands these over): send a résumé, quit / get fired, a promotion. */
export type JobRemote = {
  apply: (shop: ShopKey, answers: Record<string, unknown>) => Promise<{ error?: string; ok?: boolean }>;
  leave: (shop: ShopKey, reason: "quit" | "fired") => Promise<unknown>;
  level: (shop: ShopKey, level: number) => Promise<unknown>;
  refresh: () => Promise<unknown>;
};

const fresh = (): ShopSim => ({ customers: [], phase: "steady", phaseUntil: 0, nextAt: 0, npcAt: 0 });

export const jobs = {
  now: 0,
  shops: Object.fromEntries((Object.keys(SHOPS) as ShopKey[]).map((k) => [k, fresh()])) as Record<ShopKey, ShopSim>,
  shift: null as Shift | null,
  panel: null as Panel | null,
  remote: null as JobRemote | null,
  /** Testing only: pretend you're hired everywhere. */
  hireAll: false,
};

let nextId = 1;

// ---- Where things are -----------------------------------------------------------------------

const at = (shop: ShopKey, lx: number, lz: number) => roomPoint(shop, lx, lz);
const DOOR_OUT = (shop: ShopKey) => at(shop, 0, 2.6);
const DOOR_IN = (shop: ShopKey) => at(shop, 0, -2);
function waitingSpot(shop: ShopKey, slot: number) {
  const P = shopPlan(shop);
  const n = 6;
  const lx = P.waiting.lx0 + ((P.waiting.lx1 - P.waiting.lx0) * (slot % n)) / (n - 1);
  return at(shop, lx, P.waiting.lz + (slot >= n ? 1.6 : 0));
}

// ---- Status ---------------------------------------------------------------------------------

/** Your progress at a shop (made the first time it's needed). */
export function progressAt(shop: ShopKey): JobProgress {
  let p = profile.jobs[shop];
  if (!p) profile.jobs[shop] = p = { level: 0, orders: 0, walkouts: 0, hours: 0, earned: 0 };
  return p;
}
/** Hired, applied (waiting to hear), or neither. */
export function jobStatus(shop: ShopKey): "hired" | "pending" | "none" | "fired" {
  if (jobs.hireAll) return "hired";
  const apps = profile.applications.filter((a) => a.business === shop);
  const latest = apps.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest) return "none";
  if (latest.status === "hired") return "hired";
  if (latest.status === "pending") return "pending";
  if (latest.status === "fired") return "fired";
  return "none";
}
export function levelAt(shop: ShopKey) {
  const app = profile.applications.find((a) => a.business === shop && a.status === "hired");
  return Math.min(JOB_LEVELS.length - 1, Math.max(progressAt(shop).level, app?.level ?? 0));
}
export const wageAt = (shop: ShopKey) => JOB_LEVELS[levelAt(shop)].wage;

/** Which shop you're standing in. */
export function shopAt(x: number, z: number): ShopKey | null {
  for (const k of Object.keys(SHOPS) as ShopKey[]) if (inRoom(roomOf(k), x, z)) return k;
  return null;
}

/** Hours worked this shift, and what you've earned in wages so far. */
export function shiftPay() {
  const s = jobs.shift;
  if (!s) return { hours: 0, wages: 0 };
  const hours = (jobs.now - s.startedAt) / GAME_HOUR;
  return { hours, wages: Math.round(hours * wageAt(s.shop) * 100) / 100 };
}
/** The shift clock: "10:24 AM" (shifts start at 9). */
export function shiftClock() {
  const { hours } = shiftPay();
  const mins = Math.floor(9 * 60 + hours * 60) % (24 * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ---- Clocking in and out --------------------------------------------------------------------

export function clockIn(shop: ShopKey) {
  if (jobs.shift) return;
  jobs.shift = { shop, startedAt: jobs.now, served: 0, walkouts: 0, tips: 0, tickets: [], carrying: null };
  // The NPC goes on break: anyone waiting needs serving by you now.
  const sim = jobs.shops[shop];
  for (const c of sim.customers) if (c.state === "waiting") jobs.shift.tickets.push({ customer: c.id, name: c.name, order: c.order, price: c.price, takenAt: jobs.now });
  const p = shopPlan(shop);
  const spot = at(shop, p.staff.lx, p.staff.lz);
  Object.assign(player, { x: spot.x, z: spot.z, yaw: SHOPS[shop].turn + Math.PI, hop: true, snap: true });
  banner("info", `Clocked in at ${SHOPS[shop].name}`, `${JOB_LEVELS[levelAt(shop)].title} · ${usd(wageAt(shop))}/hr. Take orders at the screen on the counter.`, 4);
  notify();
}

export function clockOut(why?: string) {
  const s = jobs.shift;
  if (!s) return;
  const { hours, wages } = shiftPay();
  jobs.shift = null;
  jobs.panel = null;
  const p = progressAt(s.shop);
  p.hours = Math.round((p.hours + hours) * 100) / 100;
  p.earned = Math.round((p.earned + wages + s.tips) * 100) / 100;
  // Wages go straight into the bank (tips were cash, already in your wallet).
  if (wages > 0) {
    earn(wages);
    transfer(wages);
  }
  saveProfile(true);
  banner("info", why ?? "Clocked out", `${hours.toFixed(1)} hours · ${usd(wages)} paid into your bank · ${usd(s.tips)} in tips.`, 5);
  // The NPC takes over: anyone still waiting gets served by them.
  for (const c of jobs.shops[s.shop].customers) if (c.state === "waiting" || c.state === "ordered") c.at = jobs.now;
  notify();
}

async function fire(shop: ShopKey) {
  clockOut("You're fired!");
  banner("busted", "You're fired!", `Too many customers walked out of ${SHOPS[shop].name}. You can apply again later.`, 6);
  const p = progressAt(shop);
  p.level = 0;
  saveProfile(true);
  const app = profile.applications.find((a) => a.business === shop && a.status === "hired");
  if (app) app.status = "fired";
  notify();
  await jobs.remote?.leave(shop, "fired");
}

export async function quitJob(shop: ShopKey) {
  if (jobs.shift?.shop === shop) clockOut("You quit");
  const app = profile.applications.find((a) => a.business === shop && a.status === "hired");
  if (app) app.status = "quit";
  jobs.panel = null;
  notify();
  await jobs.remote?.leave(shop, "quit");
}

/** Send a résumé. Returns an error message, or null if it went. */
export async function sendResume(shop: ShopKey, answers: Record<string, unknown>) {
  if (!profile.signedIn || !jobs.remote) return "Sign in to the store first, so the manager knows who you are.";
  const r = await jobs.remote.apply(shop, answers);
  if (r.error) return r.error;
  profile.applications.unshift({ id: `local-${Date.now()}`, business: shop, status: "pending", level: 0, note: null, created_at: new Date().toISOString(), decided_at: null });
  await jobs.remote.refresh().catch(() => {});
  notify();
  return null;
}

// ---- Orders: taking them, making them, handing them over ------------------------------------

/** The customers whose orders are waiting on the screen (ordered at the kiosk, not taken yet). */
export function untaken(shop: ShopKey) {
  return jobs.shops[shop].customers.filter((c) => c.state === "ordered");
}

export function takeOrder(shop: ShopKey, id: number) {
  const s = jobs.shift;
  const c = jobs.shops[shop].customers.find((x) => x.id === id);
  if (!s || !c || c.state !== "ordered") return;
  c.state = "waiting";
  c.at = jobs.now;
  c.slot = freeSlot(shop);
  c.path = [waitingSpot(shop, c.slot)];
  c.said = "Thanks!";
  s.tickets.push({ customer: c.id, name: c.name, order: c.order, price: c.price, takenAt: jobs.now });
  notify();
}

/** You've made something for a ticket: carry it to the counter. */
export function finishMaking(ticket: Ticket, made: Build, skill: number) {
  const s = jobs.shift;
  if (!s) return;
  const quality = score(s.shop, ticket.order, made, skill);
  s.carrying = { customer: ticket.customer, name: ticket.name, label: shortName(s.shop, made), quality, made };
  s.tickets = s.tickets.filter((t) => t !== ticket);
  jobs.panel = null;
  notify();
}

export function handOver() {
  const s = jobs.shift;
  if (!s?.carrying) return;
  const sim = jobs.shops[s.shop];
  const c = sim.customers.find((x) => x.id === s.carrying!.customer);
  const q = s.carrying.quality;
  s.carrying = null;
  if (!c || c.state === "leaving") {
    banner("info", "They've gone", "That customer already walked out.", 2.5);
    notify();
    return;
  }
  const v = verdict(q);
  // Tips: up to 20% for perfect food, nothing for wrong food. Faster is better too.
  const waited = jobs.now - c.arrived;
  const speed = Math.max(0, 1 - waited / c.patience);
  const tip = q >= 0.6 ? Math.round(c.price * (0.05 + 0.15 * q * (0.6 + 0.4 * speed)) * 100) / 100 : 0;
  if (tip > 0) {
    earn(tip);
    s.tips = Math.round((s.tips + tip) * 100) / 100;
    pop(tip, "Tip");
  }
  c.said = v.line;
  leave(s.shop, c, q >= 0.6 ? "happy" : "angry", true);
  s.served++;
  if (q >= 0.6) {
    const p = progressAt(s.shop);
    p.orders++;
    const lvl = levelAt(s.shop);
    if (lvl < JOB_LEVELS.length - 1 && p.orders >= PROMOTE_AT[lvl + 1]) {
      p.level = lvl + 1;
      banner("escaped", "Promoted!", `You're now ${JOB_LEVELS[p.level].title} at ${SHOPS[s.shop].name}: ${usd(JOB_LEVELS[p.level].wage)}/hr.`, 5);
      void jobs.remote?.level(s.shop, p.level);
    }
    saveProfile();
  }
  notify();
}

// ---- Customers --------------------------------------------------------------------------------

function freeSlot(shop: ShopKey) {
  const used = new Set(jobs.shops[shop].customers.filter((c) => c.state === "waiting").map((c) => c.slot));
  for (let i = 0; i < 12; i++) if (!used.has(i)) return i;
  return 0;
}

function spawn(shop: ShopKey) {
  const sim = jobs.shops[shop];
  const order = randomOrder(shop);
  const out = DOOR_OUT(shop);
  const working = jobs.shift?.shop === shop;
  const c: Customer = {
    id: nextId++,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    seed: Math.floor(Math.random() * 1e6),
    order,
    price: priceOf(shop, order),
    state: "in",
    arrived: jobs.now,
    // More complicated orders get a bit longer.
    patience: (working ? 95 : 200) + Math.random() * 45 + describe(shop, order).length * 4,
    at: jobs.now,
    pos: { ...out },
    path: [DOOR_IN(shop)],
    yaw: 0,
    moving: true,
    mood: "ok",
    holding: false,
    slot: 0,
    said: "",
  };
  sim.customers.push(c);
}

function leave(shop: ShopKey, c: Customer, mood: Customer["mood"], holding: boolean) {
  c.state = "leaving";
  c.mood = mood;
  c.holding = holding;
  c.at = jobs.now;
  c.path = [DOOR_IN(shop), DOOR_OUT(shop), at(shop, (Math.random() < 0.5 ? -1 : 1) * 14, 8)];
}

/** Rushes, steady spells and quiet times. */
function nextPhase(sim: ShopSim) {
  const r = Math.random();
  sim.phase = r < 0.3 ? "rush" : r < 0.75 ? "steady" : "quiet";
  sim.phaseUntil = jobs.now + (sim.phase === "rush" ? 50 + Math.random() * 40 : sim.phase === "steady" ? 80 + Math.random() * 80 : 35 + Math.random() * 45);
}
const gap = (sim: ShopSim) => (sim.phase === "rush" ? 9 + Math.random() * 9 : 22 + Math.random() * 18);

function walk(c: Customer, dt: number) {
  const t = c.path[0];
  if (!t) {
    c.moving = false;
    return true;
  }
  const dx = t.x - c.pos.x;
  const dz = t.z - c.pos.z;
  const d = Math.hypot(dx, dz);
  const step = 2.6 * dt;
  c.moving = true;
  c.yaw = Math.atan2(dx, dz);
  if (d <= step) {
    c.pos.x = t.x;
    c.pos.z = t.z;
    c.path.shift();
    if (!c.path.length) c.moving = false;
    return !c.path.length;
  }
  c.pos.x += (dx / d) * step;
  c.pos.z += (dz / d) * step;
  return false;
}

function tickShop(shop: ShopKey, dt: number, active: boolean) {
  const sim = jobs.shops[shop];
  const working = jobs.shift?.shop === shop;
  if (!active && !working) {
    if (sim.customers.length) sim.customers = [];
    return;
  }
  if (jobs.now > sim.phaseUntil) nextPhase(sim);
  if (!sim.nextAt) sim.nextAt = jobs.now + 3;
  const busy = sim.customers.filter((c) => c.state !== "leaving").length;
  if (jobs.now > sim.nextAt) {
    if (sim.phase !== "quiet" && busy < 8) spawn(shop);
    sim.nextAt = jobs.now + gap(sim);
  }
  const P = shopPlan(shop);
  const turn = SHOPS[shop].turn;
  // The queue for the kiosk: first come, first served.
  const queue = sim.customers.filter((c) => c.state === "queue" || c.state === "kiosk").sort((a, b) => a.arrived - b.arrived);
  queue.forEach((c, i) => {
    const spot = i === 0 ? P.ordering : P.queue[Math.min(i - 1, P.queue.length - 1)];
    const p = at(shop, spot.lx, spot.lz);
    if (i === 0 && c.state === "queue") {
      c.path = [p];
      c.state = "kiosk";
      c.at = jobs.now;
    } else if (c.path.length === 0 && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 0.3) c.path = [p];
  });

  for (const c of sim.customers) {
    const arrived = walk(c, dt);
    if (!c.moving) {
      // Face the thing they're waiting at.
      if (c.state === "kiosk") c.yaw = turn - Math.PI / 2;
      else if (c.state === "waiting") c.yaw = turn + Math.PI;
    }
    switch (c.state) {
      case "in":
        if (arrived) c.state = "queue";
        break;
      case "kiosk":
        // Tapping away at the kiosk for a few seconds.
        if (!c.moving && jobs.now - c.at > 4.5) {
          c.state = "ordered";
          c.at = jobs.now;
          c.said = "Ordered!";
          // Over to the counter to wait (the order shows on the screen).
          c.slot = freeSlot(shop);
          c.path = [waitingSpot(shop, c.slot)];
        }
        break;
      case "ordered":
      case "waiting":
        if (!working) {
          // The NPC on shift takes the order and makes it.
          if (jobs.now - c.at > (c.state === "ordered" ? 3 : 14 + Math.random() * 0.2)) {
            if (c.state === "ordered") {
              c.state = "waiting";
              c.at = jobs.now;
            } else {
              c.said = verdict(0.9).line;
              leave(shop, c, "happy", true);
            }
          }
        }
        break;
      case "leaving":
        break;
    }
    // Out of patience: walk out in a huff.
    if (working && c.state !== "leaving" && jobs.now - c.arrived > c.patience) {
      c.said = "Forget it. I'm leaving!";
      leave(shop, c, "angry", false);
      const s = jobs.shift!;
      s.walkouts++;
      s.tickets = s.tickets.filter((t) => t.customer !== c.id);
      if (s.carrying?.customer === c.id) s.carrying = { ...s.carrying, customer: -1 };
      const p = progressAt(shop);
      p.walkouts++;
      saveProfile();
      if (s.walkouts >= STRIKES) void fire(shop);
      else banner("alarm", "A customer walked out!", `${c.name} got tired of waiting. ${STRIKES - s.walkouts} more and you're fired.`, 3.5);
      notify();
    }
  }
  sim.customers = sim.customers.filter((c) => !(c.state === "leaving" && c.path.length === 0));
}

/** Every frame. */
export function tickJobs(now: number, dt: number) {
  jobs.now = now;
  for (const k of Object.keys(SHOPS) as ShopKey[]) {
    const s = SHOPS[k];
    // Shops only come to life when you're near (no one sees the others).
    const near = Math.abs(player.x - s.x) < 120 && Math.abs(player.z - s.z) < 120;
    tickShop(k, dt, near);
  }
  // Walk out of the shop mid-shift and you've clocked out.
  const s = jobs.shift;
  if (s && !inRoom(roomOf(s.shop), player.x, player.z, 1.5) && !life.dead) clockOut("Clocked out (you left the shop)");
}

// ---- What you can do in a shop --------------------------------------------------------------

/** Buy something to eat. */
export function buySnack(shop: ShopKey) {
  const m = MENUS[shop];
  if (!m.snack) return;
  if (!pay(m.snack.price)) {
    banner("info", "Not enough money", `${m.snack.name} is ${usd(m.snack.price)}.`, 2.5);
    return;
  }
  eat(m.food);
  pop(-m.snack.price, m.snack.name);
  banner("info", "Yum!", `You eat ${m.snack.name}. You feel ${life.hunger > 80 ? "full" : "better"}.`, 2.5);
}

provide("jobs", (you) => {
  if (!you.onFoot) return null;
  const shop = shopAt(you.x, you.z);
  if (!shop) return null;
  const P = shopPlan(shop);
  const s = jobs.shift;
  const near = (lx: number, lz: number, r: number) => {
    const p = at(shop, lx, lz);
    return Math.hypot(you.x - p.x, you.z - p.z) < r;
  };
  if (s && s.shop === shop) {
    const list = [];
    const waiting = untaken(shop).length;
    if (near(P.posStand.lx, P.posStand.lz, 3.2)) list.push({ key: "E" as const, text: waiting ? `Take orders (${waiting} waiting)` : "Order screen (no new orders)", run: () => ((jobs.panel = { kind: "orders", shop }), notify()) });
    if (s.carrying && near((P.counter.lx0 + P.counter.lx1) / 2, P.staff.lz, (P.counter.lx1 - P.counter.lx0) / 2 + 1.5)) {
      const carrying = s.carrying;
      list.push({ key: "E" as const, text: carrying.customer < 0 ? `Throw away the ${carrying.label}` : `Hand ${carrying.label} to ${carrying.name}`, tone: "money" as const, run: () => (carrying.customer < 0 ? ((s.carrying = null), notify()) : handOver()) });
    } else if (!s.carrying && near(0, (P.prep.lz0 + P.prep.lz1) / 2, 4.2)) {
      list.push({
        key: "E" as const,
        text: s.tickets.length ? `Make ${s.tickets[0].name}'s ${MENUS[shop].thing}` : `Kitchen (no orders to make)`,
        run: () => ((jobs.panel = { kind: "kitchen", shop, ticket: s.tickets[0]?.customer ?? -1 }), notify()),
      });
    }
    list.push({ key: "Q" as const, text: "Clock out", run: () => clockOut() });
    return list;
  }
  if (s) return null;
  const list = [];
  const m = MENUS[shop];
  if (m.snack) list.push({ key: "E" as const, text: `Buy ${m.snack.name} (${usd(m.snack.price)})`, tone: "money" as const, run: () => buySnack(shop) });
  const status = jobStatus(shop);
  if (status === "hired") {
    list.push({ key: "R" as const, text: `Clock in (${usd(wageAt(shop))}/hr)`, run: () => clockIn(shop) });
    list.push({ key: "Q" as const, text: "Your job", run: () => ((jobs.panel = { kind: "job", shop }), notify()) });
  } else if (status === "pending") list.push({ key: "Q" as const, text: "Application sent (waiting to hear back)", run: () => ((jobs.panel = { kind: "job", shop }), notify()) });
  else list.push({ key: "Q" as const, text: `Ask for a job application`, run: () => ((jobs.panel = { kind: "resume", shop }), notify()) });
  return list;
});
