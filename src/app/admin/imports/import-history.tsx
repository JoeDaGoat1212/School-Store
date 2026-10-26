"use client";

import { useTransition } from "react";
import { HistoryIcon, Loader2Icon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/staff/page-header";
import { Pill } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents, formatDay, formatTime, storeToday } from "@/lib/format";
import { undoImport } from "./actions";

export type ImportRow = {
  id: string;
  file_name: string;
  created_at: string;
  date_from: string | null;
  date_to: string | null;
  imported_count: number;
  duplicate_count: number;
  revenue_cents: number;
  undone_at: string | null;
};

export function ImportHistory({ imports }: { imports: ImportRow[] }) {
  return (
    <section aria-labelledby="history-heading">
      <h2 id="history-heading" className="mb-3 font-heading text-lg font-semibold">
        Import history
      </h2>
      {imports.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No imports yet">
          Each file you import shows up here, with an Undo button in case something went wrong.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Uploaded</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Sales dates</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Undo</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => (
                <TableRow key={imp.id} className={imp.undone_at ? "opacity-60" : undefined}>
                  <TableCell className="pl-4 whitespace-nowrap">
                    {formatDay(storeToday(new Date(imp.created_at)))}
                    <span className="block text-xs text-muted-foreground">{formatTime(imp.created_at)}</span>
                  </TableCell>
                  <TableCell className="max-w-56 truncate font-medium">{imp.file_name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {imp.date_from && imp.date_to
                      ? imp.date_from === imp.date_to
                        ? formatDay(imp.date_from)
                        : `${formatDay(imp.date_from)} – ${formatDay(imp.date_to)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {imp.imported_count}
                    {imp.duplicate_count > 0 && (
                      <span className="block text-xs text-muted-foreground">{imp.duplicate_count} skipped</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(imp.revenue_cents)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {imp.undone_at ? <Pill tone="neutral">Undone</Pill> : <UndoButton imp={imp} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function UndoButton({ imp }: { imp: ImportRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />} Undo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this import?</AlertDialogTitle>
          <AlertDialogDescription>
            The {imp.imported_count} sales from {imp.file_name} are removed and stock is corrected for those days. You
            can import the file again afterward.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const result = await undoImport(imp.id);
                if (result.error) toast.error(result.error);
                else toast.success("Import undone");
              })
            }
          >
            Undo import
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
