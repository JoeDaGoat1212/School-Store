import { Suspense } from "react";
import { FlashToast } from "@/components/flash-toast";
import { Hero, InfoTicker } from "@/components/public/hero";
import { Menu } from "@/components/public/menu";
import { getAccount } from "@/lib/member";
import { loadStorefront } from "@/lib/store-data";

/** The menu students see after scanning the QR code. */
export default async function MenuPage() {
  const [{ menu, info, deals }, account] = await Promise.all([loadStorefront(), getAccount()]);
  const isMember = Boolean(account?.profile);

  return (
    <>
      <Suspense>
        <FlashToast param="account" text="Your rewards account was deleted." />
      </Suspense>
      <Hero info={info} />
      <InfoTicker info={info} />

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
