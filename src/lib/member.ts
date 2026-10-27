import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Rewards accounts ("members").
 *
 * A student signs in with an email code (Supabase Auth). The first time,
 * they fill in their name and grade, which creates their row in `customers`.
 * Until then they're signed in but not a member yet.
 */

export type PointsEntry = {
  change: number;
  reason: "earned" | "earned_undo" | "redeemed" | "refunded" | "adjusted";
  note: string | null;
  order_number: number | null;
  created_at: string;
};

export type MemberOrder = {
  order_number: number;
  status: string;
  pickup_date: string;
  total_cents: number;
  points_earned: number;
  points_spent: number;
};

export type Account = {
  email: string;
  /** True for the staff login (it can't be a rewards account). */
  staff: boolean;
  profile: { first_name: string; last_name: string; grade: string; created_at: string; username?: string | null } | null;
  balance: number;
  history: PointsEntry[];
  orders: MemberOrder[];
};

export type Reward = {
  id: string;
  points_cost: number;
  product_id: string;
  name: string;
  emoji: string | null;
  photo_path: string | null;
  category: string;
  available: number;
};

/**
 * The signed-in student's account, or null if nobody is signed in.
 * `cache` means pages and the header can both call it in one request and
 * the database is only asked once.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;

  const { data, error } = await supabase.rpc("get_my_account");
  if (error || !data) return null;
  return data as unknown as Account;
});

/** The rewards students can spend points on (empty if rewards are turned off). */
export const getRewards = cache(async (): Promise<Reward[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_rewards");
  return (data ?? []) as unknown as Reward[];
});
