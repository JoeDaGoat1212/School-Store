import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { MembersTable } from "./members-table";
import { RewardSettings, RewardsCatalog } from "./rewards-catalog";

export const metadata: Metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const { supabase } = await requireAdmin();

  const [settings, rewards, products, members] = await Promise.all([
    supabase.from("settings").select("rewards_enabled, points_per_dollar").eq("id", 1).single(),
    supabase.from("rewards").select("id, points_cost, active, products(name, emoji, price_cents)").order("points_cost"),
    supabase.from("products").select("id, name, emoji, price_cents").eq("archived", false).order("name"),
    supabase.rpc("members_list"),
  ]);
  if (settings.error) throw new Error(settings.error.message);

  return (
    <>
      <PageHeader
        title="Rewards"
        description="Students who sign in earn points on online orders when they're picked up, and spend them on free items at checkout."
      />
      <div className="grid gap-8">
        <RewardSettings enabled={settings.data.rewards_enabled} pointsPerDollar={settings.data.points_per_dollar} />
        <RewardsCatalog
          rewards={(rewards.data ?? []).map((r) => ({
            id: r.id,
            points_cost: r.points_cost,
            active: r.active,
            name: r.products?.name ?? "?",
            emoji: r.products?.emoji ?? null,
            price_cents: r.products?.price_cents ?? 0,
          }))}
          products={products.data ?? []}
          pointsPerDollar={settings.data.points_per_dollar}
        />
        <MembersTable members={members.data ?? []} />
      </div>
    </>
  );
}
