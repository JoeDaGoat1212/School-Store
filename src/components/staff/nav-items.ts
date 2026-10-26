import {
  BarChart3Icon,
  BoxesIcon,
  ClipboardListIcon,
  FileUpIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PackageIcon,
  ReceiptIcon,
  SettingsIcon,
} from "lucide-react";

/** The staff sidebar. Add a page here to put it in the menu. */
export const staffNav: { title: string; href: string; icon: LucideIcon }[] = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboardIcon },
  { title: "Orders", href: "/admin/orders", icon: ClipboardListIcon },
  { title: "Inventory", href: "/admin/inventory", icon: BoxesIcon },
  { title: "Expenses", href: "/admin/expenses", icon: ReceiptIcon },
  { title: "Sales import", href: "/admin/imports", icon: FileUpIcon },
  { title: "Insights", href: "/admin/insights", icon: BarChart3Icon },
  { title: "Products", href: "/admin/products", icon: PackageIcon },
  { title: "Settings", href: "/admin/settings", icon: SettingsIcon },
];
