"use client";

import { MessagesView, type MessagesActions } from "@/components/staff/messages-view";
import { NotificationsToggle } from "@/components/staff/notifications-toggle";
import { adminDirect, adminGroup, adminLeave, adminRemovePush, adminSavePush, adminSend, adminThread, adminThreads } from "../team-actions";

const actions: MessagesActions = { list: adminThreads, open: adminThread, send: adminSend, direct: adminDirect, group: adminGroup, leave: adminLeave };

export function AdminMessages({ initialChat }: { initialChat: string | null }) {
  return <MessagesView actions={actions} initialChat={initialChat} wide />;
}

/** "Turn on notifications" for the manager: absences, skipped restocks and messages. */
export function AdminNotifications({ vapidKey }: { vapidKey: string | null }) {
  return <NotificationsToggle vapidKey={vapidKey} save={adminSavePush} remove={adminRemovePush} />;
}
