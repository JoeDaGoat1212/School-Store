import { Hero, InfoTicker } from "@/components/public/hero";
import { Menu } from "@/components/public/menu";
import { loadStorefront } from "@/lib/store-data";

/** The menu students see after scanning the QR code. */
export default async function MenuPage() {
  const { menu, info } = await loadStorefront();

  return (
    <>
      <Hero info={info} />
      <InfoTicker info={info} />

      {menu.length === 0 ? (
        <div className="mt-10 rounded-2xl border-2 border-dashed px-6 py-14 text-center">
          <p className="font-heading text-2xl font-bold">The shelves are empty right now</p>
          <p className="mt-1 text-muted-foreground">Check back soon, or stop by the store window.</p>
        </div>
      ) : (
        <Menu items={menu} maxPerOrder={info.max_items_per_order} />
      )}
    </>
  );
}
