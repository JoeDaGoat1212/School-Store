// A fake school store for the emulator test: answers the phone API with sample data.
const http = require("http");
const now = Date.now();
const iso = (m) => new Date(now - m * 60000).toISOString();
const day = (d) => new Date(now - 7 * 3600000 + d * 86400000).toISOString().slice(0, 10);
let open = null;
const portal = () => ({
  id: "x", name: "Maya R", maxShiftMinutes: 75, open,
  weekMinutes: 220, discountPct: 30, creditCents: 600, earnedCents: 1100, workedMinutes: 1960,
  rule: { pct: 10, afterHours: 5, cents: 100 },
  schedule: [{ date: day(0), label: "5th hour", startsAt: "11:40:00" }, { date: day(1), label: "3rd hour", startsAt: "09:20:00" }, { date: day(3), label: "6th hour", startsAt: "12:35:00" }],
  shifts: [{ in: iso(1500), out: iso(1440), phone: true }, { in: iso(2950), out: iso(2880), phone: false }],
  credit: [{ cents: -250, note: "Takis and a Gatorade", at: iso(3000) }, { cents: 100, note: "Hour 6 last week", at: iso(9000) }],
});
http.createServer((req, res) => {
  const send = (b, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
  const a = req.url.split("/").pop();
  console.log(req.method, req.url, req.headers.authorization ? "(token)" : "");
  if (a === "sign-in") return send({ token: "test-token-1234567890abcdef" });
  if (!req.headers.authorization) return send({ error: "signed out", code: "SIGNED_OUT" }, 401);
  if (a === "me") return send({ data: portal() });
  if (a === "punch") {
    if (!open) { open = { id: "s1", in: new Date().toISOString(), source: "phone" }; return send({ status: "in", name: "Maya R", in: open.in, out: null, id: "s1", undo: "u", autoOutAt: new Date(Date.now() + 75 * 60000).toISOString() }); }
    const r = { status: "out", name: "Maya R", in: open.in, out: new Date().toISOString(), id: "s1", undo: "u" }; open = null; return send(r);
  }
  return send({ ok: true });
}).listen(8787, () => console.log("fake store on :8787"));
