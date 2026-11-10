import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { addDays, storeToday } from "@/lib/format";
import { notify } from "@/lib/push";
import { createSecretClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/work-session";

/*
 * Team tools (database update 20), shared by the employee web app (/work),
 * the store tablet (/clock), the Android app (/api/app/…) and the admin pages.
 * The callers check who's asking; everything here runs with the server key.
 *
 * A "member" is an employee's staff id, or "admin" for the manager.
 */

export type Me = { member: string; name: string; staffId: string | null };
export const ADMIN: Me = { member: "admin", name: "Manager", staffId: null };

const NOT_READY = "This needs database update 20. Ask your manager to run it.";
const missing = (m?: string) => Boolean(m && /does not exist|schema cache|chat_|restock_|staff_tasks|staff_absences|push_subscriptions/i.test(m));
const fail = (m?: string) => ({ error: missing(m) ? NOT_READY : (m ?? "Something went wrong. Try again.") });

/** The employee an app sign-in token belongs to (null when signed out). */
export async function meFromToken(token: string): Promise<Me | null> {
  const { data } = await createSecretClient().rpc("staff_portal_staff", { p_token_hash: hashToken(token) });
  const s = data as { id?: string; name?: string } | null;
  return s?.id ? { member: s.id, name: s.name ?? "Employee", staffId: s.id } : null;
}

/* ================================================================ Messages */

export type Contact = { member: string; name: string };
export type ThreadSummary = {
  id: string;
  kind: "everyone" | "direct" | "group";
  title: string;
  members: Contact[];
  last: { body: string; sender: string; senderName: string; at: string } | null;
  unread: number;
};
export type ChatMessage = { id: string; sender: string; senderName: string; body: string; at: string; mine: boolean };

/** Everyone you can message: active employees, plus the manager. */
export async function contacts(me: Me): Promise<Contact[]> {
  const { data } = await createSecretClient().from("staff").select("id, name").eq("status", "active").order("name");
  return [{ member: "admin", name: "Manager" }, ...(data ?? []).map((s) => ({ member: s.id, name: s.name }))].filter((c) => c.member !== me.member);
}

async function nameMap() {
  const { data } = await createSecretClient().from("staff").select("id, name");
  const m = new Map<string, string>((data ?? []).map((s) => [s.id, s.name]));
  m.set("admin", "Manager");
  return m;
}

/** Can this member read and write in this chat? */
async function canUse(me: Me, threadId: string) {
  const db = createSecretClient();
  const { data: t } = await db.from("chat_threads").select("id, kind, name").eq("id", threadId).maybeSingle();
  if (!t) return null;
  if (t.kind === "everyone") return t;
  const { data: m } = await db.from("chat_members").select("member").eq("thread_id", threadId).eq("member", me.member).maybeSingle();
  return m ? t : null;
}

export async function listThreads(me: Me): Promise<{ threads?: ThreadSummary[]; error?: string }> {
  const db = createSecretClient();
  const { data: mine, error } = await db.from("chat_members").select("thread_id, last_read_at").eq("member", me.member);
  if (error) return fail(error.message);
  const myIds = (mine ?? []).map((m) => m.thread_id);
  const { data: threads, error: e2 } = await db
    .from("chat_threads")
    .select("id, kind, name, created_at, last_message_at")
    .or(myIds.length ? `kind.eq.everyone,id.in.(${myIds.join(",")})` : "kind.eq.everyone")
    .order("last_message_at", { ascending: false });
  if (e2) return fail(e2.message);
  const ids = (threads ?? []).map((t) => t.id);
  const [{ data: members }, { data: recent }, names] = await Promise.all([
    db.from("chat_members").select("thread_id, member").in("thread_id", ids),
    db.from("chat_messages").select("thread_id, sender, sender_name, body, created_at").in("thread_id", ids).order("created_at", { ascending: false }).limit(400),
    nameMap(),
  ]);
  const readAt = new Map((mine ?? []).map((m) => [m.thread_id, m.last_read_at]));
  return {
    threads: (threads ?? []).map((t) => {
      const people = (members ?? []).filter((m) => m.thread_id === t.id).map((m) => ({ member: m.member, name: names.get(m.member) ?? "Former employee" }));
      const msgs = (recent ?? []).filter((m) => m.thread_id === t.id);
      const lastRead = readAt.get(t.id) ?? "1970-01-01";
      const other = people.find((p) => p.member !== me.member);
      return {
        id: t.id,
        kind: t.kind as ThreadSummary["kind"],
        title: t.kind === "everyone" ? "Everyone" : t.kind === "direct" ? (other?.name ?? "Chat") : (t.name ?? "Group"),
        members: people,
        last: msgs[0] ? { body: msgs[0].body, sender: msgs[0].sender, senderName: msgs[0].sender_name, at: msgs[0].created_at } : null,
        unread: msgs.filter((m) => m.sender !== me.member && m.created_at > lastRead).length,
      };
    }),
  };
}

export async function unreadCount(me: Me) {
  const r = await listThreads(me);
  return (r.threads ?? []).reduce((n, t) => n + t.unread, 0);
}

export async function readThread(me: Me, threadId: string): Promise<{ thread?: ThreadSummary; messages?: ChatMessage[]; error?: string }> {
  const t = await canUse(me, threadId);
  if (!t) return { error: "That chat isn't available." };
  const db = createSecretClient();
  const [{ data: msgs, error }, list] = await Promise.all([
    db.from("chat_messages").select("id, sender, sender_name, body, created_at").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(150),
    listThreads(me),
  ]);
  if (error) return fail(error.message);
  await db.from("chat_members").upsert({ thread_id: threadId, member: me.member, last_read_at: new Date().toISOString() }, { onConflict: "thread_id,member" });
  const thread = list.threads?.find((x) => x.id === threadId);
  return {
    thread: thread ? { ...thread, unread: 0 } : undefined,
    messages: (msgs ?? []).reverse().map((m) => ({ id: m.id, sender: m.sender, senderName: m.sender_name, body: m.body, at: m.created_at, mine: m.sender === me.member })),
  };
}

export async function sendMessage(me: Me, threadId: string, text: string): Promise<{ ok?: true; error?: string }> {
  const body = String(text ?? "").trim().slice(0, 1000);
  if (!body) return { error: "Type a message first." };
  const t = await canUse(me, threadId);
  if (!t) return { error: "That chat isn't available." };
  const db = createSecretClient();
  const now = new Date().toISOString();
  const { error } = await db.from("chat_messages").insert({ thread_id: threadId, sender: me.member, sender_name: me.name.slice(0, 40), body });
  if (error) return fail(error.message);
  await Promise.all([
    db.from("chat_threads").update({ last_message_at: now }).eq("id", threadId),
    db.from("chat_members").upsert({ thread_id: threadId, member: me.member, last_read_at: now }, { onConflict: "thread_id,member" }),
  ]);

  // Tell everyone else in the chat.
  let to: string[];
  if (t.kind === "everyone") {
    const { data: staff } = await db.from("staff").select("id").eq("status", "active");
    to = ["admin", ...(staff ?? []).map((s) => s.id)];
  } else {
    const { data: m } = await db.from("chat_members").select("member").eq("thread_id", threadId);
    to = (m ?? []).map((x) => x.member);
  }
  to = to.filter((x) => x !== me.member);
  const title = t.kind === "direct" ? me.name : `${me.name} in ${t.kind === "everyone" ? "Everyone" : (t.name ?? "a group")}`;
  const preview = body.length > 140 ? `${body.slice(0, 137)}…` : body;
  await Promise.all([
    notify(to.filter((x) => x !== "admin"), { title, body: preview, url: `/work?tab=messages&chat=${threadId}`, tag: `chat-${threadId}` }),
    to.includes("admin") ? notify(["admin"], { title, body: preview, url: `/admin/staff/messages?chat=${threadId}`, tag: `chat-${threadId}` }) : null,
  ]);
  return { ok: true };
}

async function validMember(member: string) {
  if (member === "admin") return true;
  if (!/^[0-9a-f-]{36}$/.test(member)) return false;
  const { data } = await createSecretClient().from("staff").select("id").eq("id", member).eq("status", "active").maybeSingle();
  return Boolean(data);
}

/** Opens (or starts) a one-on-one chat. */
export async function openDirect(me: Me, other: string): Promise<{ id?: string; error?: string }> {
  if (other === me.member || !(await validMember(other))) return { error: "Pick someone to message." };
  const key = [me.member, other].sort().join(":");
  const db = createSecretClient();
  const { data: found, error } = await db.from("chat_threads").select("id").eq("direct_key", key).maybeSingle();
  if (error) return fail(error.message);
  if (found) return { id: found.id };
  const { data: t, error: e2 } = await db.from("chat_threads").insert({ kind: "direct", direct_key: key, created_by: me.member }).select("id").single();
  if (e2 || !t) {
    // Both people started it at the same moment.
    const { data: again } = await db.from("chat_threads").select("id").eq("direct_key", key).maybeSingle();
    return again ? { id: again.id } : fail(e2?.message);
  }
  await db.from("chat_members").insert([
    { thread_id: t.id, member: me.member },
    { thread_id: t.id, member: other, last_read_at: "1970-01-01T00:00:00Z" },
  ]);
  return { id: t.id };
}

export async function createGroup(me: Me, name: string, members: string[]): Promise<{ id?: string; error?: string }> {
  const title = String(name ?? "").trim().slice(0, 40);
  if (!title) return { error: "Give the group a name." };
  const picked = [...new Set(members.filter((m) => m !== me.member))];
  const ok = (await Promise.all(picked.map(validMember))).every(Boolean);
  if (picked.length === 0 || !ok) return { error: "Pick at least one person." };
  const db = createSecretClient();
  const { data: t, error } = await db.from("chat_threads").insert({ kind: "group", name: title, created_by: me.member }).select("id").single();
  if (error || !t) return fail(error?.message);
  await db
    .from("chat_members")
    .insert([{ thread_id: t.id, member: me.member }, ...picked.map((m) => ({ thread_id: t.id, member: m, last_read_at: "1970-01-01T00:00:00Z" }))]);
  await notify(picked.filter((x) => x !== "admin"), { title: `${me.name} added you to ${title}`, body: "Tap to open the group chat.", url: `/work?tab=messages&chat=${t.id}` });
  return { id: t.id };
}

/** Leave a group chat (one-on-one chats and Everyone can't be left). */
export async function leaveGroup(me: Me, threadId: string) {
  const db = createSecretClient();
  const { data: t } = await db.from("chat_threads").select("kind").eq("id", threadId).maybeSingle();
  if (t?.kind !== "group") return { error: "Only group chats can be left." };
  await db.from("chat_members").delete().eq("thread_id", threadId).eq("member", me.member);
  return { ok: true as const };
}

/* ================================================================ Tasks */

export type DayTask = { id: string; title: string; details: string | null; forEveryone: boolean; repeats: string | null; done: boolean; doneBy: string[] };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Tasks for a day. With a staff id: theirs plus everyone's, and whether they checked each off. */
export async function tasksForDay(date: string, staffId: string | null): Promise<{ tasks?: DayTask[]; error?: string }> {
  const db = createSecretClient();
  let q = db
    .from("staff_tasks")
    .select("id, title, details, task_date, weekday, staff_id, sort, created_at")
    .or(`task_date.eq.${date},weekday.eq.${weekdayOf(date)},and(task_date.is.null,weekday.is.null)`)
    .order("sort")
    .order("created_at");
  if (staffId) q = q.or(`staff_id.is.null,staff_id.eq.${staffId}`);
  const { data, error } = await q;
  if (error) return fail(error.message);
  const ids = (data ?? []).map((t) => t.id);
  const [{ data: done }, names] = await Promise.all([
    ids.length ? db.from("staff_task_done").select("task_id, staff_id").eq("work_date", date).in("task_id", ids) : Promise.resolve({ data: [] as { task_id: string; staff_id: string }[] }),
    nameMap(),
  ]);
  return {
    tasks: (data ?? []).map((t) => {
      const by = (done ?? []).filter((d) => d.task_id === t.id);
      return {
        id: t.id,
        title: t.title,
        details: t.details,
        forEveryone: !t.staff_id,
        repeats: t.weekday !== null ? `Every ${WEEKDAYS[t.weekday]}` : t.task_date ? null : "Every day",
        done: staffId ? by.some((d) => d.staff_id === staffId) : by.length > 0,
        doneBy: by.map((d) => names.get(d.staff_id) ?? "Someone"),
      };
    }),
  };
}

export async function setTaskDone(staffId: string, taskId: string, date: string, done: boolean) {
  const db = createSecretClient();
  if (date !== storeToday() && date !== addDays(storeToday(), -1)) return { error: "You can only check off today's tasks." };
  const r = done
    ? await db.from("staff_task_done").upsert({ task_id: taskId, work_date: date, staff_id: staffId }, { onConflict: "task_id,work_date,staff_id" })
    : await db.from("staff_task_done").delete().eq("task_id", taskId).eq("work_date", date).eq("staff_id", staffId);
  return r.error ? fail(r.error.message) : { ok: true as const };
}

/* ================================================================ Absences */

export type Absence = { id: string; date: string; windowId: number | null; label: string; reason: string | null };

export async function myAbsences(staffId: string): Promise<Absence[]> {
  const db = createSecretClient();
  const [{ data }, { data: windows }] = await Promise.all([
    db.from("staff_absences").select("id, work_date, window_id, reason").eq("staff_id", staffId).gte("work_date", storeToday()).order("work_date"),
    db.from("pickup_windows").select("id, label"),
  ]);
  const label = new Map((windows ?? []).map((w) => [w.id, w.label]));
  return (data ?? []).map((a) => ({ id: a.id, date: a.work_date, windowId: a.window_id, label: a.window_id ? (label.get(a.window_id) ?? "Shift") : "All day", reason: a.reason }));
}

/** "I can't make it": a shift (by its hour's id or name, like "5th hour"), or the whole day (null). Tells the manager. */
export async function markAbsent(me: Me, date: string, shift: number | string | null, reason: string) {
  if (!me.staffId) return { error: "Only employees can mark an absence." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < storeToday()) return { error: "Pick today or a day coming up." };
  const db = createSecretClient();
  let w: { id: number; label: string } | null = null;
  if (shift !== null && shift !== "") {
    const q = db.from("pickup_windows").select("id, label");
    const { data } = typeof shift === "number" ? await q.eq("id", shift).maybeSingle() : await q.eq("label", String(shift).slice(0, 40)).maybeSingle();
    if (!data) return { error: "That shift wasn't found." };
    w = data;
  }
  const windowId = w?.id ?? null;
  const { error } = await db.from("staff_absences").insert({ staff_id: me.staffId, work_date: date, window_id: windowId, reason: reason.trim().slice(0, 200) || null });
  if (error) return /duplicate|unique/i.test(error.message) ? { ok: true as const } : fail(error.message);
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
  await notify(["admin"], {
    title: `${me.name} can't make it`,
    body: `${w?.label ?? "All day"}, ${day}${reason.trim() ? `: ${reason.trim().slice(0, 120)}` : ""}`,
    url: "/admin/staff",
    tag: `absence-${me.staffId}-${date}`,
  });
  return { ok: true as const };
}

export async function cancelAbsence(staffId: string, id: string) {
  const { error } = await createSecretClient().from("staff_absences").delete().eq("id", id).eq("staff_id", staffId);
  return error ? fail(error.message) : { ok: true as const };
}

/* ================================================================ Restocking */

export type RestockStart = { checkId: string; token: string; name: string; areas: string[]; done: string[] };

const restockHash = (t: string) => createHash("sha256").update(`restock:${t}`).digest("hex");

/**
 * Starts (or picks up) the restock photos for a shift that was just clocked
 * out. Proven with the clock-out's undo code, so it works the same from the
 * store tablet, the web app and the Android app.
 */
export async function startRestock(shiftId: string, undoToken: string): Promise<RestockStart | { error: string }> {
  if (!/^[0-9a-f-]{36}$/.test(shiftId) || !/^[0-9a-f]{20,64}$/.test(undoToken)) return { error: "That shift wasn't found." };
  const db = createSecretClient();
  const { data: shift } = await db.from("staff_shifts").select("id, staff_id, staff_name, clock_out, undo_token").eq("id", shiftId).maybeSingle();
  if (!shift || shift.undo_token !== undoToken || !shift.clock_out) return { error: "That shift wasn't found." };
  if (Date.now() - new Date(shift.clock_out).getTime() > 30 * 60000) return { error: "That shift ended a while ago." };
  const { data: settings, error: se } = await db.from("settings").select("restock_areas").eq("id", 1).maybeSingle();
  if (se) return fail(se.message) as { error: string };
  const areas = settings?.restock_areas?.length ? settings.restock_areas : ["Fridge", "Snacks", "Ramen", "Chips"];
  const token = randomBytes(24).toString("hex");

  const { data: existing } = await db.from("restock_checks").select("id").eq("shift_id", shiftId).maybeSingle();
  let checkId = existing?.id;
  if (checkId) {
    await db.from("restock_checks").update({ token_hash: restockHash(token) }).eq("id", checkId);
  } else {
    const { data: made, error } = await db
      .from("restock_checks")
      .insert({ staff_id: shift.staff_id, staff_name: shift.staff_name, shift_id: shiftId, token_hash: restockHash(token), areas })
      .select("id")
      .single();
    if (error || !made) return fail(error?.message) as { error: string };
    checkId = made.id;
  }
  const { data: photos } = await db.from("restock_photos").select("area").eq("check_id", checkId);
  return { checkId, token, name: shift.staff_name, areas, done: (photos ?? []).map((p) => p.area) };
}

async function openCheck(checkId: string, token: string) {
  const { data } = await createSecretClient().from("restock_checks").select("id, areas, token_hash, created_at, staff_id, staff_name").eq("id", checkId).maybeSingle();
  if (!data || !data.token_hash || data.token_hash !== restockHash(token)) return null;
  if (Date.now() - new Date(data.created_at).getTime() > 3 * 3600000) return null;
  return data;
}

/** One photo for one area ("Fridge"). Replaces an earlier photo of the same area. */
export async function addRestockPhoto(checkId: string, token: string, area: string, bytes: Uint8Array, contentType: string) {
  const check = await openCheck(checkId, token);
  if (!check) return { error: "The restock check timed out. Clock out again to start a new one." };
  if (!check.areas.includes(area)) return { error: "That area isn't on the list." };
  if (bytes.byteLength < 1000 || bytes.byteLength > 8 * 1024 * 1024) return { error: "That photo didn't come through. Try again." };
  if (!/^image\/(webp|jpeg|png)$/.test(contentType)) return { error: "Send a photo (JPEG, PNG or WebP)." };
  const db = createSecretClient();
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const today = storeToday();
  const path = `${today.slice(0, 7)}/${checkId}/${area.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomBytes(4).toString("hex")}.${ext}`;
  const up = await db.storage.from("restock").upload(path, bytes, { contentType, upsert: false });
  if (up.error) return { error: `Couldn't save the photo: ${up.error.message}` };
  const { data: old } = await db.from("restock_photos").select("path").eq("check_id", checkId).eq("area", area).maybeSingle();
  const { error } = await db.from("restock_photos").upsert({ check_id: checkId, area, path }, { onConflict: "check_id,area" });
  if (error) {
    await db.storage.from("restock").remove([path]);
    return fail(error.message);
  }
  if (old?.path) await db.storage.from("restock").remove([old.path]);
  const { count } = await db.from("restock_photos").select("area", { count: "exact", head: true }).eq("check_id", checkId);
  const complete = (count ?? 0) >= check.areas.length;
  if (complete) await db.from("restock_checks").update({ completed_at: new Date().toISOString(), skipped_note: null }).eq("id", checkId);
  return { ok: true as const, complete };
}

/** "Couldn't finish": saves why, so the manager sees it instead of guessing. */
export async function skipRestock(checkId: string, token: string, note: string) {
  const check = await openCheck(checkId, token);
  if (!check) return { error: "The restock check timed out." };
  const why = String(note ?? "").trim().slice(0, 200) || "Skipped";
  await createSecretClient().from("restock_checks").update({ skipped_note: why }).eq("id", checkId);
  await notify(["admin"], { title: `${check.staff_name} skipped restock photos`, body: why, url: "/admin/staff/restock" });
  return { ok: true as const };
}
