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

/* ---------------------------------------------------------------- team tools */

export type Contact = { member: string; name: string };
export type Thread = {
  id: string;
  kind: "everyone" | "direct" | "group";
  title: string;
  members: Contact[];
  last: { body: string; sender: string; senderName: string; at: string } | null;
  unread: number;
};
export type ChatMessage = { id: string; sender: string; senderName: string; body: string; at: string; mine: boolean };
export type Task = { id: string; title: string; details: string | null; forEveryone: boolean; repeats: string | null; done: boolean };
export type Absence = { id: string; date: string; windowId: number | null; label: string; reason: string | null };
export type Restock = { checkId: string; token: string; name: string; areas: string[]; done: string[] };

export const loadThreads = () => call<{ threads: Thread[]; contacts: Contact[] }>("threads");
export const loadThread = (id: string) => call<{ thread?: Thread; messages: ChatMessage[] }>("thread", { id });
export const sendMessage = (id: string, body: string) => call<{ ok: true }>("send", { id, body });
export const openDirect = (member: string) => call<{ id: string }>("direct", { member });
export const makeGroup = (name: string, members: string[]) => call<{ id: string }>("group", { name, members });
export const leaveGroup = (id: string) => call<{ ok: true }>("leave", { id });
export const unread = async () => (await call<{ unread: number }>("unread")).unread;

export const loadTasks = async () => (await call<{ tasks: Task[] }>("tasks")).tasks;
export const setTask = (id: string, done: boolean) => call<{ ok: true }>("task", { id, done });

export const loadAbsences = async () => (await call<{ absences: Absence[] }>("absences")).absences;
export const markAbsent = (date: string, shift: string, reason: string) => call<{ ok: true }>("absent", { date, shift, reason });
export const cancelAbsent = (id: string) => call<{ ok: true }>("present", { id });

export const startRestock = (shift: string, undo: string) => call<Restock>("restock-start", { shift, undo });
export const restockPhoto = (r: Restock, area: string, base64: string, type = "image/jpeg") =>
  call<{ ok: true; complete: boolean }>("restock-photo", { check: r.checkId, token: r.token, area, type, data: base64 });
export const skipRestock = (r: Restock, note: string) => call<{ ok: true }>("restock-skip", { check: r.checkId, token: r.token, note });
