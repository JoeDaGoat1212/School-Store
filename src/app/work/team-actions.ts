"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { removePushSubscription, savePushSubscription, vapidKeys } from "@/lib/push";
import {
  cancelAbsence,
  contacts,
  createGroup,
  leaveGroup,
  listThreads,
  markAbsent,
  type Me,
  meFromToken,
  myAbsences,
  openDirect,
  readThread,
  sendMessage,
  setTaskDone,
  tasksForDay,
} from "@/lib/team";

/* The employee web app's messages, tasks, absences and notifications (database update 20). */

const SIGNED_OUT = { error: "You're signed out. Sign in again." };

async function me(): Promise<Me | null> {
  const t = (await cookies()).get("fn_work")?.value;
  return t ? meFromToken(t) : null;
}

export async function workThreads() {
  const m = await me();
  if (!m) return SIGNED_OUT;
  const [r, people] = await Promise.all([listThreads(m), contacts(m)]);
  return { ...r, contacts: people };
}

export async function workThread(id: string) {
  const m = await me();
  return m ? readThread(m, id) : SIGNED_OUT;
}

export async function workSend(id: string, body: string) {
  const m = await me();
  if (!m) return SIGNED_OUT;
  const r = await sendMessage(m, id, body);
  revalidatePath("/admin/staff/messages");
  return r;
}

export async function workDirect(member: string) {
  const m = await me();
  return m ? openDirect(m, member) : SIGNED_OUT;
}

export async function workGroup(name: string, members: string[]) {
  const m = await me();
  return m ? createGroup(m, name, members) : SIGNED_OUT;
}

export async function workLeave(id: string) {
  const m = await me();
  return m ? leaveGroup(m, id) : SIGNED_OUT;
}

export async function workTasks(date: string) {
  const m = await me();
  return m?.staffId ? tasksForDay(date, m.staffId) : SIGNED_OUT;
}

export async function workTaskDone(taskId: string, date: string, done: boolean) {
  const m = await me();
  if (!m?.staffId) return SIGNED_OUT;
  const r = await setTaskDone(m.staffId, taskId, date, done);
  revalidatePath("/admin/staff/tasks");
  return r;
}

export async function workAbsences() {
  const m = await me();
  return m?.staffId ? { absences: await myAbsences(m.staffId) } : SIGNED_OUT;
}

export async function workAbsent(date: string, shift: number | string | null, reason: string) {
  const m = await me();
  if (!m) return SIGNED_OUT;
  const r = await markAbsent(m, date, shift, reason);
  revalidatePath("/admin", "layout");
  return r;
}

export async function workCancelAbsent(id: string) {
  const m = await me();
  if (!m?.staffId) return SIGNED_OUT;
  const r = await cancelAbsence(m.staffId, id);
  revalidatePath("/admin", "layout");
  return r;
}

export async function workPushKey() {
  return (await vapidKeys())?.publicKey ?? null;
}

export async function workSavePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const m = await me();
  return m ? savePushSubscription(m.member, sub) : SIGNED_OUT;
}

export async function workRemovePush(endpoint: string) {
  await removePushSubscription(endpoint);
  return { ok: true as const };
}
