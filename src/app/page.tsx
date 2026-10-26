import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { brand } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/format";

// Temporary home page for phase 1: proves the public side can read the menu
// through get_menu(). Phase 2 replaces this with the full menu and cart.
// (It reads cookies via createClient, so it always renders fresh.)

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: menu, error }, { data: info }] = await Promise.all([
    supabase.rpc("get_menu"),
    supabase.rpc("get_store_info"),
  ]);
  const store = info as { store_hours?: string; pickup_location?: string; banner_text?: string | null } | null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex items-center gap-3">
        <BrandMark size={44} />
        <div className="flex-1">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{brand.name}</h1>
          <p className="text-sm text-muted-foreground">{brand.tagline}</p>
        </div>
        <ThemeToggle />
      </header>

      {store?.banner_text && (
        <p className="mt-6 rounded-xl bg-sticker px-4 py-3 font-medium text-sticker-foreground">{store.banner_text}</p>
      )}

      <p className="mt-6 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Phase 1 preview: online ordering is built in phase 2. {store?.store_hours} · {store?.pickup_location}
      </p>

      {error ? (
        <p role="alert" className="mt-6 text-destructive">
          Couldn&apos;t load the menu: {error.message}
        </p>
      ) : (
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {menu?.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <span aria-hidden className="text-2xl">
                {item.emoji ?? "📦"}
              </span>
              <span className="flex-1 font-medium">{item.name}</span>
              <span className="font-heading font-semibold tabular-nums">
                {item.available > 0 ? formatCents(item.price_cents) : "Sold out"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:underline">
          Staff login
        </Link>
      </p>
    </main>
  );
}
