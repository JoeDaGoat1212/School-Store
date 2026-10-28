import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon, BellRingIcon, GraduationCapIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { TeacherButtons, TeacherSettings } from "./teacher-controls";

export const metadata: Metadata = { title: "Teachers" };

type TeacherRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  room: string;
  status: "pending" | "approved" | "removed";
  created_at: string;
  approved_at: string | null;
};

/**
 * Teacher accounts: approve new requests, turn teachers off, and set the
 * teacher price and room service. Teachers sign up at /teacher.
 */
export default async function TeachersPage() {
  const { supabase } = await requireAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const [teachers, settings, noCost, roomService] = await Promise.all([
    supabase.from("teachers").select("id, email, first_name, last_name, room, status, created_at, approved_at").order("last_name"),
    supabase.from("settings").select("teacher_markup_cents, room_service_enabled").eq("id", 1).single(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("archived", false).eq("unit_cost_cents", 0),
    supabase.from("orders").select("id", { count: "exact", head: true }).not("delivery_room", "is", null).gte("pickup_date", today),
  ]);
  if (teachers.error) throw new Error(teachers.error.message);
  const rows = (teachers.data ?? []) as TeacherRow[];
  const pending = rows.filter((t) => t.status === "pending");
  const approved = rows.filter((t) => t.status === "approved");
  const off = rows.filter((t) => t.status === "removed");
  const s = settings.data ?? { teacher_markup_cents: 50, room_service_enabled: true };

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Teachers ask for an account at /teacher. Once you approve them they pay cost + 50¢ and can get room service."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
            <BellRingIcon className="size-4" /> {roomService.count ?? 0} room service order{roomService.count === 1 ? "" : "s"} coming up
          </span>
        }
      />

      {(noCost.count ?? 0) > 0 && (
        <p className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong className="font-semibold">{noCost.count} products have no cost saved,</strong> so teachers pay the normal price for
            them. Add costs on the{" "}
            <Link href="/admin/products" className="font-semibold underline underline-offset-4">
              Products
            </Link>{" "}
            page, or by logging a shopping trip in Expenses.
          </span>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="grid content-start gap-8">
          <section aria-labelledby="pending-title">
            <h2 id="pending-title" className="mb-3 font-heading text-xl font-semibold">
              Waiting for you {pending.length > 0 && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-sm text-black">{pending.length}</span>}
            </h2>
            {pending.length === 0 ? (
              <EmptyState icon={GraduationCapIcon} title="No requests right now">
                Send teachers to <strong>/teacher</strong> on the store site to ask for an account.
              </EmptyState>
            ) : (
              <ul className="grid gap-3">
                {pending.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-soft">
                    <div>
                      <p className="font-semibold">
                        {t.first_name} {t.last_name} <span className="font-normal text-muted-foreground">· Room {t.room}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t.email} · asked {formatDay(t.created_at.slice(0, 10))}
                      </p>
                    </div>
                    <TeacherButtons id={t.id} name={t.first_name} status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="approved-title">
            <h2 id="approved-title" className="mb-3 font-heading text-xl font-semibold">
              Approved ({approved.length})
            </h2>
            {approved.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet.</p>
            ) : (
              <ul className="divide-y rounded-2xl border bg-card shadow-soft">
                {approved.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-semibold">
                        {t.first_name} {t.last_name} <span className="font-normal text-muted-foreground">· Room {t.room}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{t.email}</p>
                    </div>
                    <TeacherButtons id={t.id} name={t.first_name} status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {off.length > 0 && (
            <section aria-labelledby="off-title">
              <h2 id="off-title" className="mb-3 font-heading text-xl font-semibold">
                Turned off
              </h2>
              <ul className="divide-y rounded-2xl border bg-card shadow-soft">
                {off.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-muted-foreground">
                    <span>
                      {t.first_name} {t.last_name} · {t.email}
                    </span>
                    <TeacherButtons id={t.id} name={t.first_name} status={t.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="h-fit rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="mb-4 font-heading text-lg font-semibold">Teacher prices & room service</h2>
          <TeacherSettings markupCents={s.teacher_markup_cents} roomService={s.room_service_enabled} />
          <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
            Class hours for room service are in{" "}
            <Link href="/admin/settings#class" className="font-semibold underline underline-offset-4">
              Settings
            </Link>
            .
          </p>
        </aside>
      </div>
    </>
  );
}
