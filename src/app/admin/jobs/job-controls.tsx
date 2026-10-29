"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, UserXIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideApplication } from "./actions";

/** Hire / decline a résumé (with an optional note the player sees). */
export function HireButtons({ id, name }: { id: string; name: string }) {
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const go = (status: "hired" | "declined", message: string) =>
    start(async () => {
      const r = await decideApplication(id, status, note);
      if (r.error) toast.error(r.error);
      else toast.success(message);
    });
  return (
    <div className="grid gap-2">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for them (optional)" className="h-9" maxLength={200} />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => go("hired", `${name} is hired!`)}>
          {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Hire
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => go("declined", `${name} declined`)}>
          <XIcon /> Decline
        </Button>
      </div>
    </div>
  );
}

/** Let an employee go. */
export function FireButton({ id, name }: { id: string; name: string }) {
  const [busy, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await decideApplication(id, "fired", "Let go by the manager.");
          if (r.error) toast.error(r.error);
          else toast.success(`${name} was let go`);
        })
      }
    >
      <UserXIcon /> Let go
    </Button>
  );
}
