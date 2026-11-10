import { Platform } from "react-native";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { type Absence, getToken, type Portal, unread } from "./api";
import { formatClock } from "./format";

/*
 * Notifications in the Android app, without any outside push service:
 *   - "Time to clock in": scheduled on the phone itself for each upcoming shift
 *     (5 minutes before it starts), from the schedule the app already has. They
 *     go off even if the app is closed. Shifts you said you'll miss are skipped.
 *   - New messages: a check every 15 minutes or so in the background (Android
 *     decides exactly when), and every 30 seconds while the app is open.
 */

const TASK = "firebirds-check-messages";
const SEEN = "firebirds-unread-seen";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks for permission (Android 13+) and sets up the notification channel. */
export async function setUpNotifications() {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Shifts and messages",
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
        content: { title: `${s.label} starts at ${formatClock(s.startsAt)}`, body: "Remember to clock in when you get to the store." },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: "default" },
      });
    }
  } catch {
    // ignore
  }
}

/** Shows "New message" when the unread count went up since the last check. */
export async function checkMessages(showNotice = true) {
  const n = await unread();
  const seen = Number((await SecureStore.getItemAsync(SEEN)) ?? "0");
  if (showNotice && n > seen) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n === 1 ? "New message" : `${n} new messages`, body: "Open the app to read them.", data: { tab: "messages" } },
      trigger: null,
    });
  }
  await SecureStore.setItemAsync(SEEN, String(n));
  return n;
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
