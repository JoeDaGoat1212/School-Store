"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { parseDollarsToCents } from "@/lib/format";

/* Approving teachers, and the teacher-price / room service settings. */

export async function setTeacherStatus(id: string, status: "approved" | "removed" | "pending") {
  const { supabase, user } = await requireAdmin();
  const { error } = await supabase
    .from("teachers")
    .update({
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: status === "approved" ? user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  revalidatePath("/teacher");
  return { ok: true };
}

const settingsSchema = z.object({
  markup: z.string().trim(),
  room_service: z.boolean(),
});

export async function saveTeacherSettings(input: z.input<typeof settingsSchema>) {
  const { supabase } = await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  const cents = parsed.success ? parseDollarsToCents(parsed.data.markup) : null;
  if (!parsed.success || cents === null || cents < 0 || cents > 500) return { error: "Enter an amount from 0.00 to 5.00" };
  const { error } = await supabase
    .from("settings")
    .update({ teacher_markup_cents: cents, room_service_enabled: parsed.data.room_service, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/admin/teachers");
  revalidatePath("/", "layout");
  return { ok: true };
}
