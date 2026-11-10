import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/*
 * Talks to the school store website's phone API (src/app/api/app/[action]/route.ts).
 * The sign-in token is kept in the phone's secure storage (Keychain / Keystore).
 */

const API = ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? "https://school-store-steel.vercel.app").replace(/\/$/, "");
const KEY = "firebirds-nest-token";

export type Rule = { pct: number; afterHours: number; cents: number };

export type Portal = {
  id: string;
  name: string;
  maxShiftMinutes: number;
  open: { id: string; in: string; source: string } | null;
  weekMinutes: number;
  discountPct: number;
  creditCents: number;
  earnedCents: number;
  workedMinutes: number;
  rule: Rule;
  schedule: { date: string; label: string; startsAt: string }[];
  shifts: { in: string; out: string | null; phone: boolean }[];
  credit: { cents: number; note: string | null; at: string }[];
};

export type Punch =
  | { status: "in" | "out"; name: string; in: string; out: string | null; id: string; undo: string; autoOutAt?: string | null }
  | { status: "pending"; name: string }
  | { status: "auto"; name: string; in: string; out: string };

export class SignedOut extends Error {}

export const getToken = () => SecureStore.getItemAsync(KEY);
const setToken = (t: string) => SecureStore.setItemAsync(KEY, t);
const clearToken = () => SecureStore.deleteItemAsync(KEY);

const OFFLINE = "Couldn't reach the store. Check your internet and try again.";

async function call<T>(action: string, body?: object): Promise<T> {
  const token = await getToken();
  let res: Response;
  try {
    res = await fetch(`${API}/api/app/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (res.status === 401 || json.code === "SIGNED_OUT") {
    await clearToken();
    throw new SignedOut(json.error ?? "You're signed out.");
  }
  if (!res.ok) throw new Error(json.error ?? OFFLINE);
  return json;
}

export async function signIn(name: string, pin: string) {
  const r = await call<{ token: string }>("sign-in", { name, pin });
  await setToken(r.token);
}

export async function signOut() {
  try {
    await call("sign-out");
  } finally {
    await clearToken();
  }
}

export const loadPortal = async () => (await call<{ data: Portal }>("me")).data;
export const punch = () => call<Punch>("punch");
export const undo = (id: string, token: string) => call<{ ok?: boolean; error?: string }>("undo", { id, undo: token });
