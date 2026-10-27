import type { Metadata } from "next";
import { cookies } from "next/headers";
import { StaffSidebar } from "@/components/staff/staff-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SkipLink } from "@/components/skip-link";
import { requireAdmin } from "@/lib/auth";
import { storeToday } from "@/lib/format";

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

  // Remember whether the sidebar was collapsed last time.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <SkipLink />
      <StaffSidebar email={user.email} openOrders={openOrders ?? 0} />
      <SidebarInset id="main">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
