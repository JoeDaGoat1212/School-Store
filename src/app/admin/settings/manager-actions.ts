"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { addManager, isOwner, removeManager, setManagerPassword } from "@/lib/managers";

type Result = { ok?: true; error?: string };

/** Only the owner can add, change or remove managers. */
async function owner() {
  const { user } = await requireAdmin();
  return isOwner(user.id);
}

function finish(r: { error?: string }): Result {
  if (r.error) return { error: r.error };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function createManager(name: string, password: string): Promise<Result> {
  if (!(await owner())) return { error: "Only the owner can add managers." };
  return finish(await addManager(name, password));
}

export async function resetManagerPassword(userId: string, password: string): Promise<Result> {
  if (!(await owner())) return { error: "Only the owner can change a manager's password." };
  return finish(await setManagerPassword(userId, password));
}

export async function deleteManager(userId: string): Promise<Result> {
  if (!(await owner())) return { error: "Only the owner can remove managers." };
  return finish(await removeManager(userId));
}
