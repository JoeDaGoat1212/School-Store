import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { storeToday } from "@/lib/format";
import { ClosedDaysEditor } from "./closed-days-editor";
import { PickupWindowsEditor } from "./pickup-windows-editor";
import { InventoryForm, OrderingForm, PasswordForm, StoreInfoForm, type StoreSettings } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  ["store", "Store info"],
  ["pickup", "Pickup times"],
  ["class", "Class hours"],
  ["ordering", "Ordering rules"],
  ["closed", "Closed days"],
  ["inventory", "Inventory & privacy"],
  ["account", "Admin login"],
] as const;

export default async function SettingsPage() {
  const { supabase, user } = await requireAdmin();
  const [{ data: settings, error }, { data: windows }, { data: closed }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("pickup_windows").select("id, label, starts_at, active, kind").order("sort_order").order("starts_at"),
    supabase.from("closed_dates").select("closed_on, reason").order("closed_on"),
  ]);
  if (error) throw new Error(error.message);
  const s = settings as StoreSettings;

  return (
    <>
      <PageHeader title="Settings" description="Changes take effect on the student menu right away." />

      <div className="grid gap-8 lg:grid-cols-[180px_1fr]">
        {/* Jump links (sticky on big screens) */}
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-6">
          <StoreInfoForm s={s} />
          <PickupWindowsEditor
            // Rebuild the editor after a save, so new times get their real ids.
            key={JSON.stringify(windows)}
            initial={(windows ?? []).filter((w) => w.kind !== "class").map((w) => ({ ...w, starts_at: w.starts_at.slice(0, 5) }))}
            leadMinutes={s.order_lead_minutes}
          />
          <PickupWindowsEditor
            key={`class-${JSON.stringify(windows)}`}
            kind="class"
            initial={(windows ?? []).filter((w) => w.kind === "class").map((w) => ({ ...w, starts_at: w.starts_at.slice(0, 5) }))}
            leadMinutes={s.order_lead_minutes}
          />
          <OrderingForm s={s} />
          <ClosedDaysEditor days={closed ?? []} today={storeToday()} />
          <InventoryForm s={s} />
          <PasswordForm email={user.email} />
        </div>
      </div>
    </>
  );
}
