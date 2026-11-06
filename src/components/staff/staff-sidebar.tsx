"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLinkIcon, LogOutIcon } from "lucide-react";
import { logout } from "@/app/login/actions";
import { BrandMark } from "@/components/brand-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { brand } from "@/config/brand";
import { staffNav, staffNavGroups } from "./nav-items";

export function StaffSidebar({
  email,
  openOrders = 0,
  pendingTeachers = 0,
  newRequests = 0,
  pendingJobs = 0,
  pendingStaff = 0,
}: {
  email: string;
  openOrders?: number;
  pendingTeachers?: number;
  /** Requests in the last 7 days. */
  newRequests?: number;
  /** Résumés for city jobs waiting for an answer. */
  pendingJobs?: number;
  /** New time clock accounts waiting for approval. */
  pendingStaff?: number;
}) {
  const pathname = usePathname();

  // The menu item whose address matches the most of the current page wins,
  // so /admin/inventory/shopping-list lights up "Shopping list", not "Inventory".
  const activeHref = staffNav
    .filter((i) => (i.href === "/admin" ? pathname === "/admin" : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const badges: Record<string, { count: number; label: string }> = {
    "/admin/orders": { count: openOrders, label: "open orders today" },
    "/admin/requests": { count: newRequests, label: "requests this week" },
    "/admin/jobs": { count: pendingJobs, label: "job applications waiting" },
    "/admin/teachers": { count: pendingTeachers, label: "teachers waiting for approval" },
    "/admin/staff/people": { count: pendingStaff, label: "new employees waiting for approval" },
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <BrandMark size={32} />
                <span className="grid leading-tight">
                  <span className="font-heading text-[0.95rem] font-bold">{brand.name}</span>
                  <span className="text-xs text-sidebar-foreground/60">Store manager</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {staffNavGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const badge = badges[item.href];
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={activeHref === item.href} tooltip={item.title}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {badge && badge.count > 0 && (
                        <SidebarMenuBadge aria-label={`${badge.count} ${badge.label}`}>{badge.count}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open the store students see">
              <Link href="/home" target="_blank">
                <ExternalLinkIcon />
                <span>View the store</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton type="submit" size="lg" tooltip="Log out">
                <LogOutIcon />
                <span className="grid min-w-0 text-left leading-tight">
                  <span>Log out</span>
                  {email && <span className="truncate text-xs text-sidebar-foreground/55">{email}</span>}
                </span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
