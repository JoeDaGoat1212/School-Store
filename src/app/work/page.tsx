import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowRightIcon, LayoutDashboardIcon } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { staffNavGroups } from "@/components/staff/nav-items";
import { brand } from "@/config/brand";
import { createClient } from "@/lib/supabase/server";
import { loadPortal } from "./actions";
import { AndroidApp } from "./android-app";
import { InstallButton } from "./install-button";
import { Portal } from "./portal";
import { SignIn } from "./sign-in";

export const metadata: Metadata = {
  title: `${brand.name} Work`,
  description: "Clock in and out, and see your hours, discount and store credit.",
  manifest: "/work/manifest.webmanifest",
  appleWebApp: { capable: true, title: "FN Work", statusBarStyle: "black-translucent" },
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: brand.colors.ink,
  maximumScale: 1,
  viewportFit: "cover",
};

/**
 * The employee app. Install it from here (phone: "Add to Home Screen").
 *   - Employees sign in with their name and time clock PIN, then clock in
 *     and out, and see their hours, discount, store credit and schedule.
 *   - The manager (signed in with the admin password) also gets every staff
 *     tool, one tap away.
 */
const TABS = ["today", "tasks", "messages", "schedule", "money"] as const;

export default async function WorkPage(props: PageProps<"/work">) {
  const [{ data: portal, error }, admin, params] = await Promise.all([loadPortal(), isAdmin(), props.searchParams]);
  // Notifications open a tab directly: /work?tab=messages&chat=…
  const tab = TABS.find((t) => t === params.tab) ?? "today";
  const chat = typeof params.chat === "string" && /^[0-9a-f-]{36}$/.test(params.chat) ? params.chat : null;

  return (
    <div className="dark night min-h-svh bg-background pt-[env(safe-area-inset-top)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <BrandMark size={34} />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-heading text-xl leading-none font-bold">{brand.name}</p>
            <p className="text-xs text-muted-foreground">{admin ? "Manager" : "Employee app"}</p>
          </div>
          <InstallButton />
        </div>
      </header>

      <main className="mx-auto grid max-w-xl gap-5 px-4 pt-5">
        {error && (
          <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}

        {admin && <ManagerTools />}

        <AndroidApp />

        {portal ? <Portal initial={portal} initialTab={tab} initialChat={chat} /> : !admin || !error ? <SignIn manager={admin} /> : null}
      </main>
    </div>
  );
}

async function isAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return false;
  const { data: row } = await supabase.from("admins").select("user_id").eq("user_id", id).maybeSingle();
  return Boolean(row);
}

/** Every staff tool, grouped like the dashboard's sidebar. */
function ManagerTools() {
  return (
    <section aria-labelledby="tools" className="grid gap-4">
      <Link
        href="/admin"
        className="flex items-center gap-3 rounded-xl bg-foreground p-4 text-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <LayoutDashboardIcon className="size-6" />
        <span className="flex-1">
          <span id="tools" className="block font-heading text-lg font-bold">
            Dashboard
          </span>
          <span className="text-sm opacity-80">Sales, to-dos and who&apos;s working</span>
        </span>
        <ArrowRightIcon className="size-5" />
      </Link>
      {staffNavGroups.map((g) => (
        <div key={g.label}>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{g.label}</h2>
          <ul className="grid grid-cols-2 gap-2">
            {g.items
              .filter((i) => i.href !== "/admin" && i.href !== "/work")
              .map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className="flex h-full items-start gap-2.5 rounded-lg border bg-card p-3 active:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <i.icon className="mt-0.5 size-5 shrink-0 text-ember-ink" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{i.title}</span>
                      {i.blurb && <span className="block text-xs text-muted-foreground">{i.blurb}</span>}
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
