import { notify } from "./game-events";
import { life } from "./life";

/*
 * You, in the city game: the name and number on your ID card, your money
 * (pretend US dollars: cash in your wallet and money in the bank), the cars
 * and houses you own, and how you're doing at your jobs. Plain TypeScript.
 *
 * Signed in, it's saved to your account (database update 13, through the
 * functions world-app.tsx hands over with setRemote); otherwise just in this
 * browser. Nothing here is real money.
 */

export type ShopKey = "pizza" | "icecream" | "coffee" | "burger" | "flowers";
export type JobProgress = { level: number; orders: number; walkouts: number; hours: number; earned: number };
export type OwnedCar = { id: string; model: string; color: string };
export type Application = {
  id: string;
  business: ShopKey;
  status: "pending" | "hired" | "declined" | "fired" | "quit";
  level: number;
  note: string | null;
  created_at: string;
  decided_at: string | null;
};

/** What comes back from the server for a signed-in player (see src/lib/game.ts). */
export type ServerPlayer = { id_number: string; name: string; since: string; state: Record<string, unknown>; applications: Application[] };

const START_CASH = 500;
const LOCAL_KEY = "nest:city-profile";

export const profile = {
  signedIn: false,
  idNumber: "GUEST-000",
  name: "Guest",
  since: new Date().toISOString(),
  cash: START_CASH,
  bank: 0,
  cars: [] as OwnedCar[],
  houses: [] as string[],
  /** The house you wake up in (if you own one). */
  home: null as string | null,
  jobs: {} as Partial<Record<ShopKey, JobProgress>>,
  applications: [] as Application[],
  muted: false,
  loaded: false,
};

/** Money is kept to the cent. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** "$1,234,567" (and "$15.50" when there are cents). */
export function usd(amount: number) {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

// ---- Saving ---------------------------------------------------------------------------------

type Remote = { save: (state: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<ServerPlayer | null> };
let remote: Remote | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function snapshot() {
  return {
    v: 1,
    cash: profile.cash,
    bank: profile.bank,
    cars: profile.cars,
    houses: profile.houses,
    home: profile.home,
    jobs: profile.jobs,
    hunger: Math.round(life.hunger),
    muted: profile.muted,
  };
}

function apply(state: Record<string, unknown> | null | undefined) {
  if (!state || typeof state !== "object") return false;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  if (!("cash" in state)) return false;
  profile.cash = Math.max(0, cents(num(state.cash, START_CASH)));
  profile.bank = Math.max(0, cents(num(state.bank, 0)));
  profile.cars = Array.isArray(state.cars) ? (state.cars as OwnedCar[]).filter((c) => c && typeof c.model === "string").slice(0, 40) : [];
  profile.houses = Array.isArray(state.houses) ? (state.houses as string[]).filter((h) => typeof h === "string").slice(0, 20) : [];
  profile.home = typeof state.home === "string" ? state.home : null;
  profile.jobs = state.jobs && typeof state.jobs === "object" ? (state.jobs as typeof profile.jobs) : {};
  profile.muted = Boolean(state.muted);
  life.hunger = Math.min(100, Math.max(20, num(state.hunger, 100)));
  return true;
}

/** Start: from your account if you're signed in (else from this browser). */
export function loadProfile(server: ServerPlayer | null, saver: Remote | null) {
  remote = server ? saver : null;
  let local: Record<string, unknown> | null = null;
  try {
    local = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null");
  } catch {
    // Private browsing: no local save.
  }
  if (server) {
    profile.signedIn = true;
    profile.idNumber = server.id_number;
    profile.name = server.name;
    profile.since = server.since;
    profile.applications = server.applications ?? [];
    // A brand-new account starts from whatever you had as a guest in this browser.
    if (!apply(server.state)) apply(local);
  } else {
    apply(local);
  }
  profile.loaded = true;
  notify();
}

/** Save soon (changes in a burst are saved together). */
export function saveProfile(now = false) {
  notify();
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot()));
  } catch {
    // Not a problem.
  }
  if (!remote) return;
  if (timer) clearTimeout(timer);
  const send = () => {
    timer = null;
    remote?.save(snapshot()).catch(() => {});
  };
  if (now) send();
  else timer = setTimeout(send, 4000);
}

/** Ask the server for your latest job applications (to see if you've been hired). */
export async function refreshProfile() {
  if (!remote) return;
  const p = await remote.refresh().catch(() => null);
  if (!p) return;
  profile.applications = p.applications ?? [];
  notify();
}

// ---- Money ----------------------------------------------------------------------------------

export function earn(amount: number) {
  profile.cash = cents(profile.cash + amount);
  saveProfile();
}

/** Pay with cash. Returns false if you haven't got enough. */
export function spend(amount: number) {
  if (amount > profile.cash + 0.001) return false;
  profile.cash = cents(profile.cash - amount);
  saveProfile(true);
  return true;
}

/** Pay with your bank card (falls back on cash for the rest). */
export function pay(amount: number) {
  if (amount > profile.cash + profile.bank + 0.001) return false;
  const fromBank = Math.min(profile.bank, amount);
  profile.bank = cents(profile.bank - fromBank);
  profile.cash = cents(profile.cash - (amount - fromBank));
  saveProfile(true);
  return true;
}

/** Put cash in the bank (or take it out, with a negative amount). */
export function transfer(amount: number) {
  if (amount > 0 && amount > profile.cash + 0.001) return false;
  if (amount < 0 && -amount > profile.bank + 0.001) return false;
  profile.cash = cents(profile.cash - amount);
  profile.bank = cents(profile.bank + amount);
  saveProfile(true);
  return true;
}

/** Lose the cash you're carrying (passing out, being robbed). Returns how much. */
export function loseCash() {
  const lost = profile.cash;
  profile.cash = 0;
  saveProfile(true);
  return lost;
}

/** What's in your pockets right now (not saved: a stolen keycard doesn't last). */
export const pockets = { keycard: false };

/** Your job title and pay at each level (promotions). */
export const JOB_LEVELS = [
  { title: "Trainee", wage: 15.5 },
  { title: "Crew Member", wage: 17.25 },
  { title: "Senior Crew", wage: 19.5 },
  { title: "Shift Lead", wage: 22 },
  { title: "Assistant Manager", wage: 25.75 },
  { title: "Store Manager", wage: 30 },
];
