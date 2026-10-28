"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  key: z.string().trim().min(1).max(80),
  status: z.enum(["new", "planned", "stocked", "declined"]),
  note: z.string().trim().max(200).optional().default(""),
});

/**
 * Staff's answer for one requested item. Students see "Coming soon" (planned)
 * or "Now selling" (stocked) next to it; declined items stop showing up in
 * the "others are asking for" list.
 */
export async function setRequestStatus(input: z.input<typeof schema>) {
  const { supabase } = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Couldn't save that." };
  const { key, status, note } = parsed.data;
  const { error } = await supabase
    .from("item_request_status")
    .upsert({ item_key: key, status, staff_note: note || null, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/admin/requests");
  revalidatePath("/", "layout");
  return { ok: true };
}
