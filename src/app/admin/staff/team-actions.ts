"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { removePushSubscription, savePushSubscription } from "@/lib/push";
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
