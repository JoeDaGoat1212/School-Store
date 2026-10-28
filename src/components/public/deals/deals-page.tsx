"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { BoxIcon, GiftIcon, LockIcon, PackageIcon, ScissorsIcon, SparklesIcon, TagIcon, TimerIcon, UtensilsCrossedIcon } from "lucide-react";
import { buyGetLabel, type Bundle, type Combo, type Promotion, type ShownPrice } from "@/lib/deals";
import { formatCents, formatDay, relativeDay } from "@/lib/format";
import type { Reward } from "@/lib/member";
import { productRenderUrl } from "@/lib/product-renders";
import type { MenuItem } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { BundleCard } from "../bundle-card";
import { ComboCard } from "../combo-card";
import { CartBar } from "../cart-bar";
import { useCart } from "../cart-store";
import { FeaturedDeal } from "../featured-deal";
import { ProductCard } from "../product-card";

type Priced = { item: MenuItem; shown: ShownPrice };

/*
 * The Deals page: everything that saves money this week, in one place.
 *
 *   1. the deal of the day (the one staff marked as featured),
 *   2. bundles,
 *   3. products on sale,
 *   4. coupons (buy X, get Y free; they come off in the cart by themselves),
 *   5. member deals (locked for guests, with a way to sign up),
 *   6. rewards you can spend points on.
 *
 * Deals and bundles are set up by staff in Admin → Deals.
 */
export function DealsPage({
  priced,
  promotions,
  bundles,
  combos,
  rewards,
  isMember,
  signedIn,
  maxPerOrder,
  today,
  pointsPerDollar,
  rewardsEnabled,
}: {
  priced: Priced[];
  promotions: Promotion[];
  bundles: Bundle[];
  combos: Combo[];
  rewards: Reward[];
  isMember: boolean;
  signedIn: boolean;
  maxPerOrder: number;
  today: string;
  pointsPerDollar: number;
  rewardsEnabled: boolean;
}) {
  const router = useRouter();
  const cartItems = useCart();
  const inCart = (id: string) => cartItems.find((c) => c.id === id)?.quantity ?? 0;

  const featured = promotions.find((p) => p.featured);
  const onSale = priced.filter((p) => p.shown.regular !== null).sort(byStock);
  const memberOnly = isMember ? [] : priced.filter((p) => p.shown.memberPrice !== null && p.shown.regular === null).sort(byStock);
  const coupons = promotions.filter((p) => p.kind === "buy_get" && (isMember || !p.members_only));
  const lockedCoupons = isMember ? [] : promotions.filter((p) => p.kind === "buy_get" && p.members_only);
  const lockedBundles = bundles.filter((b) => b.members_only && !isMember).length;
  const count = bundles.length + onSale.length + coupons.length + combos.length;
  const nothing = count === 0 && memberOnly.length === 0 && lockedCoupons.length === 0;

  // When the soonest deal ends (for the "Ends …" chip at the top).
  const ends = [...promotions.map((p) => p.ends_on), ...bundles.map((b) => b.ends_on).filter((d): d is string => Boolean(d))].sort()[0];

  let n = 0; // position on the page, for the cards dealing in one after another
  const deal = (i = n++) => ({ "--i": Math.min(i, 12) }) as CSSProperties;

  return (
    <>
      {/* ---- Top band ---- */}
      <section className="relative -mt-6 mb-10 ml-[calc(50%-50vw)] w-screen overflow-hidden bg-[#ffd21f] text-black">
        <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_28px,rgb(0_0_0/0.05)_28px_56px)]" />
        <div className="relative mx-auto flex max-w-5xl flex-col gap-5 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:py-14">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold tracking-[0.2em] uppercase">
              <TagIcon className="size-4" /> This week at the store
            </p>
            <h1 className="mt-2 font-heading text-[clamp(3.4rem,11vw,7rem)] leading-[0.85] font-extrabold uppercase">
              Deals &amp;
              <br />
              bundles
            </h1>
          </div>
          <ul className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
            {combos.length > 0 && <Chip icon={UtensilsCrossedIcon} text={`${combos.length} combo${combos.length === 1 ? "" : "s"}`} />}
            <Chip icon={PackageIcon} text={`${bundles.length} bundle${bundles.length === 1 ? "" : "s"}`} />
            <Chip icon={TagIcon} text={`${onSale.length} on sale`} />
            <Chip icon={ScissorsIcon} text={`${coupons.length} coupon${coupons.length === 1 ? "" : "s"}`} />
            {ends && <Chip icon={TimerIcon} text={`A deal ends ${endsWhen(ends, today)}`} dark />}
          </ul>
        </div>
      </section>

      {nothing && (
        <div className="rounded-3xl border-2 border-dashed px-6 py-16 text-center">
          <p className="font-heading text-3xl font-extrabold">No deals this week</p>
          <p className="mt-1 text-muted-foreground">New ones go up all the time. Check back soon.</p>
          <Link href="/#shop" className="mt-5 inline-flex h-11 items-center rounded-full bg-black px-6 font-semibold text-white">
            Shop everything
          </Link>
        </div>
      )}

      {/* ---- Deal of the day ---- */}
      {featured && (
        <FeaturedDeal
          promo={featured}
          menu={priced}
          isMember={isMember}
          maxPerOrder={maxPerOrder}
          inCart={inCart}
          onShowCategory={(c) => router.push(`/#shop-${encodeURIComponent(c)}`)}
        />
      )}

      {/* ---- Combos ---- */}
      {combos.length > 0 && (
        <Section id="combos" icon={UtensilsCrossedIcon} title="Combos" blurb="Pick what you want in it. The combo price comes off in your cart.">
          <div className="grid gap-5 md:grid-cols-2">
            {combos.map((c) => (
              <ComboCard key={c.id} combo={c} isMember={isMember} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- Bundles ---- */}
      {bundles.length > 0 && (
        <Section id="bundles" icon={PackageIcon} title="Bundles" blurb="A few favorites together, for less than buying them one by one.">
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {bundles.map((b) => (
              <div key={b.id} className="deal-in" style={deal()}>
                <BundleCard bundle={b} inCart={inCart(b.id)} isMember={isMember} maxPerOrder={maxPerOrder} />
              </div>
            ))}
          </div>
          {lockedBundles > 0 && <MemberNudge signedIn={signedIn} text={`${lockedBundles} of these ${lockedBundles === 1 ? "is" : "are"} for rewards members.`} />}
        </Section>
      )}

      {/* ---- On sale ---- */}
      {onSale.length > 0 && (
        <Section id="sale" icon={TagIcon} title="On sale" blurb="Lower prices for a few days only.">
          <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
            {onSale.map(({ item, shown }) => (
              <div key={item.id} className="deal-in" style={deal()}>
                <ProductCard item={item} shown={shown} inCart={inCart(item.id)} maxPerOrder={maxPerOrder} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ---- Coupons ---- */}
      {coupons.length > 0 && (
        <Section id="coupons" icon={ScissorsIcon} title="Coupons" blurb="No code needed: they come off in your cart by themselves.">
          <div className="grid gap-4 md:grid-cols-2">
            {coupons.map((c) => (
              <Coupon key={c.id} promo={c} items={priced.filter((p) => p.shown.buyGets.some((b) => b.id === c.id))} today={today} />
            ))}
          </div>
        </Section>
      )}

      {/* ---- Member deals (for guests) ---- */}
      {(memberOnly.length > 0 || lockedCoupons.length > 0) && (
        <Section id="members" icon={LockIcon} title="Member deals" blurb="Rewards members pay less on these. It's free to join.">
          <div className="rounded-3xl bg-black p-5 text-white sm:p-7">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {memberOnly.slice(0, 8).map(({ item, shown }) => (
                <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-white/8 p-3">
                  <Thumb name={item.name} emoji={item.emoji} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="text-sm">
                      <span className="font-heading text-lg font-extrabold text-primary">{formatCents(shown.memberPrice)}</span>
                      <span className="ml-1.5 text-white/50 line-through">{formatCents(shown.price)}</span>
                    </p>
                  </div>
                </li>
              ))}
              {lockedCoupons.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/30 p-3">
                  <ScissorsIcon className="size-5 shrink-0 text-primary" />
                  <p className="text-sm font-semibold">
                    {buyGetLabel(c)} <span className="block text-xs font-normal text-white/60">{c.title}</span>
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href={signedIn ? "/account" : "/account?mode=signup"}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-black transition-transform hover:-translate-y-0.5"
              >
                <LockIcon className="size-4" /> {signedIn ? "Finish your rewards account" : "Sign up free to unlock"}
              </Link>
              {!signedIn && (
                <Link href="/account" className="text-sm font-semibold text-white/80 underline-offset-4 hover:underline">
                  Already a member? Sign in
                </Link>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ---- Rewards ---- */}
      {rewardsEnabled && rewards.length > 0 && (
        <Section id="rewards" icon={GiftIcon} title="Spend your points" blurb={`Earn ${pointsPerDollar} point${pointsPerDollar === 1 ? "" : "s"} for every dollar, then trade them for these at checkout.`}>
          <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {rewards.map((r) => (
              <li key={r.id} className="flex w-40 shrink-0 flex-col items-center rounded-2xl border bg-card p-3 text-center shadow-soft">
                <Thumb name={r.name} emoji={r.emoji} big />
                <p className="mt-2 line-clamp-2 text-sm font-semibold">{r.name}</p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-bold text-ember-ink">
                  <SparklesIcon className="size-3.5" /> {r.points_cost} pts
                </p>
              </li>
            ))}
          </ul>
          {!isMember && <MemberNudge signedIn={signedIn} text="Points are for rewards members." />}
        </Section>
      )}

      {/* ---- Way out ---- */}
      <section className="mt-16 flex flex-col items-start gap-4 rounded-3xl bg-muted p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="font-heading text-3xl leading-none font-extrabold uppercase">Want something else?</p>
          <p className="mt-1 text-muted-foreground">Coupons still count on everything in the shop and the 3D store.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/#shop" className="inline-flex h-11 items-center rounded-full bg-black px-5 font-semibold text-white">
            Shop everything
          </Link>
          <Link href="/store" className="enter-3d inline-flex h-11 items-center gap-2 rounded-full px-5 font-semibold text-white">
            <BoxIcon className="size-4" /> Enter 3D world
          </Link>
        </div>
      </section>

      <CartBar />
    </>
  );
}

/** "today", "tomorrow" or "Sat, Oct 31". */
function endsWhen(iso: string, today: string) {
  const day = relativeDay(iso, today);
  return day === "Today" || day === "Tomorrow" ? day.toLowerCase() : formatDay(iso);
}

/** In-stock things first. */
const byStock = (a: Priced, b: Priced) => Number(a.item.available <= 0) - Number(b.item.available <= 0);

function Chip({ icon: Icon, text, dark = false }: { icon: typeof TagIcon; text: string; dark?: boolean }) {
  return (
    <li className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold", dark ? "bg-black text-white" : "bg-white/70")}>
      <Icon className="size-4" /> {text}
    </li>
  );
}

function Section({ id, icon: Icon, title, blurb, children }: { id: string; icon: typeof TagIcon; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-14 scroll-mt-20 first-of-type:mt-0">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id={`${id}-title`} className="flex items-center gap-2.5 font-heading text-4xl leading-none font-extrabold uppercase sm:text-5xl">
            <Icon className="size-7 text-primary sm:size-8" /> {title}
          </h2>
          <p className="mt-1.5 text-muted-foreground">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** A product's 3D picture (or its emoji), small. */
function Thumb({ name, emoji, big = false }: { name: string; emoji: string | null; big?: boolean }) {
  const src = productRenderUrl(name);
  const size = big ? "size-24" : "size-12";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={cn(size, "shrink-0 object-contain")} />
  ) : (
    <span aria-hidden className={cn(size, "grid shrink-0 place-items-center", big ? "text-5xl" : "text-3xl")}>
      {emoji || "🛍️"}
    </span>
  );
}

/** "Buy 2, get 1 free" as a paper coupon: what it's on, when it ends, and a few of the things it counts on. */
function Coupon({ promo, items, today }: { promo: Promotion; items: Priced[]; today: string }) {
  const on = promo.product_id ? (items[0]?.item.name ?? "one product") : `any ${promo.category}`;
  const pics = items.filter((p) => productRenderUrl(p.item.name)).slice(0, 4);
  return (
    <article className="deal-in relative overflow-hidden rounded-3xl border-2 border-dashed border-foreground/60 bg-card p-5 shadow-soft">
      {/* The cut-out notches on each side of a paper coupon */}
      <span aria-hidden className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full border-2 border-dashed border-foreground/60 bg-background" />
      <span aria-hidden className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full border-2 border-dashed border-foreground/60 bg-background" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-widest text-ember-ink uppercase">{promo.title}</p>
          <p className="mt-1 font-heading text-4xl leading-none font-extrabold uppercase">
            Buy {promo.buy_qty}, get {promo.get_qty} free
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            On {on}. Ends {endsWhen(promo.ends_on, today)}.
          </p>
        </div>
        <ScissorsIcon className="size-6 shrink-0 -rotate-90 text-muted-foreground" />
      </div>
      {pics.length > 0 && (
        <div aria-hidden className="mt-4 flex h-20 items-end gap-2 overflow-hidden">
          {pics.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.item.id} src={productRenderUrl(p.item.name)!} alt="" loading="lazy" className="h-full w-auto object-contain drop-shadow-md" />
          ))}
        </div>
      )}
      <Link
        href={promo.category ? `/#shop-${encodeURIComponent(promo.category)}` : "/#shop"}
        className="mt-4 inline-flex h-10 items-center rounded-full bg-black px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
      >
        Shop {promo.category ? promo.category.toLowerCase() : "now"}
      </Link>
    </article>
  );
}

function MemberNudge({ signedIn, text }: { signedIn: boolean; text: string }) {
  return (
    <p className="mt-5 flex flex-wrap items-center gap-2 text-sm">
      <LockIcon className="size-4 text-ember-ink" /> {text}
      <Link href={signedIn ? "/account" : "/account?mode=signup"} className="font-semibold text-ember-ink underline-offset-4 hover:underline">
        {signedIn ? "Finish your account" : "Sign up free"}
      </Link>
    </p>
  );
}
