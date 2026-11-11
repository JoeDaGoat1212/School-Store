import type { Metadata } from "next";
import { PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { StaffTabs } from "../staff-tabs";
import { RestockAreas, RestockReview } from "./restock-review";

export const metadata: Metadata = { title: "Restock checks" };

/**
 * After every shift, the employee photographs each area fully stocked (on the
 * store tablet right after clocking out, or in the app). Check them here.
 */
export default async function RestockPage(props: PageProps<"/admin/staff/restock">) {
  const params = await props.searchParams;
  const { supabase } = await requireAdmin();
  const showAll = params.show === "all";

  let q = supabase
    .from("restock_checks")
    .select("id, staff_name, areas, skipped_note, completed_at, reviewed, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  if (!showAll) q = q.eq("reviewed", false);
  const [checks, settings] = await Promise.all([q, supabase.from("settings").select("restock_areas").eq("id", 1).maybeSingle()]);

  if (checks.error) {
    return (
      <>
        <PageHeader title="Restock checks" />
        <StaffTabs />
        <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          Restock photos need database update 20. Run <code>supabase/sql-editor/20261110000020_team_tools.sql</code> in Supabase → SQL Editor.
        </p>
      </>
    );
  }

  const ids = (checks.data ?? []).map((c) => c.id);
  // Which class period each check was taken in (database update 22; none before it's run).
  const { data: periods } = ids.length ? await supabase.from("restock_checks").select("id, period_label").in("id", ids) : { data: [] };
  const periodOf = new Map((periods ?? []).map((p) => [p.id, p.period_label]));
  const { data: photos } = ids.length ? await supabase.from("restock_photos").select("check_id, area, path").in("check_id", ids) : { data: [] };
  const paths = (photos ?? []).map((p) => p.path);
  const { data: signed } = paths.length ? await supabase.storage.from("restock").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const list = (checks.data ?? []).map((c) => ({
    id: c.id,
    name: c.staff_name,
    at: c.created_at,
    period: periodOf.get(c.id) ?? null,
    reviewed: c.reviewed,
    skipped: c.skipped_note,
    complete: Boolean(c.completed_at),
    photos: c.areas.map((area) => {
      const p = (photos ?? []).find((x) => x.check_id === c.id && x.area === area);
      return { area, url: p ? (url.get(p.path) ?? null) : null };
    }),
  }));

  return (
    <>
      <PageHeader
        title="Restock checks"
        description="Photos employees take each shift from the Restock button in their app, one per spot, fully stocked, stamped with the class period. Look them over and mark them checked."
      />
      <StaffTabs />
      <RestockReview checks={list} showAll={showAll} />
      <RestockAreas areas={settings.data?.restock_areas ?? ["Drinks", "Snacks (right half)", "Snacks (left half)", "Spicy chips", "Regular chips", "Ramen"]} />
    </>
  );
}
