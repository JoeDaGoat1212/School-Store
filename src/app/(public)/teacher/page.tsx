import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon, BellRingIcon, ClockIcon, LogOutIcon, ReceiptTextIcon } from "lucide-react";
import { RoomServiceBanner } from "@/components/public/teacher/room-service-banner";
import { TeacherShop } from "@/components/public/teacher/teacher-shop";
import { TeacherDetailsForm, TeacherSignIn } from "@/components/public/teacher/teacher-sign-in";
import { Button } from "@/components/ui/button";
import { formatOrderNumber } from "@/config/brand";
import { formatCents, formatDay } from "@/lib/format";
import { getAccount, getTeacherPrices, isTeacher } from "@/lib/member";
import { ORDER_STATUS, type OrderStatus } from "@/lib/order-status";
import { loadStorefront } from "@/lib/store-data";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../account/actions";
import { PasswordForm } from "../account/password-form";

export const metadata: Metadata = { title: "Teachers · Room service" };

/** Snacks shown under the cloche's lid. */
const CLOCHE_PICKS = ["Chips", "Coke", "Twix", "Doritos Nacho Cheese", "Snickers", "Sprite"];

/**
 * The teacher page. Signed out: room service sign + sign in / request an
 * account. Waiting: "request sent". Approved: room service sign, every
 * product at teacher price, and their recent orders.
 */
export default async function TeacherPage(props: PageProps<"/teacher">) {
  const { password } = await props.searchParams;
  const [{ menu, info }, account] = await Promise.all([loadStorefront(), getAccount()]);
  const roomService = info.room_service_enabled ?? true;
  const names = new Set(menu.filter((m) => m.available > 0).map((m) => m.name));
  const picks = [...CLOCHE_PICKS.filter((n) => names.has(n)), ...menu.map((m) => m.name)];

  // ---- Not signed in ---------------------------------------------------------------
  if (!account) {
    return (
      <>
        <RoomServiceBanner enabled={roomService} picks={picks}>
          <a href="#teacher-sign-in" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ffc45c] px-6 font-semibold text-[#14110f] transition-transform hover:-translate-y-0.5">
            Sign in to order <ArrowDownIcon className="size-4" />
          </a>
        </RoomServiceBanner>
        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[1fr_1.1fr] md:items-start">
          <div>
            <h2 className="font-heading text-5xl leading-[0.95] font-extrabold uppercase">Teachers get the inside price</h2>
            <ul className="mt-5 grid gap-3 text-muted-foreground">
              <Perk icon={ReceiptTextIcon} title="Cost + 50¢" text="Every snack and drink at what the store paid, plus 50 cents." />
              <Perk icon={BellRingIcon} title="Room service" text="A student brings your order to your room. No leaving class." />
              <Perk icon={ClockIcon} title="You pick the hour" text="Choose the class hour, today or the next school day." />
            </ul>
          </div>
          <div id="teacher-sign-in" className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
            <TeacherSignIn />
          </div>
        </div>
      </>
    );
  }

  // ---- The staff login ----------------------------------------------------------------
  if (account.staff) {
    return (
      <div className="mx-auto grid max-w-md gap-4 py-10 text-center">
        <h1 className="font-heading text-4xl font-extrabold">You&apos;re signed in as staff</h1>
        <p className="text-muted-foreground">Approve teacher accounts in the dashboard.</p>
        <Button asChild>
          <Link href="/admin/teachers">Go to Teachers</Link>
        </Button>
      </div>
    );
  }

  const teacher = account.teacher;

  // ---- Signed in, but hasn't asked for teacher access -----------------------------------
  if (!teacher) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const meta = (data?.claims?.user_metadata ?? {}) as Record<string, string>;
    return (
      <div className="mx-auto grid max-w-md gap-6">
        <div>
          <h1 className="font-heading text-5xl leading-[0.95] font-extrabold">Are you a teacher?</h1>
          <p className="mt-3 text-muted-foreground">
            Send a request with your name and room. Store staff check it, then teacher prices and room service turn on.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft sm:p-6">
          <TeacherDetailsForm
            initial={{
              first_name: meta.first_name ?? account.profile?.first_name ?? "",
              last_name: meta.last_name ?? account.profile?.last_name ?? "",
              room: meta.room ?? "",
            }}
          />
        </div>
        <SignOut email={account.email} />
      </div>
    );
  }

  // ---- Waiting for approval, or turned off ----------------------------------------------
  if (!isTeacher(account)) {
    const removed = teacher.status === "removed";
    return (
      <div className="mx-auto grid max-w-md gap-6">
        {/* A little paper ticket */}
        <div className="relative rounded-2xl border-2 border-dashed bg-card p-6 text-center shadow-soft">
          <p className="text-xs font-bold tracking-[0.2em] text-muted-foreground uppercase">{removed ? "Teacher access" : "Request sent"}</p>
          <p className="mt-2 font-heading text-4xl leading-none font-extrabold uppercase">{removed ? "Turned off" : "Waiting for a thumbs up"}</p>
          <p className="mt-3 text-muted-foreground">
            {removed
              ? "Your teacher access was turned off. If that's a mistake, stop by the store window."
              : `Thanks, ${teacher.first_name}! Store staff will approve you soon. Then this page shows teacher prices and room service to Room ${teacher.room}.`}
          </p>
        </div>
        {needsPassword(password) && (
          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <PasswordForm label="Pick a new password" />
          </div>
        )}
        {!removed && (
          <details className="rounded-2xl border bg-card p-5 shadow-soft">
            <summary className="cursor-pointer font-semibold">Change your name or room</summary>
            <div className="mt-4">
              <TeacherDetailsForm initial={teacher} submitLabel="Save" />
            </div>
          </details>
        )}
        <SignOut email={account.email} />
      </div>
    );
  }

  // ---- An approved teacher ----------------------------------------------------------------
  const prices = await getTeacherPrices();
  const items = menu.map((item) => ({ item, price: prices.get(item.id) ?? item.price_cents }));

  return (
    <>
      <RoomServiceBanner room={teacher.room} enabled={roomService} picks={picks}>
        <a href="#teacher-shop" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ffc45c] px-6 font-semibold text-[#14110f] transition-transform hover:-translate-y-0.5">
          Start an order <ArrowDownIcon className="size-4" />
        </a>
        <span className="text-sm text-[#f6efe3]/70">
          Signed in as {teacher.first_name} {teacher.last_name} · Room {teacher.room}
        </span>
      </RoomServiceBanner>

      {needsPassword(password) && (
        <section className="mb-10 rounded-2xl border-2 border-primary/60 bg-card p-5 sm:p-6">
          <h2 className="font-heading text-3xl font-extrabold">Pick a new password</h2>
          <div className="mt-4 max-w-sm">
            <PasswordForm />
          </div>
        </section>
      )}

      <TeacherShop items={items} maxPerOrder={info.max_items_per_order} />

      <div className="mt-16 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="teacher-orders">
          <h2 id="teacher-orders" className="font-heading text-3xl font-extrabold uppercase">
            Your orders
          </h2>
          {account.orders.length === 0 ? (
            <p className="mt-2 text-muted-foreground">Nothing yet. Your first room service order will show up here.</p>
          ) : (
            <ul className="mt-3 divide-y rounded-2xl border bg-card shadow-soft">
              {account.orders.map((o) => (
                <li key={o.order_number}>
                  <Link href={`/order/${o.order_number}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                    <span>
                      <span className="font-heading text-xl font-extrabold tabular-nums">{formatOrderNumber(o.order_number)}</span>
                      <span className="ml-2 text-sm text-muted-foreground">
                        {formatDay(o.pickup_date)} · {o.delivery_room ? `Room ${o.delivery_room}` : "Pickup"}
                      </span>
                    </span>
                    <span className="text-right text-sm">
                      <span className="block font-semibold tabular-nums">{formatCents(o.total_cents)}</span>
                      <span className="text-muted-foreground">{ORDER_STATUS[o.status as OrderStatus]?.label ?? o.status}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="teacher-room">
          <h2 id="teacher-room" className="font-heading text-3xl font-extrabold uppercase">
            Moved rooms?
          </h2>
          <p className="mt-2 text-muted-foreground">Room service goes to the room you set here (you can change it at checkout too).</p>
          <div className="mt-3 rounded-2xl border bg-card p-5 shadow-soft">
            <TeacherDetailsForm initial={teacher} submitLabel="Save" />
          </div>
          <div className="mt-4">
            <SignOut email={account.email} />
          </div>
        </section>
      </div>
    </>
  );
}

const needsPassword = (value: string | string[] | undefined) => value === "new";

function Perk({ icon: Icon, title, text }: { icon: typeof BellRingIcon; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#14110f] text-[#ffc45c]">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block font-semibold text-foreground">{title}</span>
        {text}
      </span>
    </li>
  );
}

function SignOut({ email }: { email: string }) {
  return (
    <form action={signOut} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      Signed in as {email}.
      <button type="submit" className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 hover:underline">
        <LogOutIcon className="size-3.5" /> Sign out
      </button>
    </form>
  );
}
