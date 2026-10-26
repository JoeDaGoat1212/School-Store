import { ClockIcon, MapPinIcon, MegaphoneIcon } from "lucide-react";
import { Menu } from "@/components/public/menu";
import { brand } from "@/config/brand";
import { formatClock, relativeDay } from "@/lib/format";
import { orderingStatus } from "@/lib/ordering";
import { loadStorefront } from "@/lib/store-data";

/** The menu students see after scanning the QR code. */
export default async function MenuPage() {
  const { menu, info } = await loadStorefront();
  const status = orderingStatus(info);

  return (
    <>
      <section className="mb-2">
        <h1 className="font-heading text-[2rem] leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
          Skip the line.
        </h1>
        <p className="mt-2 max-w-md text-muted-foreground">{brand.tagline}</p>

        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-card px-3.5 py-1.5 text-sm font-medium shadow-soft ring-1 ring-border">
          <span
            aria-hidden
            className={`size-2 rounded-full ${status.todayOpen ? "bg-success" : status.open ? "bg-warning" : "bg-muted-foreground"}`}
          />
          {status.todayOpen
            ? `Ordering open — pick up today through ${status.lastWindow}`
            : status.open && info.next_open_day
              ? `Today's orders are closed — order now for ${relativeDay(info.next_open_day, info.today).toLowerCase()}`
              : "Online ordering is closed right now"}
        </p>

        {info.banner_text && (
          <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-sticker px-4 py-3 font-medium text-sticker-foreground">
            <MegaphoneIcon className="mt-0.5 size-4.5 shrink-0" />
            {info.banner_text}
          </p>
        )}

        <dl className="mt-4 grid gap-1.5 text-sm text-muted-foreground sm:flex sm:gap-6">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            <dt className="sr-only">Hours</dt>
            <dd>{info.store_hours}</dd>
          </div>
          <div className="flex items-center gap-2">
            <MapPinIcon className="size-4" />
            <dt className="sr-only">Pickup location</dt>
            <dd>{info.pickup_location}</dd>
          </div>
          {status.todayOpen && (
            <div className="flex items-center gap-2">
              <dt className="sr-only">Cutoff</dt>
              <dd>Same-day orders close at {formatClock(info.order_cutoff_time)}</dd>
            </div>
          )}
        </dl>
      </section>

      {menu.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed px-6 py-14 text-center">
          <p className="font-heading text-lg font-semibold">The menu is empty right now</p>
          <p className="mt-1 text-sm text-muted-foreground">Check back soon, or stop by the store window.</p>
        </div>
      ) : (
        <Menu items={menu} maxPerOrder={info.max_items_per_order} />
      )}
    </>
  );
}
