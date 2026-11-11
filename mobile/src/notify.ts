import { Platform } from "react-native";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { type Absence, getToken, type Portal, savePushToken, unread } from "./api";
import { formatClock } from "./format";

/*
 * Notifications in the Android app.
 *
 * Instant (when the manager has connected Firebase on Team → Messages): the
 * phone registers with Google's push service and the store's server sends each
 * message the moment it's written, with who sent it and what they said, like a
 * text. Works even when the app is closed.
 *
 * Without Firebase, the app still:
 *   - schedules "time to clock in" on the phone itself, 5 minutes before each
 *     shift (shifts you said you'll miss are skipped);
 *   - checks for new messages every 10 seconds while open, and in the
 *     background about every 15 minutes (Android decides exactly when), and
 *     shows them with the sender and the text.
 */

const TASK = "firebirds-check-messages";
const SEEN = "firebirds-unread-seen";
const INSTANT = "firebirds-instant-push";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Is this phone getting messages instantly from the server? */
export async function hasInstantPush() {
  return (await SecureStore.getItemAsync(INSTANT)) === "1";
}

/** Asks for permission (Android 13+), sets up the channels, and connects for instant notifications if possible. */
export async function setUpNotifications() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("messages", {
        name: "Messages",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 180, 100, 180],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
      await Notifications.setNotificationChannelAsync("default", {
        name: "Shifts and alerts",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (!registered) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  } catch {
    // notifications are a bonus; the app works without them
  }
  // Instant notifications: only when this build includes Firebase.
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    if (typeof token.data === "string" && token.data.length > 20) {
      await savePushToken(token.data);
      await SecureStore.setItemAsync(INSTANT, "1");
    }
  } catch {
    await SecureStore.deleteItemAsync(INSTANT).catch(() => undefined);
  }
}

/** A shift's start in real time: store time is Arizona, always UTC−7. */
function shiftStart(date: string, startsAt: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = startsAt.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h + 7, min);
}

/** Re-plans the "time to clock in" reminders from the current schedule. */
export async function planShiftReminders(data: Portal, absences: Absence[]) {
  try {
    const planned = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(planned.filter((n) => n.identifier.startsWith("shift-")).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    const now = Date.now();
    for (const s of data.schedule) {
      if (absences.some((a) => a.date === s.date && (a.windowId === null || a.label === s.label))) continue;
      const at = shiftStart(s.date, s.startsAt) - 5 * 60000;
      if (at <= now + 30000) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `shift-${s.date}-${s.label}`.replace(/\s+/g, "-"),
        content: { title: `${s.label} starts at ${formatClock(s.startsAt)}`, body: "Remember to clock in when you get to the store.", data: { tab: "today" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: "default" },
      });
    }
    // Clocked in: a reminder to clock out an hour after clocking in (unless the
    // server sends it instantly; it does when this phone has instant notifications).
    if (data.open && !(await hasInstantPush())) {
      const at = new Date(data.open.in).getTime() + 60 * 60000;
      if (at > now + 30000) {
        await Notifications.scheduleNotificationAsync({
          identifier: `shift-out-${data.open.id}`,
          content: { title: "Still clocked in", body: "You've been clocked in for an hour. Clock out if your shift is over.", data: { tab: "today" } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: "default" },
        });
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Looks for new messages. When there are more unread than last time (and the
 * server isn't already sending them instantly), shows each new chat's latest
 * message: "Ben K" / "On my way". Returns the unread count.
 */
export async function checkMessages(showNotice = true) {
  const r = await unread();
  const seen = Number((await SecureStore.getItemAsync(SEEN)) ?? "0");
  if (showNotice && r.unread > seen && !(await hasInstantPush())) {
    for (const m of r.latest) {
      await Notifications.scheduleNotificationAsync({
        identifier: `chat-${m.chat}`,
        content: { title: m.title, body: m.unread > 1 ? `${m.body}  (+${m.unread - 1} more)` : m.body, data: { chat: m.chat, tab: "messages" } },
        trigger: Platform.OS === "android" ? { channelId: "messages" } : null,
      });
    }
  }
  await SecureStore.setItemAsync(SEEN, String(r.unread));
  return r.unread;
}

/** After reading messages: don't notify about ones already seen. */
export async function markMessagesSeen(n: number) {
  await SecureStore.setItemAsync(SEEN, String(n));
}

TaskManager.defineTask(TASK, async () => {
  try {
    if (await getToken()) await checkMessages(true);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});
