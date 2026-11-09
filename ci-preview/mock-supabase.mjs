// TEMPORARY (check branch only): a pretend Supabase so the time clock and the
// employee app can be photographed with sample employees. Never deployed.
import http from "node:http";

const now = Date.now();
const ago = (m) => new Date(now - m * 60000).toISOString();
const today = new Date(now - 7 * 3600000).toISOString().slice(0, 10); // Arizona date
const add = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const board = {
  onClock: [
    { name: "Maya R", in: ago(52) },
    { name: "Ben K", in: ago(18) },
  ],
  today: [
    { name: "Ava T", in: ago(240), out: ago(170) },
    { name: "Leo M", in: ago(300), out: ago(236) },
  ],
  upcoming: [
    { date: today, label: "5th hour", startsAt: "11:40", name: "Ben K" },
    { date: today, label: "5th hour", startsAt: "11:40", name: "Maya R" },
    { date: today, label: "6th hour", startsAt: "12:35", name: "Ava T" },
    { date: add(today, 1), label: "1st hour", startsAt: "07:25", name: "Leo M" },
    { date: add(today, 1), label: "3rd hour", startsAt: "09:20", name: "Maya R" },
    { date: add(today, 1), label: "3rd hour", startsAt: "09:20", name: "Jordan P" },
  ],
  signupApproval: true,
};

const portal = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Maya R",
  open: { id: "s1", in: ago(52), source: "phone" },
  weekMinutes: 3 * 60 + 40,
  discountPct: 30,
  creditCents: 400,
  earnedCents: 650,
  workedMinutes: 22 * 60,
  rule: { pct: 10, afterHours: 5, cents: 100 },
  schedule: [
    { date: today, label: "5th hour", startsAt: "11:40" },
    { date: add(today, 1), label: "3rd hour", startsAt: "09:20" },
    { date: add(today, 3), label: "1st hour", startsAt: "07:25" },
  ],
  shifts: [
    { in: ago(52), out: null, phone: true },
    { in: ago(1500), out: ago(1425), phone: false },
    { in: ago(2950), out: ago(2890), phone: true },
  ],
  credit: [
    { cents: -150, note: "Hot Cheetos and a soda", at: ago(2000) },
    { cents: -100, note: "Gatorade", at: ago(6000) },
  ],
};

const punch = {
  status: "in",
  name: "Jordan P",
  in: new Date(now).toISOString(),
  out: null,
  id: "s9",
  undo: "x",
  autoOutAt: new Date(now + 75 * 60000).toISOString(),
  weekMinutes: 95,
  discountPct: 10,
  creditCents: 200,
  nextCreditMinutes: 25,
  next: { date: add(today, 1), label: "3rd hour", startsAt: "09:20" },
};

const routes = {
  "/rest/v1/rpc/staff_credit_balances": [
    { staff_id: "a", week_minutes: 220, balance_cents: 400, discount_pct: 30 },
    { staff_id: "b", week_minutes: 165, balance_cents: 0, discount_pct: 20 },
    { staff_id: "c", week_minutes: 95, balance_cents: 200, discount_pct: 10 },
  ],
  "/rest/v1/rpc/staff_auto_clock_out": 0,
  "/rest/v1/rpc/staff_board": board,
  "/rest/v1/rpc/staff_portal": portal,
  "/rest/v1/rpc/staff_punch": punch,
};

http
  .createServer((req, res) => {
    const path = req.url.split("?")[0];
    let body = routes[path];
    if (body === undefined && path === "/rest/v1/settings") {
      body = { staff_max_shift_minutes: 75 };
      if (!String(req.headers.accept).includes("pgrst.object")) body = [body];
    }
    if (body === undefined) body = path.startsWith("/auth/") ? {} : [];
    const headers = { "Content-Type": "application/json" };
    if (path === "/rest/v1/staff_schedule") headers["Content-Range"] = "0-5/6";
    res.writeHead(200, headers);
    res.end(JSON.stringify(body));
  })
  .listen(54321, () => console.log("mock supabase on :54321"));
