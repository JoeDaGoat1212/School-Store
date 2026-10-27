"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCents } from "@/lib/format";
import { addReward, deleteReward, saveRewardSettings, updateReward, type RewardResult } from "./actions";

function report(r: RewardResult) {
  if (r.ok) toast.success(r.message);
  else toast.error(r.message);
}

/** On/off and points per $1. */
export function RewardSettings({ enabled, pointsPerDollar }: { enabled: boolean; pointsPerDollar: number }) {
  const [on, setOn] = useState(enabled);
  const [rate, setRate] = useState(String(pointsPerDollar));
  const [saving, start] = useTransition();

  return (
    <section aria-labelledby="rw-settings" className="rounded-2xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 id="rw-settings" className="font-heading text-lg font-semibold">
          How points work
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Example: at {Number(rate) || 0} points per $1, a $2.50 order earns {Math.floor(2.5 * (Number(rate) || 0))} points.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-6 px-5 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => report(await saveRewardSettings(on, Number(rate))));
        }}
      >
        <div className="flex items-center gap-3">
          <Switch id="rewards-on" checked={on} onCheckedChange={setOn} />
          <Label htmlFor="rewards-on">Rewards are {on ? "on" : "off"}</Label>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rate">Points per $1</Label>
          <Input id="rate" type="number" min={1} max={100} value={rate} onChange={(e) => setRate(e.target.value)} className="h-10 w-28" />
        </div>
        <Button type="submit" disabled={saving} className="ml-auto">
          {saving && <Loader2Icon className="animate-spin" />}
          Save
        </Button>
      </form>
      {!on && (
        <p className="border-t px-5 py-3 text-sm text-muted-foreground">
          While rewards are off, students can still sign in, but nobody earns points and rewards are hidden.
        </p>
      )}
    </section>
  );
}

type RewardRow = { id: string; points_cost: number; active: boolean; name: string; emoji: string | null; price_cents: number };

/** The list of free items points can buy. */
export function RewardsCatalog({
  rewards,
  products,
  pointsPerDollar,
}: {
  rewards: RewardRow[];
  products: { id: string; name: string; emoji: string | null; price_cents: number }[];
  pointsPerDollar: number;
}) {
  const [productId, setProductId] = useState("");
  const [points, setPoints] = useState("");
  const [adding, startAdd] = useTransition();

  return (
    <section aria-labelledby="rw-catalog" className="rounded-2xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 id="rw-catalog" className="font-heading text-lg font-semibold">
          Rewards students can get
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Each one is a free item. A student needs to spend about ${(Number(points) || 150) / pointsPerDollar} to earn{" "}
          {Number(points) || 150} points.
        </p>
      </div>

      {rewards.length > 0 && (
        <ul className="divide-y">
          {rewards.map((r) => (
            <RewardItem key={r.id} reward={r} pointsPerDollar={pointsPerDollar} />
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-3 border-t bg-muted/30 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          startAdd(async () => {
            const r = await addReward(productId, Number(points));
            report(r);
            if (r.ok) {
              setProductId("");
              setPoints("");
            }
          });
        }}
      >
        <div className="grid min-w-56 flex-1 gap-2">
          <Label htmlFor="new-reward-product">Free item</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger id="new-reward-product" className="h-10 w-full">
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.emoji} {p.name} ({formatCents(p.price_cents)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-reward-points">Points</Label>
          <Input id="new-reward-points" type="number" min={1} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="150" className="h-10 w-28" />
        </div>
        <Button type="submit" disabled={adding}>
          {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Add reward
        </Button>
      </form>
    </section>
  );
}

function RewardItem({ reward, pointsPerDollar }: { reward: RewardRow; pointsPerDollar: number }) {
  const [points, setPoints] = useState(String(reward.points_cost));
  const [pending, start] = useTransition();
  const changed = Number(points) !== reward.points_cost;
  // What the student spent to earn it, compared with what the item costs.
  const spendToEarn = reward.points_cost / pointsPerDollar;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <span className="text-2xl" aria-hidden>
        {reward.emoji || "🎁"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Free {reward.name}</span>
        <span className="block text-xs text-muted-foreground">
          Worth {formatCents(reward.price_cents)}. Earned after about ${spendToEarn.toFixed(2)} of orders.
        </span>
      </span>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => report(await updateReward(reward.id, { points_cost: Number(points) })));
        }}
      >
        <Input
          type="number"
          min={1}
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          aria-label={`Points for free ${reward.name}`}
          className="h-9 w-24"
        />
        <span className="text-sm text-muted-foreground">pts</span>
        {changed && (
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
        )}
      </form>
      <Switch
        checked={reward.active}
        disabled={pending}
        aria-label={`Offer free ${reward.name}`}
        onCheckedChange={(on) => start(async () => report(await updateReward(reward.id, { active: on })))}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove free ${reward.name}`}
        disabled={pending}
        onClick={() => start(async () => report(await deleteReward(reward.id)))}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}
