import type { Metadata } from "next";
import { cookies } from "next/headers";
import { StaffSidebar } from "@/components/staff/staff-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SkipLink } from "@/components/skip-link";
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

  // Number badge on "Orders": today's orders still to hand out.
  const { count: openOrders } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("pickup_date", storeToday())
    .in("status", ["received", "preparing", "ready"]);

  // Number badge on "Teachers": requests waiting for approval.
  const { count: pendingTeachers } = await supabase.from("teachers").select("id", { count: "exact", head: true }).eq("status", "pending");

  // Number badge on "Requests": requests from the last 7 days.
  const { count: newRequests } = await supabase
    .from("item_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", daysAgo(7));

  // Remember whether the sidebar was collapsed last time.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    // "backroom": the staff pages' retro corner-store look (globals.css).
    <SidebarProvider defaultOpen={sidebarOpen} className={`backroom ${backroomFonts}`}>
      <SkipLink />
      <StaffSidebar email={user.email} openOrders={openOrders ?? 0} pendingTeachers={pendingTeachers ?? 0} newRequests={newRequests ?? 0} />
      <SidebarInset id="main">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-3 border-b-2 border-dashed border-border bg-card/90 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <p className="font-hand text-xl leading-none text-muted-foreground">{formatDay(storeToday(), { weekday: "long" })}</p>
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** The moment N days ago, for database filters. */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}
