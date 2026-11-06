/** Shown on the employee pages until database update 15 has been run. */
export function UpdateNeeded() {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
      <p className="font-heading text-lg text-destructive">Run database update 15 first</p>
      <p className="mt-1 text-sm">
        Open <code className="font-receipt font-bold">supabase/sql-editor/20261106000015_staff_time_clock.sql</code>, paste all of it into
        Supabase → SQL Editor → New query, and click Run. Then refresh this page.
      </p>
    </div>
  );
}
