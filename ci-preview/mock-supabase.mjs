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


// ---- Admin pages (sample store data) ----
const ADMIN_ID = "00000000-0000-0000-0000-00000000a0a0";
const adminUser = { id: ADMIN_ID, aud: "authenticated", role: "authenticated", email: "manager@example.com", app_metadata: {}, user_metadata: {}, created_at: ago(99999) };
const cents = (d) => Math.round(d * 100);
// Daily sales: school days only, with a believable wobble.
function dayRevenue(iso) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return 0;
  const seed = [...iso].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 1000;
  return cents(120 + (seed % 140) + (dow === 5 ? 60 : 0));
}
function daySpend(iso) {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dow === 1 ? cents(180 + ([...iso].reduce((a, c) => a + c.charCodeAt(0), 0) % 90)) : 0;
}
function insights({ p_from, p_to, p_bucket }) {
  const series = [];
  let rev = 0, spend = 0;
  if (p_bucket === "month") {
    for (let d = p_from; d <= p_to; ) {
      const m = d.slice(0, 7);
      let r = 0, sp = 0, x = d;
      while (x <= p_to && x.slice(0, 7) === m) { r += dayRevenue(x); sp += daySpend(x); x = add(x, 1); }
      const summer = ["06", "07"].includes(m.slice(5));
      if (summer) { r = 0; sp = 0; }
      series.push({ start: `${m}-01T00:00:00-07:00`, revenue_cents: r, spending_cents: sp });
      rev += r; spend += sp; d = x;
    }
  } else {
    for (let d = p_from; d <= p_to; d = add(d, 1)) {
      const r = dayRevenue(d), sp = daySpend(d);
      series.push({ start: `${d}T00:00:00-07:00`, revenue_cents: r, spending_cents: sp });
      rev += r; spend += sp;
    }
  }
  return { from: p_from, to: p_to, bucket: p_bucket, totals: { revenue_cents: rev, spending_cents: spend, gross_profit_cents: Math.round(rev * 0.42), transactions: 0, units_sold: 0, online_orders: 0, last_sale_date: today }, previous: { from: p_from, to: p_to, revenue_cents: 0, spending_cents: 0, gross_profit_cents: 0, units_sold: 0 }, series, payments: {}, channels: { online_units: 0, total_units: 0 }, suppliers: [], products: [], unmatched_revenue_cents: 0 };
}
const product = (name, emoji, supplier, stock, reorder, sold, cost, price, perish = false) => ({
  id: `p-${name.replace(/\W/g, "").toLowerCase()}`, name, category: "Snacks", emoji, photo_path: null, stock, reserved: 0, price_cents: price, unit_cost_cents: cost,
  reorder_point: reorder, lead_days: 2, is_perishable: perish, available_online: true, supplier, units_sold: sold,
  batches: perish ? [{ received_on: add(today, -10), expires_on: add(today, 4), qty: stock }] : null,
});
const products = [
  product("Takis Fuego", null, "Costco", 0, 12, 160, 62, 150),
  product("Hot Cheetos", null, "Costco", 6, 12, 140, 58, 150),
  product("Gatorade Cool Blue", null, "Costco", 9, 18, 190, 74, 200),
  product("Celsius Peach", null, "Sam's Club", 4, 10, 85, 135, 300),
  product("Rice Krispies Treat", null, "Walmart", 22, 10, 70, 31, 100),
  product("Cup Noodles", null, "Walmart", 3, 8, 60, 42, 150),
  product("Uncrustables", null, "Costco", 5, 10, 75, 70, 200, true),
  product("Water bottle", null, "Costco", 40, 20, 120, 18, 100),
  product("Pickle (big)", null, "Walmart", 11, 6, 30, 90, 200, true),
];
const summary = () => ({
  today, week_start: add(today, -1), orders_today: { received: 1, ready: 1 }, orders_upcoming: 3,
  week_revenue_cents: 61240, week_spending_cents: 21480, last_week_revenue_cents: 57810, last_week_spending_cents: 19020,
  last_import_at: ago(900), last_sale_date: add(today, -1), unmatched_sales_lines: 0,
  low_stock: products.filter((p) => p.stock <= p.reorder_point).map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, stock: p.stock, reorder_point: p.reorder_point, reserved: 0 })),
  expiring_soon: 1,
});
const tables = {
  admins: [{ user_id: ADMIN_ID }],
  staff: [
    { id: "a", name: "Maya R", status: "active" }, { id: "b", name: "Ben K", status: "active" }, { id: "c", name: "Ava T", status: "active" },
    { id: "d", name: "Leo M", status: "active" }, { id: "e", name: "Jordan P", status: "pending" },
  ],
  staff_shifts: [
    { id: "s1", staff_id: "a", staff_name: "Maya R", clock_in: ago(52), clock_out: null },
    { id: "s2", staff_id: "b", staff_name: "Ben K", clock_in: ago(18), clock_out: null },
  ],
  pickup_windows: [
    { id: 1, label: "1st hour", starts_at: "07:25:00" }, { id: 5, label: "5th hour", starts_at: "11:40:00" }, { id: 6, label: "6th hour", starts_at: "12:35:00" },
  ],
  staff_schedule: [{ staff_id: "a", window_id: 5 }, { staff_id: "b", window_id: 5 }, { staff_id: "c", window_id: 6 }],
  suppliers: [{ name: "Costco" }, { name: "Sam's Club" }, { name: "Walmart" }],
  receipt_inbox: [
    { id: "r1", path: "inbox/2026/11/a.webp", store: "Costco", total_cents: 18417, shopper: "Mr. Lopez", note: null, shopped_on: today },
    { id: "r2", path: "inbox/2026/11/b.webp", store: "Walmart", total_cents: null, shopper: "Mr. Lopez", note: "Cup noodles + pickles", shopped_on: add(today, -2) },
  ],
};

const routes = {
  "/rest/v1/rpc/staff_credit_balances": [
    { staff_id: "a", week_minutes: 220, balance_cents: 400, discount_pct: 30 },
    { staff_id: "b", week_minutes: 165, balance_cents: 0, discount_pct: 20 },
    { staff_id: "c", week_minutes: 95, balance_cents: 200, discount_pct: 10 },
  ],
  "/rest/v1/rpc/staff_auto_clock_out": 0,
  "/rest/v1/rpc/kiosk_is_locked": true,
  "/rest/v1/rpc/staff_board": board,
  "/rest/v1/rpc/staff_portal": portal,
  "/rest/v1/rpc/staff_punch": punch,
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = req.url.split("?")[0];
      const query = new URLSearchParams(req.url.split("?")[1] ?? "");
      let params = {};
      try { params = raw ? JSON.parse(raw) : {}; } catch {}
      const one = String(req.headers.accept).includes("pgrst.object");
      let body = routes[path];
      if (path === "/auth/v1/user") body = adminUser;
      else if (path === "/rest/v1/rpc/insights") body = insights(params);
      else if (path === "/rest/v1/rpc/dashboard_summary") body = summary();
      else if (path === "/rest/v1/rpc/inventory_snapshot")
        body = { today, window_days: 28, reorder_buffer_days: 3, shopping_interval_days: 7, next_shopping_date: add(today, 3), products };
      if (body === undefined && path === "/rest/v1/settings") {
        body = { staff_max_shift_minutes: 75, kiosk_pin_hash: "x" };
        if (!one) body = [body];
      }
      const table = path.startsWith("/rest/v1/") && !path.includes("/rpc/") ? path.slice(9) : null;
      if (body === undefined && table && tables[table]) {
        let rows = tables[table];
        if (table === "staff_shifts" && !query.get("clock_out")) rows = [];
        body = one ? rows[0] ?? null : rows;
      }
      if (body === undefined) body = path.startsWith("/auth/") ? {} : [];
      const headers = { "Content-Type": "application/json" };
      if (path === "/rest/v1/staff_schedule") headers["Content-Range"] = "0-5/6";
      else if (Array.isArray(body)) headers["Content-Range"] = `0-${Math.max(body.length - 1, 0)}/${body.length}`;
      res.writeHead(200, headers);
      res.end(req.method === "HEAD" ? "" : JSON.stringify(body));
    });
  })
  .listen(54321, () => console.log("mock supabase on :54321"));
