"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  FileSpreadsheetIcon,
  Loader2Icon,
  UploadCloudIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatDay } from "@/lib/format";
import {
  FIELDS,
  addFingerprints,
  buildLines,
  findHeaderRow,
  guessMapping,
  mappingProblems,
  matchProduct,
  sha256Hex,
  type Cell,
  type Mapping,
  type ParsedLine,
  type RowError,
} from "@/lib/sales-import";
import { eopToLines, eopTotal, looksLikeEop, parseEopRows, type EopReport } from "@/lib/end-of-period";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { readSpreadsheet } from "./read-file";
import { isImage, isPdf, readReport } from "./read-report";

/** Very large files are better split, so the upload doesn't time out. */
const MAX_LINES = 8000;
const NOT_IN_FILE = "-1";
const LEAVE = "leave";

type Product = { id: string; name: string };
type Step = "upload" | "columns" | "review" | "done";

type Review = {
  lines: (ParsedLine & { product_id: string | null })[];
  errors: RowError[];
  duplicateFingerprints: Set<string>;
};

type Result = { imported: number; duplicates: number; unmatched: number; eop?: EopReport[] };

export function ImportWizard({ products, aliases }: { products: Product[]; aliases: { alias: string; product_id: string }[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<{ name: string; hash: string; rows: Cell[][] } | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  // Unmatched item name (lowercase) → product id chosen in the preview, or LEAVE.
  const [links, setLinks] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);

  const aliasMap = useMemo(() => new Map(aliases.map((a) => [a.alias, a.product_id])), [aliases]);
  const nameMap = useMemo(() => new Map(products.map((p) => [p.name.toLowerCase(), p.id])), [products]);
  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);

  function reset() {
    setStep("upload");
    setFile(null);
    setMapping(null);
    setReview(null);
    setLinks({});
    setResult(null);
    setError(null);
  }

  // ---- Step 1: read the file ----------------------------------------------------
  async function onFile(f: File) {
    setError(null);
    setBusy(true);
    try {
      // A PDF or photo of the End of Period Summary: read the numbers off it and import them.
      if (isPdf(f) || isImage(f)) {
        await importEop(await readReport(f), f.name);
        return;
      }
      const [rows, hash] = await Promise.all([readSpreadsheet(f), f.arrayBuffer().then(sha256Hex)]);
      if (rows.length < 2) throw new Error("That file looks empty.");
      // An End of Period Summary has everything we need: import it right away, no questions.
      if (looksLikeEop(rows)) {
        await importEop(rows, f.name);
        return;
      }
      const header = findHeaderRow(rows);
      // Reuse the column choices from the last file with the same headers.
      const m = loadSavedMapping(rows[header]) ?? guessMapping(rows[header]);
      const loaded = { name: f.name, hash, rows };
      setFile(loaded);
      setHeaderRow(header);
      setMapping(m);

      // If every column was recognized, import straight away: no questions.
      // Item names that don't match a product yet can be linked afterwards, below.
      if (mappingProblems(m).length === 0) {
        try {
          const rv = await buildReview(loaded, header, m);
          setReview(rv);
          if (rv.lines.every((l) => rv.duplicateFingerprints.has(l.fingerprint))) {
            throw new Error("Everything in this file was already imported. Nothing was added.");
          }
          await saveImport(loaded, rv, m, {});
          return;
        } catch (autoError) {
          // Only fall back to the column picker if the columns were the problem.
          if (autoError instanceof Error && !/columns/i.test(autoError.message)) throw autoError;
        }
      }
      setStep("columns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  // ---- End of Period Summary: straight to "done" ---------------------------------
  async function importEop(rows: Cell[][], fileName: string) {
    const reports = parseEopRows(rows);
    const lines = await eopToLines(reports);
    const supabase = createClient();
    const { data, error: importError } = await supabase.rpc("import_sales", {
      p: {
        file_name: fileName,
        // Based on the reports themselves, so the same report in a different file is still caught.
        file_hash: await sha256Hex(`eop|${lines.map((l) => l.fingerprint).join("|")}`),
        row_count: lines.length,
        column_mapping: { format: "end_of_period" },
        aliases: [],
        lines: lines.map(({ row: _row, ...l }) => ({ ...l, product_id: null })),
      },
    });
    if (importError) {
      const hint = importError.hint || importError.message;
      throw new Error(/already imported/i.test(hint) ? `The End of Period Summary for ${reports.map((r) => formatDay(r.date)).join(", ")} is already in. Nothing was added.` : hint);
    }
    setResult({ ...(data as unknown as Result), eop: reports });
    setStep("done");
    toast.success("End of Period Summary imported");
    router.refresh();
  }

  /** The End of Period text, copied from the InTouchPay page and pasted in. */
  async function onPaste(text: string) {
    setError(null);
    setBusy(true);
    try {
      const rows = text.split(/\r?\n/).map((l) => [l]);
      if (!looksLikeEop(rows)) throw new Error("That doesn't look like an End of Period Summary. Copy the whole page, including the Grand Total.");
      await importEop(rows, `End of Period (pasted)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 2 → 3: build the lines and check for duplicates ----------------------
  /** Reads the sales lines and asks the database which are already imported. */
  async function buildReview(f: { rows: Cell[][] }, header: number, m: Mapping): Promise<Review> {
    saveMapping(f.rows[header], m);
    const { lines, errors } = buildLines(f.rows, header, m);
    if (lines.length === 0) throw new Error("No sales could be read with these columns. Check the column choices.");
    if (lines.length > MAX_LINES) {
      throw new Error(`This file has ${lines.length} sales. Please export a shorter date range (up to ${MAX_LINES} lines).`);
    }
    await addFingerprints(lines);

    const supabase = createClient();
    const duplicateFingerprints = new Set<string>();
    for (let i = 0; i < lines.length; i += 500) {
      const { data, error: dupError } = await supabase.rpc("existing_fingerprints", {
        p_fingerprints: lines.slice(i, i + 500).map((l) => l.fingerprint),
      });
      if (dupError) throw new Error(dupError.message);
      (data ?? []).forEach((fp: string) => duplicateFingerprints.add(fp));
    }

    return {
      lines: lines.map((l) => ({ ...l, product_id: matchProduct(l.raw_item_name, aliasMap, nameMap) })),
      errors,
      duplicateFingerprints,
    };
  }

  async function toReview() {
    if (!file || !mapping) return;
    setBusy(true);
    setError(null);
    try {
      setReview(await buildReview(file, headerRow, mapping));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 3 → 4: save ---------------------------------------------------------
  /** Saves the sales. `chosen` = unmatched item name (lowercase) → product picked in the preview. */
  async function saveImport(f: { name: string; hash: string }, rv: Review, m: Mapping, chosenLinks: Record<string, string>) {
    const chosen = (name: string) => {
      const v = chosenLinks[name.trim().toLowerCase()];
      return v && v !== LEAVE ? v : null;
    };
    const supabase = createClient();
    const { data, error: importError } = await supabase.rpc("import_sales", {
      p: {
        file_name: f.name,
        file_hash: f.hash,
        row_count: rv.lines.length + rv.errors.length,
        column_mapping: m,
        aliases: Object.entries(chosenLinks)
          .filter(([, id]) => id !== LEAVE)
          .map(([alias, product_id]) => ({ alias, product_id })),
        // `row` is only for error messages, so it isn't sent.
        lines: rv.lines.map((l) => ({
          sold_at: l.sold_at,
          sale_date: l.sale_date,
          raw_item_name: l.raw_item_name,
          product_id: l.product_id ?? chosen(l.raw_item_name),
          quantity: l.quantity,
          unit_price_cents: l.unit_price_cents,
          total_cents: l.total_cents,
          payment_type: l.payment_type,
          transaction_ref: l.transaction_ref,
          fingerprint: l.fingerprint,
        })),
      },
    });
    if (importError) throw new Error(importError.hint || importError.message);
    setResult(data as unknown as Result);
    setStep("done");
    toast.success("Sales imported");
    router.refresh();
  }

  async function runImport() {
    if (!file || !review || !mapping) return;
    setBusy(true);
    setError(null);
    try {
      await saveImport(file, review, mapping, links);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Numbers for the review step ------------------------------------------------
  const stats = useMemo(() => {
    if (!review) return null;
    const fresh = review.lines.filter((l) => !review.duplicateFingerprints.has(l.fingerprint));
    const dates = fresh.map((l) => l.sale_date).sort();
    const unmatched = new Map<string, { name: string; lines: number; units: number; total: number }>();
    for (const l of fresh.filter((x) => !x.product_id)) {
      const key = l.raw_item_name.trim().toLowerCase();
      const u = unmatched.get(key) ?? { name: l.raw_item_name.trim(), lines: 0, units: 0, total: 0 };
      u.lines += 1;
      u.units += l.quantity;
      u.total += l.total_cents;
      unmatched.set(key, u);
    }
    const sum = (list: ParsedLine[]) => list.reduce((s, l) => s + l.total_cents, 0);
    return {
      fresh,
      from: dates[0],
      to: dates.at(-1),
      revenue: sum(fresh),
      cash: sum(fresh.filter((l) => l.payment_type === "cash")),
      debit: sum(fresh.filter((l) => l.payment_type === "debit")),
      unmatched: [...unmatched.entries()].sort((a, b) => b[1].total - a[1].total),
    };
  }, [review]);

  const problems = mapping ? mappingProblems(mapping) : [];
  const headers = file ? file.rows[headerRow] : [];
  const firstData = file ? file.rows.slice(headerRow + 1).find((r) => r.some((c) => String(c ?? "").trim())) ?? [] : [];

  return (
    <section className="rounded-2xl border bg-card shadow-soft" aria-labelledby="import-heading">
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <h2 id="import-heading" className="font-heading text-lg font-semibold">
          Import sales
        </h2>
        {/* Steps only show when the file needs help with its columns; normally it's upload → done. */}
        {(step === "columns" || step === "review") && (
        <ol className="ml-auto flex flex-wrap items-center gap-2 text-sm" aria-label="Steps">
          {(["upload", "columns", "review", "done"] as Step[]).map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-4 bg-border" aria-hidden />}
              <span
                aria-current={step === s ? "step" : undefined}
                className={cn("rounded-full px-2.5 py-0.5", step === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {i + 1}. {["Upload", "Columns", "Review", "Done"][i]}
              </span>
            </li>
          ))}
        </ol>
        )}
      </div>

      <div className="p-5">
        {error && (
          <p role="alert" className="mb-4 flex gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        {step === "upload" && (
          <div className="grid gap-4">
            <DropZone busy={busy} onFile={onFile} />
            <PasteBox busy={busy} onPaste={onPaste} />
          </div>
        )}

        {step === "columns" && file && mapping && (
          <div className="grid gap-5">
            <p className="flex items-center gap-2 text-sm">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">· {file.rows.length - headerRow - 1} rows</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Tell us which column holds each piece of information. We guessed from the column names; we&apos;ll
              remember your choices for the next file like this one.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <label htmlFor={`col-${f.key}`} className="text-sm font-medium">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </label>
                  <Select
                    value={String(mapping[f.key])}
                    onValueChange={(v) => setMapping({ ...mapping, [f.key]: Number(v) })}
                  >
                    <SelectTrigger id={`col-${f.key}`} className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NOT_IN_FILE}>Not in this file</SelectItem>
                      {headers.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {String(h ?? "").trim() || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="truncate text-xs text-muted-foreground">
                    {mapping[f.key] >= 0 ? `e.g. ${showCell(firstData[mapping[f.key]])}` : " "}
                  </span>
                </div>
              ))}
            </div>
            {problems.length > 0 && (
              <ul className="grid gap-1 text-sm text-destructive">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={reset}>
                <ChevronLeftIcon /> Choose another file
              </Button>
              <Button onClick={toReview} disabled={busy || problems.length > 0}>
                {busy && <Loader2Icon className="animate-spin" />}
                Review sales
              </Button>
            </div>
          </div>
        )}

        {step === "review" && review && stats && (
          <div className="grid gap-6">
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="New sales lines" value={stats.fresh.length.toLocaleString()} />
              <Stat label="Dates" value={!stats.from ? "—" : stats.from === stats.to ? formatDay(stats.from) : `${formatDay(stats.from)} – ${formatDay(stats.to!)}`} small />
              <Stat label="Revenue" value={formatCents(stats.revenue)} />
              <Stat label="Cash / debit" value={`${formatCents(stats.cash)} / ${formatCents(stats.debit)}`} small />
            </dl>

            {review.duplicateFingerprints.size > 0 && (
              <p className="rounded-xl bg-muted px-4 py-3 text-sm">
                <strong>{review.duplicateFingerprints.size}</strong> line{review.duplicateFingerprints.size === 1 ? " was" : "s were"}{" "}
                already imported from another file and will be skipped.
              </p>
            )}

            {review.errors.length > 0 && (
              <details className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-warning">
                  {review.errors.length} row{review.errors.length === 1 ? "" : "s"} couldn&apos;t be read and will be skipped
                </summary>
                <ul className="mt-2 grid gap-0.5 text-muted-foreground">
                  {review.errors.slice(0, 50).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {stats.unmatched.length > 0 && (
              <div className="grid gap-3">
                <div>
                  <h3 className="font-heading text-base font-semibold">Items we don&apos;t recognize</h3>
                  <p className="text-sm text-muted-foreground">
                    Link each to a product so its sales count toward that product&apos;s stock and profit. Linked names
                    are remembered for next time. Unlinked sales still count toward total revenue.
                  </p>
                </div>
                <ul className="divide-y rounded-xl border">
                  {stats.unmatched.map(([key, u]) => (
                    <li key={key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="min-w-40 flex-1">
                        <span className="font-mono text-sm font-semibold">{u.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {u.units} sold · {formatCents(u.total)}
                        </span>
                      </span>
                      <Select value={links[key] ?? LEAVE} onValueChange={(v) => setLinks({ ...links, [key]: v })}>
                        <SelectTrigger className="h-9 w-56" aria-label={`Product for ${u.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={LEAVE}>Leave unlinked for now</SelectItem>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="mb-2 font-heading text-base font-semibold">Preview</h3>
              <div className="max-h-80 overflow-auto rounded-xl border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="pr-4">Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {review.lines.slice(0, 200).map((l) => {
                      const dup = review.duplicateFingerprints.has(l.fingerprint);
                      const linked = l.product_id ?? (links[l.raw_item_name.trim().toLowerCase()] !== LEAVE ? links[l.raw_item_name.trim().toLowerCase()] : null);
                      return (
                        <TableRow key={l.fingerprint} className={cn(dup && "opacity-45")}>
                          <TableCell className="pl-4 whitespace-nowrap">{formatDay(l.sale_date)}</TableCell>
                          <TableCell className="font-mono text-xs">{l.raw_item_name}</TableCell>
                          <TableCell>
                            {dup ? (
                              <Pill tone="neutral">Already imported</Pill>
                            ) : linked ? (
                              productName.get(linked)
                            ) : (
                              <Pill tone="warning">Not linked</Pill>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCents(l.total_cents)}</TableCell>
                          <TableCell className="pr-4 capitalize">{l.payment_type}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {review.lines.length > 200 && (
                <p className="mt-1 text-xs text-muted-foreground">Showing the first 200 of {review.lines.length} lines.</p>
              )}
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("columns")}>
                <ChevronLeftIcon /> Back to columns
              </Button>
              <Button onClick={runImport} disabled={busy || stats.fresh.length === 0} size="lg">
                {busy && <Loader2Icon className="animate-spin" />}
                {stats.fresh.length === 0 ? "Nothing new to import" : `Import ${stats.fresh.length.toLocaleString()} sale${stats.fresh.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && result?.eop && (
          <div className="grid justify-items-center gap-4 py-6 text-center">
            <CheckCircle2Icon className="size-10 text-success" />
            <p className="font-heading text-xl font-semibold">
              {result.eop.length === 1 ? `${formatDay(result.eop[0].date, { weekday: "long" })} is in` : `${result.eop.length} days are in`}
            </p>
            <div className="w-full max-w-md overflow-hidden rounded-xl border text-left text-sm">
              {result.eop.map((r) => (
                <dl key={r.date + r.reconcile} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b p-4 last:border-b-0">
                  <dt className="col-span-2 mb-1 font-semibold">
                    {formatDay(r.date)}
                    {r.reconcile && <span className="font-normal text-muted-foreground"> · Reconcile #{r.reconcile}</span>}
                  </dt>
                  {r.cash !== 0 && (<><dt className="text-muted-foreground">Cash</dt><dd className="text-right tabular-nums">{formatCents(r.cash)}</dd></>)}
                  {r.checks !== 0 && (<><dt className="text-muted-foreground">Checks</dt><dd className="text-right tabular-nums">{formatCents(r.checks)}</dd></>)}
                  {r.credit !== 0 && (<><dt className="text-muted-foreground">Card</dt><dd className="text-right tabular-nums">{formatCents(r.credit)}</dd></>)}
                  {r.account !== 0 && (<><dt className="text-muted-foreground">Account</dt><dd className="text-right tabular-nums">{formatCents(r.account)}</dd></>)}
                  {r.other !== 0 && (<><dt className="text-muted-foreground">Other</dt><dd className="text-right tabular-nums">{formatCents(r.other)}</dd></>)}
                  <dt className="mt-1 border-t pt-1 font-semibold">Total sales</dt>
                  <dd className="mt-1 border-t pt-1 text-right font-semibold tabular-nums">{formatCents(eopTotal(r))}</dd>
                </dl>
              ))}
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Added to your sales, profit and charts. The summary doesn&apos;t list items, so stock wasn&apos;t changed.
            </p>
            <Button variant="outline" onClick={reset}>
              Import another
            </Button>
          </div>
        )}

        {step === "done" && result && !result.eop && (
          <div className="grid justify-items-center gap-3 py-6 text-center">
            <CheckCircle2Icon className="size-10 text-success" />
            <p className="font-heading text-xl font-semibold">Imported {result.imported.toLocaleString()} sale{result.imported === 1 ? "" : "s"}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Stock was updated for those days (online orders that were already picked up weren&apos;t counted twice).
              {result.duplicates > 0 && ` ${result.duplicates} duplicate lines were skipped.`}
              {result.unmatched > 0 && ` ${result.unmatched} lines aren't linked to a product yet; link them below.`}
            </p>
            <Button variant="outline" onClick={reset} className="mt-2">
              Import another file
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function DropZone({ busy, onFile }: { busy: boolean; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={cn(
        "grid justify-items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      {busy ? <Loader2Icon className="size-8 animate-spin text-muted-foreground" /> : <UploadCloudIcon className="size-8 text-muted-foreground" />}
      <p className="font-medium">{busy ? "Reading the numbers…" : "Drop your End of Period Summary here"}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        PDF, photo, CSV or Excel. The sales totals go straight into your money charts. Nothing to fill in. A day that&apos;s
        already in is skipped.
      </p>
      <input
        ref={input}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,.pdf,application/pdf,image/*"
        className="sr-only"
        aria-label="Choose an End of Period Summary or sales file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button onClick={() => input.current?.click()} disabled={busy}>
        Choose file
      </Button>
    </div>
  );
}

/** For the End of Period Summary page: select all, copy, paste here. */
function PasteBox({ busy, onPaste }: { busy: boolean; onPaste: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <details className="group rounded-xl border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">Or paste an End of Period Summary</summary>
      <div className="mt-3 grid gap-2">
        <p className="text-sm text-muted-foreground">
          Open the End of Period page in InTouchPay, press Ctrl+A (⌘A on a Mac) to select everything, copy, and paste it here.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          aria-label="End of Period Summary text"
          placeholder={"End of Period Summary\nReconcile #: 10684\n10/29/2026\nCash 35.50\nCredit 186.00\nGrand Total 221.50"}
          className="w-full rounded-lg border bg-background p-3 font-mono text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
        <Button onClick={() => onPaste(text)} disabled={busy || !text.trim()} className="justify-self-end">
          {busy && <Loader2Icon className="animate-spin" />}
          Import it
        </Button>
      </div>
    </details>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-heading font-bold tabular-nums", small ? "text-base" : "text-2xl")}>{value}</dd>
    </div>
  );
}

function showCell(c: Cell) {
  if (c instanceof Date) return c.toISOString().slice(0, 10);
  return String(c ?? "").trim() || "(blank)";
}

// Column choices are remembered in this browser, keyed by the file's headers.
const mappingKey = (headers: Cell[]) => `import-mapping:${headers.map((h) => String(h ?? "").trim().toLowerCase()).join("|")}`;

function loadSavedMapping(headers: Cell[]): Mapping | null {
  try {
    const saved = localStorage.getItem(mappingKey(headers));
    return saved ? (JSON.parse(saved) as Mapping) : null;
  } catch {
    return null;
  }
}

function saveMapping(headers: Cell[], mapping: Mapping) {
  try {
    localStorage.setItem(mappingKey(headers), JSON.stringify(mapping));
  } catch {
    // Storage blocked: the guess will be used next time instead.
  }
}
