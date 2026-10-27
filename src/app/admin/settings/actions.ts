"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

export type SettingsState = { ok?: boolean; message?: string; errors?: Record<string, string> };

function refresh() {
  for (const path of ["/admin/settings", "/admin", "/admin/inventory", "/admin/orders", "/", "/cart"]) revalidatePath(path);
}

function errorsOf(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 14:00");
const whole = (label: string, min: number, max: number) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} can be at most ${max}`);

// ---- Store info -----------------------------------------------------------------

const storeSchema = z.object({
  store_hours: z.string().trim().min(1, "Enter the store hours").max(120),
  pickup_location: z.string().trim().min(1, "Enter where students pick up").max(120),
  banner_text: z.string().trim().max(160, "Keep the banner under 160 characters"),
});

export async function saveStoreInfo(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase } = await requireAdmin();
  const parsed = storeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const { error } = await supabase
    .from("settings")
    .update({ ...parsed.data, banner_text: parsed.data.banner_text || null })
    .eq("id", 1);
  if (error) return { message: error.message };
  refresh();
  return { ok: true, message: "Store info saved" };
}

// ---- Ordering rules ---------------------------------------------------------------

const orderingSchema = z.object({
  order_cutoff_time: time,
  order_lead_minutes: whole("Lead time", 0, 240),
  max_orders_per_student_day: whole("Orders per student", 1, 20),
  max_items_per_order: whole("Items per order", 1, 50),
  max_orders_per_hour_per_device: whole("Orders per device", 1, 100),
});

export async function saveOrderingRules(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase } = await requireAdmin();
  const parsed = orderingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const { error } = await supabase.from("settings").update(parsed.data).eq("id", 1);
  if (error) return { message: error.message };
  refresh();
  return { ok: true, message: "Ordering rules saved" };
}

// ---- Inventory math + privacy ---------------------------------------------------------

const inventorySchema = z.object({
  sales_average_days: whole("Days of sales to average", 7, 180),
  reorder_buffer_days: whole("Safety days", 0, 30),
  shopping_interval_days: whole("Days between trips", 1, 60),
  next_shopping_date: z.union([z.literal(""), z.iso.date("Choose a date")]),
  order_retention_days: whole("Days to keep orders", 7, 730),
});

export async function saveInventorySettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase } = await requireAdmin();
  const parsed = inventorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const { error } = await supabase
    .from("settings")
    .update({ ...parsed.data, next_shopping_date: parsed.data.next_shopping_date || null })
    .eq("id", 1);
  if (error) return { message: error.message };
  refresh();
  return { ok: true, message: "Saved" };
}

// ---- Pickup windows ---------------------------------------------------------------------

const windowSchema = z.object({
  id: z.number().int().nullable(),
  label: z.string().trim().min(1, "Every pickup time needs a name").max(40, "Keep names under 40 characters"),
  starts_at: time,
  active: z.boolean(),
});

/**
 * Saves the whole list of pickup windows at once. Windows are ordered by
 * time. A removed window that past orders still point to is turned off
 * instead of deleted (so those orders keep their pickup time).
 */
export async function savePickupWindows(windows: z.input<typeof windowSchema>[], removedIds: number[]) {
  const { supabase } = await requireAdmin();
  const parsed = z.array(windowSchema).min(1, "Keep at least one pickup time").safeParse(windows);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.some((w) => w.active)) return { error: "At least one pickup time must be turned on." };

  const sorted = [...parsed.data].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  for (const [i, w] of sorted.entries()) {
    const row = { label: w.label, starts_at: w.starts_at, active: w.active, sort_order: i };
    const { error } = w.id
      ? await supabase.from("pickup_windows").update(row).eq("id", w.id)
      : await supabase.from("pickup_windows").insert(row);
    if (error) return { error: error.message };
  }

  let turnedOff = 0;
  for (const id of removedIds) {
    const { error } = await supabase.from("pickup_windows").delete().eq("id", id);
    if (error?.code === "23503") {
      // "foreign key violation": orders use this window, so hide it instead.
      await supabase.from("pickup_windows").update({ active: false }).eq("id", id);
      turnedOff++;
    } else if (error) {
      return { error: error.message };
    }
  }

  refresh();
  return {
    ok: true,
    message: turnedOff
      ? `Saved. ${turnedOff} removed time${turnedOff === 1 ? " was" : "s were"} turned off instead, because past orders use ${turnedOff === 1 ? "it" : "them"}.`
      : "Pickup times saved",
  };
}

// ---- Closed days ----------------------------------------------------------------------------

const closedSchema = z.object({
  from: z.iso.date("Choose the first day"),
  to: z.union([z.literal(""), z.iso.date("Choose the last day")]),
  reason: z.string().trim().max(60),
});

/** Adds one closed day, or every weekday from `from` to `to`. */
export async function addClosedDays(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase } = await requireAdmin();
  const parsed = closedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };
  const { from, reason } = parsed.data;
  const to = parsed.data.to || from;
  if (to < from) return { errors: { to: "The last day must be after the first day" } };

  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d.toISOString().slice(0, 10)); // weekends are always closed
    if (days.length > 120) return { errors: { to: "Add at most about 6 months at a time" } };
  }
  if (days.length === 0) return { errors: { from: "Weekends are already closed" } };

  const { error } = await supabase
    .from("closed_dates")
    .upsert(days.map((closed_on) => ({ closed_on, reason: reason || null })), { onConflict: "closed_on" });
  if (error) return { message: error.message };
  refresh();
  return { ok: true, message: `Added ${days.length} closed day${days.length === 1 ? "" : "s"}` };
}

export async function removeClosedDay(day: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("closed_dates").delete().eq("closed_on", day);
  if (error) return { error: error.message };
  refresh();
  return { ok: true };
}

// ---- Admin password -----------------------------------------------------------------------------

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(10, "Use at least 10 characters").max(72),
    confirm: z.string(),
  })
  .refine((p) => p.next === p.confirm, { path: ["confirm"], message: "The new passwords don't match" });

/** Changes the admin's password after checking the current one. */
export async function changePassword(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase, user } = await requireAdmin();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: errorsOf(parsed.error) };

  // Signing in again with the current password proves it's really you.
  const { error: checkError } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
  if (checkError) return { errors: { current: "That isn't your current password" } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { message: error.message };
  return { ok: true, message: "Password changed" };
}
