import { bundleOpenTo, type Deals } from "@/lib/deals";
import { isTeacher, type Account, type Reward } from "@/lib/member";
import { pickupDays, type StoreInfo } from "@/lib/ordering";
import type { MenuItem } from "@/lib/store-data";
import type { Checkout } from "./checkout";

/**
 * What the checkout form needs, worked out on the server. Shared by the cart
 * page and the checkout counter in the 3D store.
 */
export function checkoutProps({
  menu,
  info,
  deals,
  account,
  rewards,
}: {
  menu: MenuItem[];
  info: StoreInfo;
  deals: Deals;
  account: Account | null;
  rewards: Reward[];
}): CheckoutProps {
  const teacher = isTeacher(account) ? account.teacher : null;
  const isMember = !teacher && Boolean(account?.profile) && !account?.staff;
  return {
    menu: menu.map((m) => ({ id: m.id, price_cents: m.price_cents, available: m.available })),
    bundles: deals.bundles.map((b) => ({
      id: b.id,
      price_cents: b.price_cents,
      available: b.available,
      itemsPer: b.items.reduce((n, i) => n + i.quantity, 0),
      open: bundleOpenTo(b, isMember),
    })),
    // Teachers can order after the students' same-day cutoff.
    days: pickupDays(info, { teacher: Boolean(teacher) }),
    today: info.today,
    maxItems: info.max_items_per_order,
    pickupLocation: info.pickup_location,
    member: isMember && account?.profile ? { ...account.profile, balance: account.balance } : null,
    signedIn: Boolean(account) && !account?.staff,
    rewards: isMember ? rewards : [],
    rewardsEnabled: !teacher && (info.rewards_enabled ?? false),
    teacher: teacher ? { first_name: teacher.first_name, last_name: teacher.last_name, room: teacher.room } : null,
    // Room service: the class hours it can be brought during.
    classDays: teacher && info.room_service_enabled ? pickupDays(info, { windows: info.class_periods ?? [], teacher: true }) : [],
  };
}

export type CheckoutProps = Omit<React.ComponentProps<typeof Checkout>, "variant" | "onClose" | "onPlaced">;
