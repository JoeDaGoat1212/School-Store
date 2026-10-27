"use client";

import { useState, useTransition } from "react";
import {
  ArrowRightIcon,
  BanIcon,
  CheckCheckIcon,
  Loader2Icon,
  MoreVerticalIcon,
  RotateCcwIcon,
  StickyNoteIcon,
  UserXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { formatOrderNumber } from "@/config/brand";
import { formatCents, formatTime } from "@/lib/format";
import { NEXT_STATUS, OPEN_STATUSES, ORDER_STATUS, type OrderStatus } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import type { QueueOrder } from "./load-orders";
import { saveStaffNote, setOrderStatus } from "./actions";

/** The big button's label for each step. */
const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  received: "Start preparing",
  preparing: "Mark ready",
  ready: "Picked up & paid",
};

/** One step back, for fixing a mis-tap. */
const PREVIOUS_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  preparing: "received",
  ready: "preparing",
  picked_up: "ready",
  canceled: "received",
  no_show: "received",
  expired: "received",
};

export function OrderCard({ order }: { order: QueueOrder }) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"canceled" | "no_show" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const next = NEXT_STATUS[order.status];
  const previous = PREVIOUS_STATUS[order.status];
  const isOpen = OPEN_STATUSES.includes(order.status);
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  const number = formatOrderNumber(order.order_number);

  /** Change status, then offer an Undo in the toast. */
  function moveTo(status: OrderStatus) {
    const from = order.status;
    startTransition(async () => {
      const result = await setOrderStatus(order.id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${number} → ${ORDER_STATUS[status].label}`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await setOrderStatus(order.id, from);
            if (undo.error) toast.error(undo.error);
          },
        },
      });
    });
  }

  return (
    <article
      aria-label={`Order ${number}`}
      className={cn(
        "flex flex-col rounded-2xl border bg-card shadow-soft transition-opacity",
        !isOpen && "opacity-75",
        order.status === "ready" && "border-success/50 ring-1 ring-success/30",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-2xl leading-none font-extrabold tracking-tight tabular-nums">{number}</p>
          <p className="mt-1.5 truncate font-semibold">
            {order.first_name} {order.last_name}
            <span className="font-normal text-muted-foreground"> · {order.grade}</span>
            {order.member && (
              <span className="ml-1.5 rounded-md bg-teal/20 px-1.5 py-0.5 align-middle text-[0.7rem] font-semibold text-teal-ink">
                Member
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">Ordered {formatTime(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${number}`} className="-mt-1 -mr-2">
              <MoreVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
              <StickyNoteIcon /> {order.staff_notes ? "Edit note" : "Add note"}
            </DropdownMenuItem>
            {previous && (
              <DropdownMenuItem onSelect={() => moveTo(previous)}>
                <RotateCcwIcon /> {isOpen || order.status === "picked_up" ? "Back to" : "Reopen as"}{" "}
                {ORDER_STATUS[previous].label}
              </DropdownMenuItem>
            )}
            {isOpen && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setConfirm("no_show")}>
                  <UserXIcon /> Mark no-show
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("canceled")}>
                  <BanIcon /> Cancel order
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* What to pack: loose items, then each bundle with what's inside it. */}
      <ul className="mx-4 grid gap-1 border-t py-3 text-sm">
        {order.items
          .filter((item) => !item.order_bundle_id)
          .map((item, i) => (
            <li key={`${item.product_name}-${i}`} className="flex gap-2">
              <span className="w-7 shrink-0 font-heading font-bold tabular-nums">{item.quantity}×</span>
              <span className="flex-1">{item.product_name}</span>
            </li>
          ))}
        {order.bundles.map((b) => (
          <li key={b.id}>
            <div className="flex gap-2">
              <span className="w-7 shrink-0 font-heading font-bold tabular-nums">{b.quantity}×</span>
              <span className="flex-1 font-medium">{b.bundle_name}</span>
            </div>
            <ul className="ml-9 text-muted-foreground">
              {order.items
                .filter((item) => item.order_bundle_id === b.id)
                .map((item) => (
                  <li key={item.product_name}>
                    {item.quantity}× {item.product_name}
                  </li>
                ))}
            </ul>
          </li>
        ))}
        {order.discounts.map((d) => (
          <li key={d.label} className="flex gap-2 text-xs font-medium text-ember-ink">
            <span className="w-7 shrink-0" />
            <span className="flex-1">{d.label}</span>
            <span className="tabular-nums">−{formatCents(d.amount_cents)}</span>
          </li>
        ))}
      </ul>

      {order.staff_notes && (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="mx-4 mb-3 flex gap-2 rounded-lg bg-sticker/25 px-3 py-2 text-left text-sm"
        >
          <StickyNoteIcon className="mt-0.5 size-3.5 shrink-0" />
          {order.staff_notes}
        </button>
      )}

      <div className="mt-auto flex items-center gap-3 border-t p-4 pt-3">
        <div className="text-sm">
          <span className="font-heading text-lg font-bold tabular-nums">{formatCents(order.total_cents)}</span>
          <span className="text-muted-foreground"> · {itemCount} item{itemCount === 1 ? "" : "s"}</span>
        </div>
        {next && (
          <Button
            onClick={() => moveTo(next)}
            disabled={pending}
            className={cn(
              "ml-auto h-10 px-4",
              next === "picked_up" && "bg-success text-white hover:bg-success/85",
            )}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : next === "picked_up" ? <CheckCheckIcon /> : <ArrowRightIcon />}
            {NEXT_LABEL[order.status]}
          </Button>
        )}
      </div>

      {/* Cancel / no-show confirmation */}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "canceled" ? `Cancel ${number}?` : `Mark ${number} as a no-show?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The {itemCount} reserved item{itemCount === 1 ? "" : "s"} go back to being available on the menu.
              {confirm === "canceled" ? " The student will see “Canceled” if they check their order." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "canceled" ? "destructive" : "default"}
              onClick={() => confirm && moveTo(confirm)}
            >
              {confirm === "canceled" ? "Cancel order" : "Mark no-show"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        orderId={order.id}
        number={number}
        initial={order.staff_notes ?? ""}
      />
    </article>
  );
}

function NoteDialog({
  open,
  onOpenChange,
  orderId,
  number,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  number: string;
  initial: string;
}) {
  const [saving, startSaving] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          action={(formData) =>
            startSaving(async () => {
              const result = await saveStaffNote(orderId, String(formData.get("note") ?? ""));
              if (result.error) toast.error(result.error);
              else {
                toast.success("Note saved");
                onOpenChange(false);
              }
            })
          }
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Note for {number}</DialogTitle>
            <DialogDescription>Only staff can see this.</DialogDescription>
          </DialogHeader>
          <Textarea
            name="note"
            defaultValue={initial}
            rows={4}
            maxLength={500}
            aria-label="Note"
            placeholder="e.g. Out of Cool Blue, gave Fruit Punch"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2Icon className="animate-spin" />}
              Save note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
