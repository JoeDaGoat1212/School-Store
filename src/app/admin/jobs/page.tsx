import type { Metadata } from "next";
import { BriefcaseIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatDay } from "@/lib/format";
import { FireButton, HireButtons } from "./job-controls";

export const metadata: Metadata = { title: "City jobs" };

const SHOPS: Record<string, string> = {
  pizza: "Slice Society (pizza)",
  icecream: "Polar Scoops (ice cream)",
  coffee: "Bean There (coffee)",
  burger: "Smash Stack (burgers)",
  flowers: "Petal & Stem (flowers)",
};
const TITLES = ["Trainee", "Crew Member", "Senior Crew", "Shift Lead", "Assistant Manager", "Store Manager"];
const WAGES = [15.5, 17.25, 19.5, 22, 25.75, 30];

type Answers = { name?: string; position?: string; why?: string; experience?: string; skills?: string[]; availability?: string; reference?: string };
type Row = {
  id: string;
  business: string;
  status: "pending" | "hired" | "declined" | "fired" | "quit";
  level: number;
  answers: Answers;
  staff_note: string | null;
  created_at: string;
  decided_at: string | null;
  game_players: { display_name: string; id_number: string } | null;
};

/**
 * Players apply for jobs at the shops in the 3D city by picking up a résumé
 * at the counter. Hire them here; until a shop has someone, a computer
 * character works it.
 */
export default async function JobsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase
    .from("game_job_applications")
    .select("id, business, status, level, answers, staff_note, created_at, decided_at, game_players(display_name, id_number)")
    .order("created_at", { ascending: false })
    .limit(300);
  // Before database update 13 the table doesn't exist: the banner at the top says what to run.
  const rows = (data ?? []) as unknown as Row[];
  const pending = rows.filter((r) => r.status === "pending");
  const hired = rows.filter((r) => r.status === "hired");
  const past = rows.filter((r) => r.status !== "pending" && r.status !== "hired").slice(0, 40);
  const who = (r: Row) => r.game_players?.display_name ?? r.answers.name ?? "Player";

  return (
    <>
      <PageHeader
        title="City jobs"
        description="Players apply for jobs in the 3D city's shops. Hire them here: they can clock in next time they walk in. Pay starts at $15.50 an hour (pretend money) and goes up with promotions."
      />
      <div className="grid gap-8">
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className="mb-3 font-heading text-xl font-semibold">
            Résumés waiting {pending.length > 0 && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-sm text-black">{pending.length}</span>}
          </h2>
          {pending.length === 0 ? (
            <EmptyState icon={BriefcaseIcon} title="No résumés right now">
              Players pick one up at the counter of any shop in the 3D city.
            </EmptyState>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {pending.map((r) => (
                <li key={r.id} className="grid gap-3 rounded-2xl border bg-card p-4 shadow-soft">
                  <div>
                    <p className="font-semibold">
                      {who(r)} <span className="font-normal text-muted-foreground">· {SHOPS[r.business] ?? r.business}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ID {r.game_players?.id_number ?? "—"} · applied {formatDay(r.created_at.slice(0, 10))}
                      {r.answers.position ? ` · wants: ${r.answers.position}` : ""}
                    </p>
                  </div>
                  <dl className="grid gap-2 text-sm">
                    <div>
                      <dt className="font-semibold">Why they want the job</dt>
                      <dd className="whitespace-pre-wrap text-muted-foreground">{r.answers.why || "—"}</dd>
                    </div>
                    {r.answers.experience && (
                      <div>
                        <dt className="font-semibold">Experience</dt>
                        <dd className="whitespace-pre-wrap text-muted-foreground">{r.answers.experience}</dd>
                      </div>
                    )}
                    {(r.answers.skills?.length ?? 0) > 0 && (
                      <div>
                        <dt className="font-semibold">Skills</dt>
                        <dd className="text-muted-foreground">{r.answers.skills!.join(", ")}</dd>
                      </div>
                    )}
                    {r.answers.availability && (
                      <div>
                        <dt className="font-semibold">Available</dt>
                        <dd className="text-muted-foreground">{r.answers.availability}</dd>
                      </div>
                    )}
                    {r.answers.reference && (
                      <div>
                        <dt className="font-semibold">Reference</dt>
                        <dd className="text-muted-foreground">{r.answers.reference}</dd>
                      </div>
                    )}
                  </dl>
                  <HireButtons id={r.id} name={who(r)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="staff-title">
          <h2 id="staff-title" className="mb-3 font-heading text-xl font-semibold">
            Working now ({hired.length})
          </h2>
          {hired.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody yet: computer characters are running every shop.</p>
          ) : (
            <ul className="divide-y rounded-2xl border bg-card shadow-soft">
              {hired.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">
                      {who(r)} <span className="font-normal text-muted-foreground">· {SHOPS[r.business] ?? r.business}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {TITLES[Math.min(r.level, TITLES.length - 1)]} · ${WAGES[Math.min(r.level, WAGES.length - 1)].toFixed(2)}/hr · hired{" "}
                      {r.decided_at ? formatDay(r.decided_at.slice(0, 10)) : ""}
                    </p>
                  </div>
                  <FireButton id={r.id} name={who(r)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section aria-labelledby="past-title">
            <h2 id="past-title" className="mb-3 font-heading text-xl font-semibold">
              Past
            </h2>
            <ul className="divide-y rounded-2xl border bg-card text-sm shadow-soft">
              {past.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-muted-foreground">
                  <span>
                    {who(r)} · {SHOPS[r.business] ?? r.business}
                  </span>
                  <span className="capitalize">
                    {r.status}
                    {r.staff_note ? ` · ${r.staff_note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
