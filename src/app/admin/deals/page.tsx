import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GiftIcon, PackageIcon, PercentIcon, StarIcon, TagIcon, UtensilsCrossedIcon } from "lucide-react";
import { FlashToast } from "@/components/flash-toast";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { Pill, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatCents, formatDay, storeToday } from "@/lib/format";

export const metadata: Metadata = { title: "Deals" };

/** Running, coming up, over, or switched off — worked out from the dates. */
function dealStatus(active: boolean, starts: string | null, ends: string | null, today: string): { label: string; tone: Tone } {
  if (!active) return { label: "Off", tone: "neutral" };
  if (starts && today < starts) return { label: `Starts ${formatDay(starts)}`, tone: "info" };
  if (ends && today > ends) return { label: "Ended", tone: "neutral" };
  return { label: "Running", tone: "success" };
}

function dates(starts: string | null, ends: string | null) {
  if (!starts && !ends) return "Always";
  if (starts && ends && starts === ends) return formatDay(starts);
  return `${starts ? formatDay(starts) : "Now"} to ${ends ? formatDay(ends) : "no end"}`;
}

export default async function DealsPage() {
  const { supabase } = await requireAdmin();
  const today = storeToday();

  const [promos, bundles] = await Promise.all([
    supabase
      .from("promotions")
      .select("id, kind, title, category, sale_price_cents, buy_qty, get_qty, starts_on, ends_on, members_only, featured, active, combo_slots, products(name, price_cents)")
      .order("ends_on", { ascending: false }),
    supabase
      .from("bundles")
      .select("id, name, price_cents, starts_on, ends_on, members_only, active, bundle_items(quantity, products(name, price_cents))")
      .order("created_at", { ascending: false }),
  ]);
  if (promos.error) throw new Error(promos.error.message);
  if (bundles.error) throw new Error(bundles.error.message);

  return (
    <>
      <Suspense>
        <FlashToast param="saved" text="Saved {value}" />
      </Suspense>
      <PageHeader
        title="Deals"
        description="Sales, buy-X-get-Y deals and bundles. Students see them on the menu while they're running, and checkout applies them automatically."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/deals/edit?kind=sale">
                <TagIcon /> New sale
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/deals/edit?kind=combo">
                <UtensilsCrossedIcon /> New combo
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/deals/edit?kind=buy_get">
                <PercentIcon /> New buy X, get Y
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/deals/edit?kind=bundle">
                <GiftIcon /> New bundle
              </Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="sales-title" className="mb-10">
        <h2 id="sales-title" className="mb-3 font-heading text-xl font-semibold">
          Sales and deals
        </h2>
        {promos.data.length === 0 ? (
          <EmptyState icon={TagIcon} title="No deals yet">
            Put something on sale for a day, or make a deal like &ldquo;buy 2 drinks, get 1 free&rdquo;.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-soft">
            {promos.data.map((p) => {
              const status = dealStatus(p.active, p.starts_on, p.ends_on, today);
              const what =
                p.kind === "combo"
                  ? `Combo for ${formatCents(p.sale_price_cents ?? 0)}: ${((p.combo_slots ?? []) as { label: string; quantity: number }[])
                      .map((s) => `${s.quantity > 1 ? `${s.quantity} ` : ""}${s.label.toLowerCase()}`)
                      .join(" + ")}`
                  : p.kind === "sale"
                  ? `${p.products?.name}: ${formatCents(p.sale_price_cents!)} (normally ${formatCents(p.products?.price_cents ?? 0)})`
                  : `Buy ${p.buy_qty}, get ${p.get_qty} free on ${p.products?.name ?? `any ${p.category}`}`;
              return (
                <li key={p.id}>
                  <Link
                    href={`/admin/deals/edit?kind=${p.kind}&id=${p.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {p.title}
                        {p.featured && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-ember-ink">
                            <StarIcon className="size-3.5 fill-current" /> Deal of the day
                          </span>
                        )}
                      </span>
                      <span className="block text-sm text-muted-foreground">{what}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">{dates(p.starts_on, p.ends_on)}</span>
                    {p.members_only && <Pill tone="info">Members</Pill>}
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="bundles-title">
        <h2 id="bundles-title" className="mb-3 font-heading text-xl font-semibold">
          Bundles
        </h2>
        {bundles.data.length === 0 ? (
          <EmptyState icon={PackageIcon} title="No bundles yet">
            Sell a few things together for one price, like a bag of chips and a drink for $3.00.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-soft">
            {bundles.data.map((b) => {
              const status = dealStatus(b.active, b.starts_on, b.ends_on, today);
              const regular = b.bundle_items.reduce((n, i) => n + i.quantity * (i.products?.price_cents ?? 0), 0);
              const contents = b.bundle_items
                .map((i) => `${i.quantity > 1 ? `${i.quantity} ` : ""}${i.products?.name ?? "?"}`)
                .join(" + ");
              return (
                <li key={b.id}>
                  <Link
                    href={`/admin/deals/edit?kind=bundle&id=${b.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {b.name}
                        <span className="ml-2 font-heading tabular-nums">{formatCents(b.price_cents)}</span>
                        {regular > b.price_cents && (
                          <span className="ml-2 text-sm font-normal text-success">saves {formatCents(regular - b.price_cents)}</span>
                        )}
                      </span>
                      <span className="block text-sm text-muted-foreground">{contents}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">{dates(b.starts_on, b.ends_on)}</span>
                    {b.members_only && <Pill tone="info">Members</Pill>}
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
