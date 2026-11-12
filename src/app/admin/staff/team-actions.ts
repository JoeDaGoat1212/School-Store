"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isOwner } from "@/lib/managers";
import { removePushSubscription, savePushSubscription, testFcmAccount } from "@/lib/push";
import { createSecretClient } from "@/lib/supabase/server";
import { ADMIN, contacts, createGroup, leaveGroup, listThreads, openDirect, readThread, sendMessage } from "@/lib/team";

/* The manager's side of messages, tasks, restock checks and notifications (database update 20). */

export async function adminThreads() {
  await requireAdmin();
  const [r, people] = await Promise.all([listThreads(ADMIN), contacts(ADMIN)]);
  return { ...r, contacts: people };
}
export async function adminThread(id: string) {
  await requireAdmin();
  return readThread(ADMIN, id);
}
/** The owner only: delete anyone's message in a chat the owner can see. It disappears for everyone. */
export async function adminDeleteMessage(messageId: string) {
  const { user } = await requireAdmin();
  if (!(await isOwner(user.id))) return { error: "Only the owner can delete messages." };
  if (!/^[0-9a-f-]{36}$/.test(messageId)) return { error: "That message wasn't found." };
  const db = createSecretClient();
  const { data: msg } = await db.from("chat_messages").select("id, thread_id").eq("id", messageId).maybeSingle();
  if (!msg) return { error: "That message was already deleted." };
  // Only in chats the owner can open (Everyone, or ones the manager is in).
  const { error: seeError } = await readThread(ADMIN, msg.thread_id);
  if (seeError) return { error: "That message wasn't found." };
  const { error } = await db.from("chat_messages").delete().eq("id", messageId);
  return error ? { error: "Couldn't delete it. Try again." } : { ok: true as const };
}

export async function adminSend(id: string, body: string) {
  await requireAdmin();
  return sendMessage(ADMIN, id, body);
}
export async function adminDirect(member: string) {
  await requireAdmin();
  return openDirect(ADMIN, member);
}
export async function adminGroup(name: string, members: string[]) {
  await requireAdmin();
  return createGroup(ADMIN, name, members);
}
export async function adminLeave(id: string) {
  await requireAdmin();
  return leaveGroup(ADMIN, id);
}

export async function adminSavePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await requireAdmin();
  return savePushSubscription("admin", sub);
}
export async function adminRemovePush(endpoint: string) {
  await requireAdmin();
  await removePushSubscription(endpoint);
  return { ok: true as const };
}

/* ---------------------------------------------------------------- tasks */

type TaskInput = { title: string; details: string; repeat: "once" | "weekly" | "daily"; date: string; staffId: string };

function taskRow(t: TaskInput) {
  const title = t.title.trim().slice(0, 120);
  if (!title) return { error: "Give the task a name." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return { error: "Pick a day." };
  const weekday = new Date(`${t.date}T12:00:00Z`).getUTCDay();
  return {
    row: {
      title,
      details: t.details.trim().slice(0, 300) || null,
      task_date: t.repeat === "once" ? t.date : null,
      weekday: t.repeat === "weekly" ? weekday : null,
      staff_id: t.staffId || null,
    },
  };
}

export async function addTask(t: TaskInput) {
  const { supabase } = await requireAdmin();
  const r = taskRow(t);
  if ("error" in r) return { error: r.error };
  const { error } = await supabase.from("staff_tasks").insert(r.row);
  if (error) return { error: /staff_tasks|schema cache/.test(error.message) ? "Tasks need database update 20." : error.message };
  revalidatePath("/admin/staff/tasks");
  return { ok: true as const };
}

export async function updateTask(id: string, t: TaskInput) {
  const { supabase } = await requireAdmin();
  const r = taskRow(t);
  if ("error" in r) return { error: r.error };
  const { error } = await supabase.from("staff_tasks").update(r.row).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/staff/tasks");
  return { ok: true as const };
}

export async function deleteTask(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("staff_tasks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/staff/tasks");
  return { ok: true as const };
}

/* ---------------------------------------------------------------- restock */

export async function markRestockChecked(id: string, reviewed: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("restock_checks").update({ reviewed }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true as const };
}

export async function saveRestockAreas(text: string) {
  const { supabase } = await requireAdmin();
  const areas = [...new Set(text.split(/[\n,]/).map((a) => a.trim().slice(0, 40)).filter(Boolean))].slice(0, 10);
  if (areas.length === 0) return { error: "List at least one area, like Fridge." };
  const { error } = await supabase.from("settings").update({ restock_areas: areas }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/staff/restock");
  return { ok: true as const };
}

/* ---------------------------------------------------------------- absences */

export async function markAbsencesSeen() {
  const { supabase } = await requireAdmin();
  await supabase.from("staff_absences").update({ seen: true }).eq("seen", false);
  revalidatePath("/admin", "layout");
  return { ok: true as const };
}

/* ---------------------------------------------------------------- Android notifications (Firebase) */

/** Saves the Firebase service account key after checking Google accepts it. */
export async function saveFirebaseKey(json: string) {
  await requireAdmin();
  const r = await testFcmAccount(json.trim());
  if (!r.account) return { error: r.error ?? "That key didn't work." };
  const { error } = await createSecretClient()
    .from("app_secrets")
    .upsert({ key: "fcm_service_account", value: JSON.stringify(r.account) }, { onConflict: "key" });
  if (error) return { error: "Run database update 20 first." };
  revalidatePath("/admin/staff/messages");
  return { ok: true as const, project: r.account.project_id };
}

export async function removeFirebaseKey() {
  await requireAdmin();
  await createSecretClient().from("app_secrets").delete().eq("key", "fcm_service_account");
  revalidatePath("/admin/staff/messages");
  return { ok: true as const };
}
