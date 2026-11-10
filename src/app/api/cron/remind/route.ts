import { timingSafeEqual } from "node:crypto";
import { storeToday } from "@/lib/format";
import { notify } from "@/lib/push";
import { createSecretClient } from "@/lib/supabase/server";

/*
 * "Time to clock in" reminders. The database calls this every 5 minutes
 * (pg_cron + pg_net, database update 20) with the password it keeps in
 * app_secrets. Anyone scheduled for an hour starting in the next 10 minutes
 * who isn't clocked in, hasn't said they'll be absent, and hasn't been
 * reminded yet gets one notification.
 */

export const dynamic = "force-dynamic";

/** Minutes since midnight, store time (Arizona: always UTC−7). */
function storeMinutesNow() {
  const d = new Date(Date.now() - 7 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export async function POST(req: Request) {
  const db = createSecretClient();
  const { data: secret } = await db.from("app_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  const given = Buffer.from(req.headers.get("x-cron-secret") ?? "");
  const want = Buffer.from(secret?.value ?? "-");
  if (!secret?.value || given.length !== want.length || !timingSafeEqual(given, want)) return new Response("No", { status: 401 });

  const today = storeToday();
  const now = storeMinutesNow();
  const [{ data: windows }, { data: schedule }, { data: open }, { data: absent }, { data: sent }] = await Promise.all([
    db.from("pickup_windows").select("id, label, starts_at"),
    db.from("staff_schedule").select("staff_id, window_id").eq("work_date", today),
    db.from("staff_shifts").select("staff_id").is("clock_out", null),
    db.from("staff_absences").select("staff_id, window_id").eq("work_date", today),
    db.from("staff_reminders_sent").select("staff_id, window_id").eq("work_date", today),
  ]);
  const win = new Map((windows ?? []).map((w) => [w.id, w]));
  const onClock = new Set((open ?? []).map((s) => s.staff_id));
  const done = new Set((sent ?? []).map((s) => `${s.staff_id}:${s.window_id}`));

  let count = 0;
  for (const s of schedule ?? []) {
    const w = win.get(s.window_id);
    if (!w) continue;
    const [h, m] = w.starts_at.split(":").map(Number);
    const startsIn = h * 60 + m - now;
    if (startsIn < -5 || startsIn > 10) continue;
    if (onClock.has(s.staff_id) || done.has(`${s.staff_id}:${s.window_id}`)) continue;
    if ((absent ?? []).some((a) => a.staff_id === s.staff_id && (a.window_id === null || a.window_id === s.window_id))) continue;
    const { error } = await db.from("staff_reminders_sent").insert({ staff_id: s.staff_id, work_date: today, window_id: s.window_id });
    if (error) continue; // already sent by a run a moment ago
    const at = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    await notify([s.staff_id], {
      title: startsIn > 0 ? `${w.label} starts at ${at}` : `${w.label} has started`,
      body: "Remember to clock in when you get to the store.",
      url: "/work",
      tag: `remind-${today}-${s.window_id}`,
    }, { skipApp: true }); // the Android app schedules its own reminders on the phone
    count += 1;
  }
  return Response.json({ reminded: count });
}
