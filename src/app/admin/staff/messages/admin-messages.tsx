"use client";

import { useState, useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { MessagesView, type MessagesActions } from "@/components/staff/messages-view";
import { Button } from "@/components/ui/button";
import { NotificationsToggle } from "@/components/staff/notifications-toggle";
import {
  adminDirect,
  adminGroup,
  adminLeave,
  adminRemovePush,
  adminSavePush,
  adminSend,
  adminThread,
  adminThreads,
  removeFirebaseKey,
  saveFirebaseKey,
} from "../team-actions";

const actions: MessagesActions = { list: adminThreads, open: adminThread, send: adminSend, direct: adminDirect, group: adminGroup, leave: adminLeave };

export function AdminMessages({ initialChat }: { initialChat: string | null }) {
  return <MessagesView actions={actions} initialChat={initialChat} wide />;
}

/** "Turn on notifications" for the manager: absences, skipped restocks and messages. */
export function AdminNotifications({ vapidKey }: { vapidKey: string | null }) {
  return <NotificationsToggle vapidKey={vapidKey} save={adminSavePush} remove={adminRemovePush} />;
}

/**
 * Instant notifications on the Android app: paste the Firebase service
 * account key here once. Kept in the database (app_secrets), never in the code.
 */
export function FirebaseSetup({ project, phones }: { project: string | null; phones: number }) {
  const [key, setKey] = useState("");
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(!project);

  return (
    <section aria-labelledby="fcm-title" className="mt-8 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="fcm-title" className="font-heading text-base font-semibold">
          Instant notifications on the Android app
        </h2>
        <span className={`text-sm font-medium ${project ? "text-success" : "text-muted-foreground"}`}>
          {project ? `On (${phones} phone${phones === 1 ? "" : "s"} connected)` : "Not set up yet"}
        </span>
      </div>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        {project
          ? "Messages, reminders and alerts reach Android phones the moment they're sent, with the message text, like a text."
          : "Without this, the Android app checks for messages about every 15 minutes. With it, they arrive instantly, like a text. It uses Google's free Firebase Cloud Messaging."}
      </p>
      {project && !open ? (
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Replace the key
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              start(async () => {
                if (!confirm("Turn off instant Android notifications?")) return;
                await removeFirebaseKey();
              })
            }
          >
            Turn off
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid max-w-2xl gap-2">
          <label htmlFor="fcm-key" className="text-sm font-medium">
            Firebase service account key (the whole downloaded .json file)
          </label>
          <textarea
            id="fcm-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            placeholder='{ "type": "service_account", "project_id": "…", … }'
            className="rounded-md border bg-background p-3 font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button
              disabled={busy || key.trim().length < 50}
              onClick={() =>
                start(async () => {
                  const r = await saveFirebaseKey(key);
                  if ("error" in r) return void toast.error(r.error);
                  setKey("");
                  setOpen(false);
                  toast.success(`Connected to Firebase project ${r.project}`);
                })
              }
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Check and save
            </Button>
            {project && (
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
