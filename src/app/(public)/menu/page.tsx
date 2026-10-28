import type { Metadata } from "next";
import { InfoTicker } from "@/components/public/info-ticker";
import { Menu } from "@/components/public/menu";
import { getAccount } from "@/lib/member";
import { loadStorefront } from "@/lib/store-data";

export const metadata: Metadata = { title: "Menu" };

/**
 * Everything in the store as a plain list: for anyone who'd rather not walk
 * around the 3D store (or whose browser can't show it).
 */
export default async function ListPage() {
  const [{ menu, info, deals }, account] = await Promise.all([loadStorefront(), getAccount()]);
  const isMember = Boolean(account?.profile);

  return (
    <>
      <div className="-mt-6">
        <InfoTicker info={info} />
      </div>
      {menu.length === 0 && deals.bundles.length === 0 ? (
        <div className="mt-10 rounded-2xl border-2 border-dashed px-6 py-14 text-center">
          <p className="font-heading text-2xl font-bold">The shelves are empty right now</p>
          <p className="mt-1 text-muted-foreground">Check back soon, or stop by the store window.</p>
        </div>
      ) : (
        <Menu items={menu} maxPerOrder={info.max_items_per_order} deals={deals} isMember={isMember} />
      )}
    </>
  );
}
