"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { deleteDeal } from "../actions";

/* Small pieces shared by the sale/deal form and the bundle form. */

export function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {(error || hint) && (
        <p id={`${id}-help`} className={cn("text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function MoneyInput({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`}
        className="h-10 pl-7"
      />
    </div>
  );
}

export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Save + delete buttons along the bottom of a deal form. */
export function FormFooter({
  saving,
  saveLabel,
  deleteTarget,
}: {
  saving: boolean;
  saveLabel: string;
  deleteTarget?: { kind: "promotion" | "bundle"; id: string; name: string };
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
      {deleteTarget ? (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" className="text-destructive">
              <Trash2Icon /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteTarget.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from the menu right away. Orders that already used it keep their prices. To pause it
                instead, switch it off.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  startDelete(async () => {
                    const r = await deleteDeal(deleteTarget.kind, deleteTarget.id);
                    if (r.ok) {
                      toast.success(`Deleted ${deleteTarget.name}`);
                      router.push("/admin/deals");
                    } else {
                      toast.error(r.message);
                      setOpen(false);
                    }
                  });
                }}
              >
                {deleting && <Loader2Icon className="animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <span />
      )}
      <Button type="submit" disabled={saving}>
        {saving && <Loader2Icon className="animate-spin" />}
        {saveLabel}
      </Button>
    </div>
  );
}
