import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquarePlusIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/staff/page-header";
import { requireAdmin } from "@/lib/auth";
import { formatDay, formatTime, storeToday } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusPicker } from "./status-picker";
import { STATUS_LABEL, type RequestStatus } from "./statuses";

export const metadata: Metadata = { title: "Requests" };

type Row = {
  item_name: string;
  item_key: string;
  category: string | null;
  note: string | null;
  requester: string | null;
  source: string;
  teacher_id: string | null;
  created_at: string;
};

const RANGES = { "30": "30 days", "90": "90 days", "365": "This year" } as const;
const SHOW = { open: "Open", planned: "Coming soon", stocked: "Now selling", declined: "Not doing", all: "All" } as const;

/**
 * What students and teachers have asked us to sell (from the request table in
 * the 3D store and the home page), grouped by item, most asked first.
 */
export default async function RequestsPage(props: PageProps<"/admin/requests">) {
  const params = await props.searchParams;
  const days = (Object.keys(RANGES) as (keyof typeof RANGES)[]).find((k) => k === params.days) ?? "90";
  const show = (Object.keys(SHOW) as (keyof typeof SHOW)[]).find((k) => k === params.show) ?? "open";
  const { rows, statusOf, now } = await loadRequests(Number(days));

  // ---- Add it all up ------------------------------------------------------------------------
  const week = 7 * 86400000;
  const thisWeek = rows.filter((r) => now - Date.parse(r.created_at) < week).length;
  const lastWeek = rows.filter((r) => now - Date.parse(r.created_at) >= week && now - Date.parse(r.created_at) < 2 * week).length;

  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.item_key, [...(groups.get(r.item_key) ?? []), r]);
  const items = [...groups.entries()]
    .map(([key, list]) => ({
      key,
      name: mostCommon(list.map((r) => r.item_name), (n) => n !== n.toLowerCase()),
      category: mostCommon(list.map((r) => r.category).filter(Boolean) as string[]) || null,
      count: list.length,
      week: list.filter((r) => now - Date.parse(r.created_at) < week).length,
      teachers: list.filter((r) => r.teacher_id).length,
      last: list[0].created_at,
      notes: list.filter((r) => r.note).slice(0, 3),
      status: statusOf.get(key) ?? "new",
    }))
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
  const shown = items.filter((i) => (show === "all" ? true : show === "open" ? i.status === "new" || i.status === "planned" : i.status === show));
  const top = Math.max(1, ...items.map((i) => i.count));

  const byCategory = tally(rows.map((r) => r.category ?? "Not said"));
  const from3d = rows.filter((r) => r.source === "store3d").length;
  const fromTeachers = rows.filter((r) => r.teacher_id).length;

  const link = (patch: Record<string, string>) => {
    const q = new URLSearchParams({ days, show, ...patch });
    return `/admin/requests?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Requests"
        description="What students and teachers have asked us to sell, from the request table in the 3D store and the home page. Most asked first."
        actions={
          <nav aria-label="Time range" className="flex rounded-lg bg-muted p-1 text-sm">
            {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
              <Link
                key={k}
                href={link({ days: k })}
                aria-current={k === days ? "page" : undefined}
                className={cn("rounded-md px-3 py-1.5 font-medium", k === days ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {RANGES[k]}
              </Link>
            ))}
          </nav>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={MessageSquarePlusIcon} title="No requests yet">
          Students ask at the request table in the 3D store (front left, by the doors) or at the bottom of the home page.
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* ---- Most wanted ---- */}
          <section aria-labelledby="wanted-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="wanted-title" className="font-heading text-2xl">
                Most wanted
              </h2>
              <nav aria-label="Show" className="flex flex-wrap gap-1">
                {(Object.keys(SHOW) as (keyof typeof SHOW)[]).map((k) => (
                  <Link
                    key={k}
                    href={link({ show: k })}
                    aria-current={k === show ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm font-medium",
                      k === show ? "border-foreground bg-foreground text-background" : "hover:border-foreground/40",
                    )}
                  >
                    {SHOW[k]}
                  </Link>
                ))}
              </nav>
            </div>

            {shown.length === 0 ? (
              <p className="mt-4 font-hand text-2xl text-muted-foreground">Nothing here.</p>
            ) : (
              <ol className="mt-4 grid gap-3">
                {shown.map((item, i) => (
                  <li key={item.key} className="rounded-2xl border bg-card p-4 shadow-soft">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                      <span className="w-9 shrink-0 font-heading text-3xl leading-none text-muted-foreground tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-heading text-xl">{item.name}</span>
                          {item.category && <span className="text-sm text-muted-foreground">{item.category}</span>}
                        </p>
                        {/* A marker stroke as long as the number of asks */}
                        <div className="mt-2 flex items-center gap-3">
                          <svg aria-hidden viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 flex-1">
                            <path
                              d={`M1 5.5 Q ${(item.count / top) * 50} 3.5 ${Math.max(3, (item.count / top) * 99)} 5`}
                              stroke="var(--label, var(--brand))"
                              strokeWidth="7"
                              strokeLinecap="round"
                              fill="none"
                            />
                          </svg>
                          <span className="shrink-0 font-heading text-lg tabular-nums">
                            {item.count} <span className="font-sans text-sm font-normal text-muted-foreground">{item.count === 1 ? "ask" : "asks"}</span>
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.week > 0 ? `${item.week} this week · ` : ""}
                          last asked {relative(item.last)}
                          {item.teachers > 0 ? ` · ${item.teachers} from teachers` : ""}
                        </p>
                        {item.notes.length > 0 && (
                          <ul className="mt-2 grid gap-0.5">
                            {item.notes.map((n, k) => (
                              <li key={k} className="font-hand text-xl leading-snug">
                                &ldquo;{n.note}&rdquo;
                                {n.requester && <span className="text-muted-foreground"> {n.requester}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="w-full sm:w-auto">
                        <StatusPicker itemKey={item.key} name={item.name} status={item.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ---- The side: numbers, kinds, and the latest notes ---- */}
          <aside className="grid content-start gap-6">
            <div className="rounded-2xl border bg-card p-5 shadow-soft">
              <p className="text-sm text-muted-foreground">Requests this week</p>
              <p className="font-heading text-5xl leading-none tabular-nums">{thisWeek}</p>
              <p className="mt-1 font-hand text-xl text-muted-foreground">
                {thisWeek === lastWeek ? "same as" : thisWeek > lastWeek ? "up from" : "down from"} {lastWeek} last week
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t-2 border-dashed pt-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Different items</dt>
                  <dd className="font-heading text-2xl tabular-nums">{items.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">In {RANGES[days].toLowerCase()}</dt>
                  <dd className="font-heading text-2xl tabular-nums">{rows.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">At the 3D table</dt>
                  <dd className="font-heading text-2xl tabular-nums">{from3d}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">From teachers</dt>
                  <dd className="font-heading text-2xl tabular-nums">{fromTeachers}</dd>
                </div>
              </dl>
            </div>

            <section aria-labelledby="kinds-title">
              <h2 id="kinds-title" className="font-heading text-xl">
                What kind
              </h2>
              <ul className="mt-2 grid gap-2">
                {byCategory.map(([name, n]) => (
                  <li key={name} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-sm">
                    <span className="truncate">{name}</span>
                    <span className="h-3 rounded-[2px] bg-[var(--ledger,var(--chart-2))]" style={{ width: `${(n / byCategory[0][1]) * 100}%` }} />
                    <span className="text-right tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="latest-title">
              <h2 id="latest-title" className="font-heading text-xl">
                Latest
              </h2>
              <ul className="mt-2 grid gap-2">
                {rows.slice(0, 8).map((r, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-[3px] p-3 text-sm shadow-[0_2px_0_rgb(0_0_0/0.08)]",
                      i % 3 === 0 ? "bg-[#fff1a8] text-[#3a3000]" : i % 3 === 1 ? "bg-[#ffd9e6] text-[#4b0d27]" : "bg-[#d6f1ef] text-[#063b38]",
                      i % 2 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]",
                    )}
                  >
                    <p className="font-semibold">{r.item_name}</p>
                    {r.note && <p className="font-hand text-lg leading-tight">{r.note}</p>}
                    <p className="mt-1 text-xs opacity-70">
                      {r.requester ?? "Someone"}
                      {r.teacher_id ? " (teacher)" : ""} · {r.source === "store3d" ? "3D store" : "website"} ·{" "}
                      {storeToday(new Date(r.created_at)) === storeToday() ? formatTime(r.created_at) : formatDay(storeToday(new Date(r.created_at)))}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <p className="text-xs text-muted-foreground">
              Statuses show to students: &ldquo;{STATUS_LABEL.planned}&rdquo; and &ldquo;{STATUS_LABEL.stocked}&rdquo; appear next to the item when
              they ask for it; &ldquo;{STATUS_LABEL.declined}&rdquo; items stop showing in the list of what others are asking for.
            </p>
          </aside>
        </div>
      )}
    </>
  );
}

/** Every request in the last `days` days (newest first), staff's statuses, and the time now. */
async function loadRequests(days: number) {
  const { supabase } = await requireAdmin();
  const now = Date.now();
  const [requests, statuses] = await Promise.all([
    supabase
      .from("item_requests")
      .select("item_name, item_key, category, note, requester, source, teacher_id, created_at")
      .gte("created_at", new Date(now - days * 86400000).toISOString())
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.from("item_request_status").select("item_key, status, staff_note"),
  ]);
  if (requests.error) throw new Error(requests.error.message);
  return {
    rows: (requests.data ?? []) as Row[],
    statusOf: new Map((statuses.data ?? []).map((s) => [s.item_key, s.status as RequestStatus])),
    now,
  };
}

/** The value that shows up most (ties go to `prefer`, then the first one). */
function mostCommon(values: string[], prefer: (v: string) => boolean = () => false) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(prefer(b[0])) - Number(prefer(a[0])))[0]?.[0] ?? "";
}

function tally(values: string[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** "today", "yesterday", "3 days ago", or the date. */
function relative(iso: string) {
  const day = storeToday(new Date(iso));
  const today = storeToday();
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return `${diff} days ago`;
  return formatDay(day);
}
