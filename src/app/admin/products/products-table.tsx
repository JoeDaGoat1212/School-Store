"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontalIcon, PackageIcon, PencilIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { ProductArt } from "@/components/product-art";
import { EmptyState } from "@/components/staff/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setArchived, setAvailableOnline } from "./actions";

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  emoji: string | null;
  photo_path: string | null;
  price_cents: number;
  unit_cost_cents: number;
  stock: number;
  reserved: number;
  reorder_point: number;
  available_online: boolean;
  archived: boolean;
  tags: string[];
  supplier: string | null;
  aliasCount: number;
};

type View = "active" | "archived";

export function ProductsTable({ rows }: { rows: ProductRow[] }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("active");
  const [category, setCategory] = useState<string>("All");
  const [pending, startTransition] = useTransition();

  const categories = useMemo(() => ["All", ...new Set(rows.map((r) => r.category))], [rows]);

  const visible = rows.filter(
    (r) =>
      r.archived === (view === "archived") &&
      (category === "All" || r.category === category) &&
      r.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const archivedCount = rows.filter((r) => r.archived).length;

  function run(action: () => Promise<{ error?: string; ok?: boolean }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else toast.success(success);
    });
  }

  return (
    <div className="grid gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search products"
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>

        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                category === c ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="ml-auto inline-flex rounded-lg bg-muted p-1" role="group" aria-label="Show">
          {(["active", "archived"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                view === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "active" ? "Active" : `Archived (${archivedCount})`}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title={view === "archived" ? "No archived products" : query ? "No products match" : "No products yet"}
          action={
            view === "active" && !query ? (
              <Button asChild>
                <Link href="/admin/products/new">Add your first product</Link>
              </Button>
            ) : undefined
          }
        >
          {view === "archived"
            ? "Archived products are hidden from the menu but keep their sales history."
            : query
              ? "Try a different search or category."
              : "Add what the store sells to build the menu."}
        </EmptyState>
      ) : (
        <div className={cn("overflow-x-auto rounded-2xl border bg-card shadow-soft", pending && "opacity-70")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Product</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Online</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => {
                const available = p.stock - p.reserved;
                const margin = p.price_cents > 0 ? (p.price_cents - p.unit_cost_cents) / p.price_cents : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="py-2.5 pl-4">
                      <Link href={`/admin/products/${p.id}`} className="group flex items-center gap-3">
                        <ProductArt
                          name={p.name}
                          photoPath={p.photo_path}
                          emoji={p.emoji}
                          category={p.category}
                          className="size-11 shrink-0 rounded-lg"
                          emojiClassName="text-2xl"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold group-hover:underline">{p.name}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {p.category}
                            {p.supplier && <> · {p.supplier}</>}
                            {p.aliasCount === 0 && (
                              <Pill tone="warning" className="ml-1 px-1.5 py-0 text-[0.65rem]">
                                No InTouchPay name
                              </Pill>
                            )}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCents(p.price_cents)}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatCents(p.unit_cost_cents)}
                    </TableCell>
                    <TableCell
                      className={cn("text-right tabular-nums", margin < 0.3 ? "text-warning" : "text-muted-foreground")}
                    >
                      {Math.round(margin * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {available <= 0 ? (
                        <Pill tone="danger">Out</Pill>
                      ) : available <= p.reorder_point ? (
                        <Pill tone="warning">{available}</Pill>
                      ) : (
                        <span>{available}</span>
                      )}
                      {p.reserved > 0 && (
                        <span className="block text-xs text-muted-foreground">{p.reserved} reserved</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.available_online}
                        disabled={p.archived || pending}
                        aria-label={`Show ${p.name} on the online menu`}
                        onCheckedChange={(on) =>
                          run(
                            () => setAvailableOnline(p.id, on),
                            on ? `${p.name} is on the menu` : `${p.name} is hidden from the menu`,
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="pr-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`More actions for ${p.name}`}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/products/${p.id}`}>
                              <PencilIcon /> Edit
                            </Link>
                          </DropdownMenuItem>
                          {p.archived ? (
                            <DropdownMenuItem onSelect={() => run(() => setArchived(p.id, false), `Restored ${p.name}`)}>
                              <ArchiveRestoreIcon /> Restore
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => run(() => setArchived(p.id, true), `Archived ${p.name}`)}>
                              <ArchiveIcon /> Archive
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
