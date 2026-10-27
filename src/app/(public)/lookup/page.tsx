import type { Metadata } from "next";
import Link from "next/link";
import { formatOrderNumber } from "@/config/brand";
import { getSavedOrders } from "@/lib/my-orders";
import { LookupForm } from "./lookup-form";

export const metadata: Metadata = { title: "Find my order" };

export default async function LookupPage() {
  // Orders placed on this phone in the last 2 days, for one-tap access.
  const recent = await getSavedOrders();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-heading text-5xl leading-[0.95] font-extrabold">Find my order</h1>
      <p className="mt-2 mb-6 text-muted-foreground">Check whether your order is ready for pickup.</p>

      {recent.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Ordered on this phone</h2>
          <ul className="flex flex-wrap gap-2">
            {recent.map((o) => (
              <li key={o.n}>
                <Link
                  href={`/order/${o.n}`}
                  className="inline-flex h-11 items-center rounded-xl bg-sticker px-4 font-heading font-bold text-sticker-foreground tabular-nums focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {formatOrderNumber(o.n)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <LookupForm />
    </div>
  );
}
