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
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { brand } from "@/config/brand";
import { staffNav } from "./nav-items";

export function StaffSidebar({ email, openOrders, pendingTeachers = 0 }: { email: string; openOrders: number; pendingTeachers?: number }) {
  const pathname = usePathname();

  // "/admin" is only active on the dashboard itself; other items also match their sub-pages.
  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <BrandMark size={32} />
                <span className="grid leading-tight">
                  <span className="font-heading text-base font-bold">{brand.name}</span>
                  <span className="font-hand text-lg leading-none text-sidebar-primary">the back room</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {staffNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.href === "/admin/orders" && openOrders > 0 && (
                    <SidebarMenuBadge aria-label={`${openOrders} open orders today`}>{openOrders}</SidebarMenuBadge>
                  )}
                  {item.href === "/admin/teachers" && pendingTeachers > 0 && (
                    <SidebarMenuBadge aria-label={`${pendingTeachers} teachers waiting for approval`}>{pendingTeachers}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Open the menu students see">
              <Link href="/" target="_blank">
                <ExternalLinkIcon />
                <span>View public menu</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logout}>
              <SidebarMenuButton type="submit" tooltip="Log out">
                <LogOutIcon />
                <span className="truncate">Log out {email && <span className="text-muted-foreground">· {email}</span>}</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
