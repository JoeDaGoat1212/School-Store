/*
 * Store time is Arizona: always UTC−7 (no daylight saving), matching the
 * website. Worked out by hand so it's right on every phone, whatever its own
 * time zone or date support.
 */
const OFFSET = -7 * 60 * 60 * 1000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Date whose UTC fields read as store time. */
const store = (ms: number) => new Date(ms + OFFSET);
const pad = (n: number) => String(n).padStart(2, "0");

function clock(h: number, m: number) {
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

export const formatTime = (iso: string) => {
  const d = store(new Date(iso).getTime());
  return clock(d.getUTCHours(), d.getUTCMinutes());
};

/** "9:41" and "AM", for the big clock. */
export function nowParts(ms = Date.now()) {
  const d = store(ms);
  const [t, ampm] = clock(d.getUTCHours(), d.getUTCMinutes()).split(" ");
  return { time: t, seconds: pad(d.getUTCSeconds()), ampm, weekday: DAYS[d.getUTCDay()], date: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` };
}

export function formatCents(c: number) {
  const dollars = Math.floor(Math.abs(c) / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${c < 0 ? "-" : ""}$${dollars}.${pad(Math.abs(c) % 100)}`;
}

export function formatMinutes(m: number) {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h > 0 ? `${h}h ${pad(mm)}m` : `${mm}m`;
}

/** "2026-11-10" for a moment, in store time. */
export function storeDay(ms = Date.now()) {
  const d = store(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const parseDay = (date: string) => new Date(`${date}T12:00:00Z`);

/** "Tue, Nov 10" */
export function formatDay(date: string) {
  const d = parseDay(date);
  return `${DAYS[d.getUTCDay()].slice(0, 3)}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export const weekdayShort = (date: string) => DAYS[parseDay(date).getUTCDay()].slice(0, 3);
export const dayOfMonth = (date: string) => parseDay(date).getUTCDate();

export function relativeDay(date: string) {
  if (date === storeDay()) return "Today";
  if (date === storeDay(Date.now() + 86400000)) return "Tomorrow";
  return DAYS[parseDay(date).getUTCDay()];
}

/** "11:40:00" → "11:40 AM" */
export function formatClock(t: string) {
  const [h, m] = t.split(":").map(Number);
  return clock(h, m);
}

export const minutesBetween = (a: string, b: string | null, now = Date.now()) =>
  Math.max(0, Math.round(((b ? new Date(b).getTime() : now) - new Date(a).getTime()) / 60000));

export function greeting() {
  const h = store(Date.now()).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "10% off for every hour worked (up to 50% at 5 hours), then $1 store credit for every hour after 5." */
export function ruleText(r: { pct: number; afterHours: number; cents: number }) {
  return `${r.pct}% off for every hour worked (up to ${r.pct * r.afterHours}% at ${r.afterHours} hours), then ${formatCents(r.cents).replace(".00", "")} store credit for every hour after ${r.afterHours}. Starts over each Monday.`;
}
