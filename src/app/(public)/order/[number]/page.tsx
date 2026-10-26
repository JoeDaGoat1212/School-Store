import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderLive } from "@/components/public/order-live";
import { OrderTicket, type LookedUpOrder } from "@/components/public/order-ticket";
import { Button } from "@/components/ui/button";
import { formatOrderNumber } from "@/config/brand";
import { savedLastName } from "@/lib/my-orders";
import { loadStorefront } from "@/lib/store-data";
import { createClient } from "@/lib/supabase/server";
import { LookupForm } from "../../lookup/lookup-form";

export const metadata: Metadata = { title: "Your order" };

export default async function OrderPage(props: PageProps<"/order/[number]">) {
  const { number: raw } = await props.params;
  const { new: isNew } = await props.searchParams;
  const number = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(number) || number <= 0) notFound();

  // Only show the order if this phone placed it (or looked it up) — that's
  // where the last name comes from. Otherwise ask for the last name.
  const lastName = await savedLastName(number);
  if (!lastName) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Order {formatOrderNumber(number)}</h1>
        <p className="mt-2 mb-6 text-muted-foreground">Enter the last name on the order to see it.</p>
        <LookupForm initialNumber={formatOrderNumber(number)} />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data }, { info }] = await Promise.all([
    supabase.rpc("lookup_order", { p_order_number: number, p_last_name: lastName }),
    loadStorefront(),
  ]);
  if (!data) notFound();
  const order = data as unknown as LookedUpOrder;
  const stillOpen = ["received", "preparing", "ready"].includes(order.status);

  return (
    <div className="mx-auto max-w-md">
      <OrderLive clearCart={isNew === "1"} refreshEvery={stillOpen ? 30 : undefined} />

      <div className="mb-6 text-center">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">
          {isNew === "1" ? "Order placed!" : "Your order"}
        </h1>
        <p className="mt-1.5 text-muted-foreground">
          {isNew === "1"
            ? "Screenshot this, or remember your order number."
            : stillOpen
              ? "This page updates on its own."
              : "Thanks for shopping with us."}
        </p>
      </div>

      <OrderTicket order={order} today={info.today} pickupLocation={info.pickup_location} />

      <div className="mt-6 grid gap-2">
        <Button asChild variant="outline" size="xl">
          <Link href="/">Back to the menu</Link>
        </Button>
      </div>
    </div>
  );
}
