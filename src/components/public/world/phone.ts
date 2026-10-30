import { notify } from "./game-events";

/*
 * Your phone. Plain TypeScript; phone-hud.tsx draws it (bottom right) and
 * the subtitles.
 *
 *   P (or M) takes it out and puts it away. Type a number on the keypad
 *   (click the keys, or the number keys on the keyboard), then Call (or
 *   Enter). Backspace deletes a digit, Esc puts it away.
 *
 * For story missions: registerNumber("555-0199", (call) => ({ ... })) adds a
 * number anyone can ring. The handler says who answers and what they say
 * (shown as subtitles, a line at a time), and can run code when the call
 * connects and when it ends (start a mission, give you a waypoint…).
 * onDial() hears every number dialed (for logging, or missions that react to
 * any call). Numbers match on their digits, so "555-0100" and "5550100" are
 * the same number.
 */

export type Line = { who: string; text: string; seconds?: number };
export type Answer = {
  /** Who picks up (shown on the call screen). */
  name: string;
  /** What's said, in order. */
  lines: Line[];
  /** When the call connects / when it ends (hung up, or the lines run out). */
  onConnect?: () => void;
  onEnd?: () => void;
};
export type CallInfo = { number: string; digits: string; at: number };
type Handler = (call: CallInfo) => Answer | null;

const numbers = new Map<string, Handler>();
const listeners = new Set<(call: CallInfo, answered: boolean) => void>();

export const phone = {
  open: false,
  /** What's typed on the keypad. */
  typed: "",
  screen: "dial" as "dial" | "ringing" | "call" | "ended",
  call: null as null | { info: CallInfo; answer: Answer | null; started: number; line: number; lineAt: number },
  /** The subtitle showing now (also while the phone's away). */
  subtitle: null as null | Line,
  /** The last few numbers dialed (most recent first). */
  recent: [] as string[],
  now: 0,
};

/** Only the digits (and * #), for matching. */
export const digitsOf = (n: string) => n.replace(/[^0-9*#]/g, "");

/** How a number's shown: 555-0100, (555) 010-0100, 911… */
export function formatNumber(raw: string) {
  const d = digitsOf(raw);
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/** Add a number someone answers (for missions). Returns a function that removes it again. */
export function registerNumber(number: string, handler: Handler) {
  const key = digitsOf(number);
  numbers.set(key, handler);
  return () => {
    if (numbers.get(key) === handler) numbers.delete(key);
  };
}

/** Hear every call made (the number, and whether anyone answered). */
export function onDial(f: (call: CallInfo, answered: boolean) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

// ---- Using it ----------------------------------------------------------------------------------

export function openPhone(open = !phone.open) {
  phone.open = open;
  if (!open && phone.screen === "dial") phone.typed = "";
  notify();
}

export function pressKey(k: string) {
  if (!phone.open || phone.screen !== "dial") return;
  if (phone.typed.length >= 14) return;
  phone.typed += k;
  notify();
}

export function backspace() {
  if (phone.screen !== "dial") return;
  phone.typed = phone.typed.slice(0, -1);
  notify();
}

/** Ring what's typed (or a number you pass). */
export function dial(number = phone.typed) {
  const digits = digitsOf(number);
  if (!digits || phone.screen === "ringing" || phone.screen === "call") return;
  const info: CallInfo = { number: formatNumber(digits), digits, at: phone.now };
  const handler = numbers.get(digits);
  const answer = handler ? handler(info) : null;
  phone.call = { info, answer, started: phone.now, line: -1, lineAt: 0 };
  phone.screen = "ringing";
  phone.open = true;
  phone.recent = [info.number, ...phone.recent.filter((n) => n !== info.number)].slice(0, 5);
  console.info(`[phone] dialed ${info.number}${answer ? ` → ${answer.name}` : " (no answer)"}`);
  for (const f of listeners) f(info, Boolean(answer));
  notify();
}

/** Hang up (or put down the "not in service" message). */
export function hangUp() {
  const c = phone.call;
  if (c?.answer && phone.screen === "call") c.answer.onEnd?.();
  phone.call = null;
  phone.subtitle = null;
  phone.screen = "dial";
  phone.typed = "";
  notify();
}

/** How long it rings before they pick up (or the recording starts). */
const RING = 2.2;
const LINE = 3.2;

/** Every frame. */
export function tickPhone(now: number) {
  phone.now = now;
  const c = phone.call;
  if (!c) return;
  if (phone.screen === "ringing" && now - c.started > RING) {
    phone.screen = "call";
    c.started = now;
    if (!c.answer) {
      // Nobody's on this number.
      c.answer = { name: c.info.number, lines: [{ who: "Recording", text: "The number you have dialed is not in service. Please check the number and try again.", seconds: 4 }] };
    } else c.answer.onConnect?.();
    c.line = 0;
    c.lineAt = now;
    phone.subtitle = c.answer.lines[0] ?? null;
    notify();
    return;
  }
  if (phone.screen === "call" && c.answer) {
    const line = c.answer.lines[c.line];
    if (line && now - c.lineAt > (line.seconds ?? LINE)) {
      c.line++;
      c.lineAt = now;
      phone.subtitle = c.answer.lines[c.line] ?? null;
      if (!phone.subtitle) {
        // That's everything: the call ends a moment later.
        phone.screen = "ended";
        c.answer.onEnd?.();
      }
      notify();
    }
  }
  if (phone.screen === "ended" && now - c.lineAt > 1.2) hangUp();
}

// ---- The numbers that work from the start --------------------------------------------------------

registerNumber("911", () => ({
  name: "911 Emergency",
  lines: [
    { who: "Dispatcher", text: "911, what's your emergency?" },
    { who: "Dispatcher", text: "I'm sending a unit to your location. Stay where you are." },
    { who: "Dispatcher", text: "(Mission hook: 911 call placed.)", seconds: 2.4 },
  ],
  onConnect: () => console.info("[phone] mission hook: 911 connected"),
}));

registerNumber("555-0100", () => ({
  name: "Unknown caller",
  lines: [
    { who: "???", text: "You found the number. Good." },
    { who: "???", text: "I've got work for someone who can keep their head down. Not yet. Soon." },
    { who: "???", text: "Keep your phone on you." },
  ],
  onConnect: () => console.info("[phone] mission hook: 555-0100 connected (story missions start here)"),
}));
