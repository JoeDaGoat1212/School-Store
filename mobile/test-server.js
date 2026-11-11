// A fake school store for the emulator test: answers the phone API with sample data.
const http = require("http");
const now = Date.now();
const iso = (m) => new Date(now - m * 60000).toISOString();
const day = (d) => new Date(now - 7 * 3600000 + d * 86400000).toISOString().slice(0, 10);
let open = null;
const portal = () => ({
  id: "x", name: "Maya R", maxShiftMinutes: 75, open,
  weekMinutes: 220, discountPct: 30, creditCents: 600, earnedCents: 1100, workedMinutes: 1960,
  rule: { pct: 10, afterHours: 5, cents: 100, capCents: 1000 },
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
  if (a === "threads") return send({
    contacts: [{ member: "admin", name: "Manager" }, { member: "b", name: "Ben K" }, { member: "c", name: "Ava T" }],
    threads: [
      { id: "t-everyone", kind: "everyone", title: "Everyone", members: [], unread: 2, last: { body: "Who can cover 6th hour Friday?", sender: "admin", senderName: "Manager", at: iso(12) } },
      { id: "t-ben", kind: "direct", title: "Ben K", members: [{ member: "b", name: "Ben K" }], unread: 0, last: { body: "On my way", sender: "b", senderName: "Ben K", at: iso(200) } },
      { id: "t-group", kind: "group", title: "Friday crew", members: [{ member: "b", name: "Ben K" }, { member: "c", name: "Ava T" }], unread: 0, last: null },
    ],
  });
  if (a === "thread") return send({
    thread: { id: "t-everyone", kind: "everyone", title: "Everyone", members: [], unread: 0, last: null },
    messages: [
      { id: "m1", sender: "admin", senderName: "Manager", body: "New Takis came in. Put them on the top shelf please.", at: iso(90), mine: false },
      { id: "m2", sender: "x", senderName: "Maya R", body: "Got it!", at: iso(80), mine: true },
      { id: "m3", sender: "admin", senderName: "Manager", body: "Who can cover 6th hour Friday?", at: iso(12), mine: false },
      { id: "m4", sender: "c", senderName: "Ava T", body: "I can", at: iso(10), mine: false },
    ],
  });
  if (a === "unread") return send({ unread: 2, latest: [{ chat: "t-everyone", title: "Manager in Everyone", body: "Who can cover 6th hour Friday?", unread: 2, at: iso(12) }] });
  if (a === "tasks") return send({ tasks: [
    { id: "k1", title: "Wipe down the counter", details: "Spray and paper towel, under the register too", forEveryone: true, repeats: "Every day", done: true },
    { id: "k2", title: "Count the cash box", details: null, forEveryone: false, repeats: null, done: false },
    { id: "k3", title: "Break down boxes", details: "Recycling bin by the gym", forEveryone: true, repeats: "Every Tuesday", done: false },
  ] });
  if (a === "absences") return send({ absences: [{ id: "ab1", date: day(3), windowId: 6, label: "6th hour", reason: "Dentist" }] });
  const areas = ["Drinks", "Snacks (right half)", "Snacks (left half)", "Spicy chips", "Regular chips", "Ramen"];
  if (a === "restock") return send({ state: "due", period: "5th hour" });
  if (a === "restock-start" || a === "restock-open") return send({ checkId: "chk1", token: "tok", name: "Maya R", areas, done: [], period: "5th hour" });
  return send({ ok: true });
}).listen(8787, () => console.log("fake store on :8787"));
