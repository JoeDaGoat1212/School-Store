"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

/* Hiring (or not) players for the 3D city's jobs. */

export async function decideApplication(id: string, status: "hired" | "declined" | "fired", note?: string) {
  const { supabase, user } = await requireAdmin();
  const { error } = await supabase
    .from("game_job_applications")
    .update({
      status,
      staff_note: note?.trim().slice(0, 200) || null,
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
