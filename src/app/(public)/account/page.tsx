import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckIcon, LogOutIcon } from "lucide-react";
import { FlameMark } from "@/components/brand-mark";
import { MemberCard } from "@/components/public/member-card";
import { ProductArt } from "@/components/product-art";
import { Button } from "@/components/ui/button";
import { brand, formatOrderNumber } from "@/config/brand";
import { formatCents, formatDay, storeToday } from "@/lib/format";
import { getAccount, getRewards, type PointsEntry, type Reward } from "@/lib/member";
import { ORDER_STATUS, type OrderStatus } from "@/lib/order-status";
import { loadStorefront } from "@/lib/store-data";
import { cn } from "@/lib/utils";
import { signOut } from "./actions";
import { DeleteAccountButton } from "./delete-account-button";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "My rewards" };

export default async function AccountPage(props: PageProps<"/account">) {
  const { next, mode, password } = await props.searchParams;
  const returnTo = typeof next === "string" ? next : "/account";
  // Just signed in with an emailed code ("forgot password"): ask for a new password first.
  const needsPassword = password === "new";
  const [account, rewards, { info }] = await Promise.all([getAccount(), getRewards(), loadStorefront()]);
  const perDollar = info.points_per_dollar ?? 10;

  // ---- Not signed in -----------------------------------------------------------
  if (!account) {
    return (
      <div className="mx-auto grid max-w-md gap-8">
        <div>
          <h1 className="font-heading text-5xl leading-[0.95] font-extrabold">{brand.name} rewards</h1>
          <p className="mt-3 text-muted-foreground">
            Earn {perDollar} points for every $1 you spend on online orders, then trade them for free snacks. Signing in
            also fills in your name at checkout.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <SignInForm next={returnTo} startOn={mode === "signup" ? "signup" : "signin"} />
        </div>
        {rewards.length > 0 && <RewardList rewards={rewards} balance={0} title="What you can earn" />}
      </div>
    );
  }

  // ---- The staff login, signed in on the student side ----------------------------
  if (account.staff) {
    return (
      <div className="mx-auto grid max-w-md gap-4 py-10 text-center">
        <h1 className="font-heading text-4xl font-extrabold">You&apos;re signed in as staff</h1>
        <p className="text-muted-foreground">The staff login can&apos;t collect rewards. Members sign in with their own email.</p>
        <div className="flex justify-center gap-2">
          <Button asChild>
            <Link href="/admin">Go to the dashboard</Link>
          </Button>
          <form action={signOut}>
            <Button variant="outline" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ---- A teacher account: their page is /teacher ---------------------------------
  if (account.teacher && !account.profile) redirect(needsPassword ? "/teacher?password=new" : "/teacher");

  // ---- Signed in for the first time: name, grade and username ---------------------
  if (!account.profile) {
    // The username they picked when they signed up.
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const meta = (data?.claims?.user_metadata ?? {}) as { username?: string };
    return (
      <div className="mx-auto grid max-w-md gap-6">
        <div>
          <FlameMark size={48} />
          <h1 className="mt-3 font-heading text-5xl leading-[0.95] font-extrabold">Almost done</h1>
          <p className="mt-3 text-muted-foreground">
            Tell us who you are. We&apos;ll use this to fill in your orders, and staff use it to hand them out.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          {needsPassword && (
            <div className="mb-6 border-b pb-6">
              <PasswordForm label="Pick a password" button="Save password" />
            </div>
          )}
          <ProfileForm next={returnTo} initial={{ first_name: "", last_name: "", grade: "", username: meta.username ?? "" }} />
        </div>
        <SignOutLink email={account.email} />
      </div>
    );
  }

  // ---- A member ----------------------------------------------------------------
  const p = account.profile;
  return (
    <div className="mx-auto grid max-w-2xl gap-10">
      {/* Accounts from before passwords, or just back from "forgot password" */}
      {(needsPassword || !p.username) && (
        <section className="rounded-2xl border-2 border-primary/60 bg-card p-5 sm:p-6">
          <h2 className="font-heading text-3xl font-extrabold">{p.username ? "Pick a new password" : "Finish your account"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.username
              ? `You're signed in as ${p.username}. Set a new password so you can sign in with it next time.`
              : "Pick a username and a password, so you can sign back in any time."}
          </p>
          {!p.username && (
            <div className="mt-4">
              <ProfileForm next="/account?password=new" initial={{ ...p, username: "" }} saveLabel="Save username" />
            </div>
          )}
          {p.username && (
            <div className="mt-4">
              <PasswordForm />
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4">
        <MemberCard name={`${p.first_name} ${p.last_name}`} balance={account.balance} since={p.created_at} />
        <p className="text-sm text-muted-foreground">
          You earn {perDollar} points for every $1 when you pick up an online order. Use them at checkout.
        </p>
      </div>

      {rewards.length > 0 && <RewardList rewards={rewards} balance={account.balance} title="Rewards" />}

      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="font-heading text-3xl font-extrabold">
          Your orders
        </h2>
        {account.orders.length === 0 ? (
          <p className="mt-3 text-muted-foreground">
            No orders yet.{" "}
            <Link href="/" className="font-semibold text-ember-ink underline-offset-4 hover:underline">
              Browse the menu
            </Link>
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-2xl border bg-card">
            {account.orders.map((o) => (
              <li key={o.order_number}>
                <Link
                  href={`/order/${o.order_number}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="font-heading text-2xl font-extrabold tabular-nums">{formatOrderNumber(o.order_number)}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{ORDER_STATUS[o.status as OrderStatus]?.studentLabel ?? o.status}</span>
                    <span className="block text-muted-foreground">{formatDay(o.pickup_date)}</span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block font-semibold tabular-nums">{formatCents(o.total_cents)}</span>
                    {o.points_earned > 0 && (
                      <span className={cn("block tabular-nums", o.status === "picked_up" ? "text-teal-ink" : "text-muted-foreground")}>
                        {o.status === "picked_up" ? "+" : ""}
                        {o.points_earned} pts
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {account.history.length > 0 && (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="font-heading text-3xl font-extrabold">
            Points history
          </h2>
          <ul className="mt-3 grid gap-0.5">
            {account.history.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-b-0">
                <span>
                  <span className="font-medium">{historyLabel(e)}</span>
                  <span className="ml-2 text-muted-foreground">{formatDay(storeToday(new Date(e.created_at)))}</span>
                </span>
                <span
                  className={cn(
                    "font-heading text-xl font-extrabold tabular-nums",
                    e.change > 0 ? "text-teal-ink" : "text-muted-foreground",
                  )}
                >
                  {e.change > 0 ? "+" : "−"}
                  {Math.abs(e.change)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="login-title" className="grid gap-3">
        <h2 id="login-title" className="font-heading text-3xl font-extrabold">
          Sign-in details
        </h2>
        <p className="text-sm text-muted-foreground">
          Username: <strong className="font-semibold text-foreground">{p.username ?? "not set yet"}</strong> · Email:{" "}
          <strong className="font-semibold text-foreground">{account.email}</strong>
        </p>
        <div className="max-w-sm">
          <PasswordForm label="Change password" button="Change password" />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <SignOutLink email={account.email} />
        <DeleteAccountButton />
      </section>
    </div>
  );
}

function SignOutLink({ email }: { email: string }) {
  return (
    <form action={signOut} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>Signed in as {email}</span>
      <Button type="submit" variant="outline" size="sm">
        <LogOutIcon /> Sign out
      </Button>
    </form>
  );
}

/** Each reward with how close you are to it. */
function RewardList({ rewards, balance, title }: { rewards: Reward[]; balance: number; title: string }) {
  return (
    <section aria-labelledby="rewards-title">
      <h2 id="rewards-title" className="font-heading text-3xl font-extrabold">
        {title}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {rewards.map((r) => {
          const ready = balance >= r.points_cost;
          const pct = Math.min(100, Math.round((balance / r.points_cost) * 100));
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
              <ProductArt
                name={r.name}
                photoPath={r.photo_path}
                emoji={r.emoji}
                category={r.category}
                className="size-16 shrink-0 rounded-xl"
                emojiClassName="text-3xl"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">Free {r.name}</p>
                <p className="font-heading text-xl leading-tight font-extrabold tabular-nums">{r.points_cost} points</p>
                {ready ? (
                  <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-teal-ink">
                    <CheckIcon className="size-4" /> Ready to use at checkout
                  </p>
                ) : (
                  <div className="mt-1.5">
                    <div
                      role="progressbar"
                      aria-label={`Progress toward free ${r.name}`}
                      aria-valuenow={balance}
                      aria-valuemin={0}
                      aria-valuemax={r.points_cost}
                      className="h-2 overflow-hidden rounded-full bg-muted"
                    >
                      <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.points_cost - balance} more points</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function historyLabel(e: PointsEntry) {
  const order = e.order_number ? ` ${formatOrderNumber(e.order_number)}` : "";
  switch (e.reason) {
    case "earned":
      return `Order${order} picked up`;
    case "earned_undo":
      return `Order${order} pickup undone`;
    case "redeemed":
      return `Reward used on${order || " an order"}`;
    case "refunded":
      return `Points back, order${order} not picked up`;
    case "adjusted":
      return e.note ? `From the store: ${e.note}` : "Changed by the store";
  }
}
