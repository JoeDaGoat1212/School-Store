"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveTeacherSettings, setTeacherStatus } from "./actions";

/** Approve / decline / turn off / turn back on, for one teacher. */
export function TeacherButtons({ id, name, status }: { id: string; name: string; status: "pending" | "approved" | "removed" }) {
  const [busy, start] = useTransition();
  const go = (next: "approved" | "removed", message: string) =>
    start(async () => {
      const r = await setTeacherStatus(id, next);
      if (r.error) toast.error(r.error);
      else toast.success(message);
    });

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => go("approved", `${name} approved`)}>
          {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Approve
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => go("removed", `${name} declined`)}>
          <XIcon /> Decline
        </Button>
      </div>
    );
  }
  if (status === "approved") {
    return (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => go("removed", `Teacher prices off for ${name}`)} className="text-destructive">
        Turn off
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={() => go("approved", `${name} is back on`)}>
      <RotateCcwIcon /> Turn back on
    </Button>
  );
}

/** "Teacher price = cost + $0.50" and the room service switch. */
export function TeacherSettings({ markupCents, roomService }: { markupCents: number; roomService: boolean }) {
  const [markup, setMarkup] = useState((markupCents / 100).toFixed(2));
  const [on, setOn] = useState(roomService);
  const [busy, start] = useTransition();
  const dirty = markup !== (markupCents / 100).toFixed(2) || on !== roomService;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveTeacherSettings({ markup, room_service: on });
          if (r.error) toast.error(r.error);
          else toast.success("Teacher settings saved");
        });
      }}
      className="grid gap-4"
    >
      <div className="grid gap-2">
        <Label htmlFor="markup">Teacher price = cost +</Label>
        <div className="relative w-32">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">$</span>
          <Input id="markup" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} className="h-10 pl-7" />
        </div>
        <p className="text-xs text-muted-foreground">Never more than the normal price.</p>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="room-service">Room service</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Off: teachers can still order, but pick up at the window.</p>
        </div>
        <Switch id="room-service" checked={on} onCheckedChange={setOn} />
      </div>
      <Button type="submit" disabled={busy || !dirty} className="w-fit">
        {busy && <Loader2Icon className="animate-spin" />} Save
      </Button>
    </form>
  );
}
