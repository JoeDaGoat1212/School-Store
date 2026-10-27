"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

export type RewardResult = { ok?: boolean; message?: string };

function done(message: string): RewardResult {
  revalidatePath("/admin/rewards");
  revalidatePath("/", "layout");
  return { ok: true, message };
}

/** Rewards on/off and how many points each $1 earns. */
export async function saveRewardSettings(enabled: boolean, pointsPerDollar: number): Promise<RewardResult> {
  const { supabase } = await requireAdmin();
  if (!Number.isInteger(pointsPerDollar) || pointsPerDollar < 1 || pointsPerDollar > 100) {
    return { message: "Points per $1 must be a whole number from 1 to 100." };
  }
  const { error } = await supabase
    .from("settings")
    .update({ rewards_enabled: enabled, points_per_dollar: pointsPerDollar })
    .eq("id", 1);
  return error ? { message: `Couldn't save: ${error.message}` } : done("Rewards settings saved");
}

export async function addReward(productId: string, pointsCost: number): Promise<RewardResult> {
  const { supabase } = await requireAdmin();
  if (!productId) return { message: "Choose a product." };
  if (!Number.isInteger(pointsCost) || pointsCost < 1 || pointsCost > 100000) {
    return { message: "Points must be a whole number above 0." };
  }
  const { error } = await supabase.from("rewards").insert({ product_id: productId, points_cost: pointsCost });
  return error ? { message: `Couldn't add: ${error.message}` } : done("Reward added");
}

export async function updateReward(id: string, patch: { points_cost?: number; active?: boolean }): Promise<RewardResult> {
  const { supabase } = await requireAdmin();
  if (patch.points_cost !== undefined && (!Number.isInteger(patch.points_cost) || patch.points_cost < 1)) {
    return { message: "Points must be a whole number above 0." };
  }
  const { error } = await supabase.from("rewards").update(patch).eq("id", id);
  return error ? { message: `Couldn't save: ${error.message}` } : done("Reward saved");
}

export async function deleteReward(id: string): Promise<RewardResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("rewards").delete().eq("id", id);
  return error ? { message: `Couldn't delete: ${error.message}` } : done("Reward removed");
}

/** Add (positive) or take away (negative) a member's points, with a reason. */
export async function adjustMemberPoints(customerId: string, change: number, note: string): Promise<RewardResult> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("adjust_points", { p_customer_id: customerId, p_change: change, p_note: note });
  if (error) return { message: error.hint || error.message };
  return done(change > 0 ? `Added ${change} points` : `Removed ${-change} points`);
}
