import type { Metadata } from "next";
import { cookies } from "next/headers";
import { StaffSidebar } from "@/components/staff/staff-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SkipLink } from "@/components/skip-link";
import { Button } from "@/components/ui/button";
import { features } from "@/config/features";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { formatDay, storeToday } from "@/lib/format";
import { backroomFonts } from "./fonts";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Staff" },
  robots: { index: false }, // keep staff pages out of search engines
};

/** Wraps every /admin page: checks the login, then draws the sidebar. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { supabase, user } = await requireAdmin();

  // Number badge on "Orders": today's orders still to hand out (only while orders are switched on).
  const { count: openOrders } = features.orders
    ? await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("pickup_date", storeToday())
        .in("status", ["received", "preparing", "ready"])
    : { count: 0 };

  // Number badge on "Teachers": requests waiting for approval.
  const { count: pendingTeachers, error: teachersMissing } = await supabase
    .from("teachers")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // Number badge on "Requests": requests from the last 7 days.
  const { count: newRequests, error: requestsMissing } = await supabase
    .from("item_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", daysAgo(7));

  // Number badge on "City jobs": résumés waiting for an answer.
  const { count: pendingJobs, error: jobsMissing } = await supabase
    .from("game_job_applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // Number badge on "Employees": time clock sign-ups waiting for approval.
  const { count: pendingStaff, error: staffMissing } = await supabase
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // Update 16 (the employee app) adds staff_sessions.
  const { error: appMissing } = staffMissing
    ? { error: true }
    : await supabase.from("staff_sessions").select("token_hash", { count: "exact", head: true });

  // Update 17 (automatic clock-out) adds a setting.
  const { error: autoMissing } = staffMissing
    ? { error: true }
    : await supabase.from("settings").select("staff_max_shift_minutes").eq("id", 1).maybeSingle();

  // Update 18 (store tablet lock) adds the manager code.
  const { error: kioskMissing } = staffMissing
    ? { error: true }
    : await supabase.from("settings").select("kiosk_pin_hash").eq("id", 1).maybeSingle();

  // Database updates that haven't been run yet (their tables are missing).
  const missing = [
    ...(teachersMissing ? [{ file: "20261028000011_teachers_room_service.sql", what: "teachers, room service and combos" }] : []),
    ...(requestsMissing ? [{ file: "20261028000012_item_requests.sql", what: "item requests" }] : []),
    ...(jobsMissing ? [{ file: "20261029000013_city_game.sql", what: "the 3D city game (jobs, money, ID cards)" }] : []),
    ...(staffMissing ? [{ file: "20261106000015_staff_time_clock.sql", what: "the employee time clock, schedule and store credit" }] : []),
    ...(appMissing ? [{ file: "20261109000016_employee_app.sql", what: "the employee app (phone clock-in, discounts and the new credit rule)" }] : []),
    ...(autoMissing ? [{ file: "20261109000017_auto_clock_out.sql", what: "automatic clock-out after 1 hour 15 minutes" }] : []),
    ...(kioskMissing ? [{ file: "20261109000018_kiosk_lock.sql", what: "locking the store tablet on the time clock" }] : []),
  ];

  // Remember whether the sidebar was collapsed last time.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    // "backroom": the staff pages' look (globals.css → "The back room").
    <SidebarProvider defaultOpen={sidebarOpen} className={`backroom ${backroomFonts}`}>
      <SkipLink />
      <StaffSidebar email={user.email} openOrders={openOrders ?? 0} pendingTeachers={pendingTeachers ?? 0} newRequests={newRequests ?? 0} pendingJobs={pendingJobs ?? 0} pendingStaff={pendingStaff ?? 0} />
      <SidebarInset id="main">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <SidebarTrigger className="-ml-1" />
          <span aria-hidden className="h-5 w-px bg-border" />
          <p className="text-sm font-medium text-muted-foreground">{formatDay(storeToday(), { weekday: "long", month: "long" })}</p>
          <div className="flex-1" />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/home" target="_blank">
              <ExternalLinkIcon /> View store
            </Link>
          </Button>
          <ThemeToggle />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {missing.length > 0 && <UpdatesNeeded missing={missing} />}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** The moment N days ago, for database filters. */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/**
 * Shown on every staff page until the store's database has every update the
 * code needs. Each update is a file to paste into Supabase's SQL Editor.
 */
function UpdatesNeeded({ missing }: { missing: { file: string; what: string }[] }) {
  return (
    <div role="alert" className="mb-8 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-heading text-lg text-destructive">Database update needed</p>
      <p className="mt-1 text-sm">
        Some features won&apos;t work until you run {missing.length === 1 ? "this update" : "these updates, in this order"}. Open each file
        from <code className="font-receipt">supabase/sql-editor/</code>, paste all of it into Supabase → SQL Editor → New query, and click
        Run.
      </p>
      <ol className="mt-2 grid gap-1 text-sm">
        {missing.map((m) => (
          <li key={m.file}>
            <code className="font-receipt font-bold">{m.file}</code> <span className="text-muted-foreground">({m.what})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
