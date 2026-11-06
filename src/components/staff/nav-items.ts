import {
  BarChart3Icon,
  BoxesIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  FileUpIcon,
  GiftIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  MessageSquarePlusIcon,
  type LucideIcon,
  PackageIcon,
  ReceiptIcon,
  ScanBarcodeIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TagIcon,
  TimerIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { features } from "@/config/features";

export type StaffNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** One line shown on the dashboard's tool tiles. */
  blurb: string;
  /** Hidden while this feature is switched off in src/config/features.ts. */
  feature?: keyof typeof features;
};

export type StaffNavGroup = { label: string; items: StaffNavItem[] };

/** Every staff tool, grouped the way the sidebar shows them. Add a page here to put it in the menu. */
const allGroups: StaffNavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/admin", icon: LayoutDashboardIcon, blurb: "Today at a glance" },
      { title: "Register", href: "/admin/register", icon: ScanBarcodeIcon, blurb: "Scan items as they sell" },
      { title: "Orders", href: "/admin/orders", icon: ClipboardListIcon, blurb: "Online order queue", feature: "orders" },
      { title: "Insights", href: "/admin/insights", icon: BarChart3Icon, blurb: "Sales, profit and best sellers" },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Inventory", href: "/admin/inventory", icon: BoxesIcon, blurb: "What's on the shelf, fix counts" },
      { title: "Shopping list", href: "/admin/inventory/shopping-list", icon: ShoppingCartIcon, blurb: "What to buy on the next trip" },
      { title: "Products", href: "/admin/products", icon: PackageIcon, blurb: "Prices, photos, add new items" },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Expenses", href: "/admin/expenses", icon: ReceiptIcon, blurb: "Log shopping trips and receipts" },
      { title: "Sales import", href: "/admin/imports", icon: FileUpIcon, blurb: "Upload the InTouchPay export" },
    ],
  },
  {
    label: "Customers",
    items: [
      { title: "Deals", href: "/admin/deals", icon: TagIcon, blurb: "Sales, combos and bundles" },
      { title: "Rewards", href: "/admin/rewards", icon: GiftIcon, blurb: "Points and free items" },
      { title: "Requests", href: "/admin/requests", icon: MessageSquarePlusIcon, blurb: "Items students asked for" },
      { title: "Teachers", href: "/admin/teachers", icon: GraduationCapIcon, blurb: "Approve teacher accounts" },
    ],
  },
  {
    label: "Team",
    items: [
      { title: "Schedule", href: "/admin/staff", icon: CalendarClockIcon, blurb: "Who works 1st–7th hour" },
      { title: "Timecards", href: "/admin/staff/hours", icon: TimerIcon, blurb: "Hours worked, fix punches" },
      { title: "Employees", href: "/admin/staff/people", icon: UsersIcon, blurb: "PINs, sign-ups, approvals" },
      { title: "Store credit", href: "/admin/staff/credit", icon: WalletIcon, blurb: "$1 per 45 min worked" },
    ],
  },
  {
    label: "Store",
    items: [
      { title: "City jobs", href: "/admin/jobs", icon: BriefcaseIcon, blurb: "3D city job applications" },
      { title: "Settings", href: "/admin/settings", icon: SettingsIcon, blurb: "Store info, hours, closed days" },
    ],
  },
];

/** The sidebar, minus anything that's switched off. */
export const staffNavGroups: StaffNavGroup[] = allGroups
  .map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || features[i.feature]) }))
  .filter((g) => g.items.length > 0);

/** Every visible tool in one flat list. */
export const staffNav: StaffNavItem[] = staffNavGroups.flatMap((g) => g.items);
