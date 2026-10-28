import { formatClock, relativeDay } from "@/lib/format";
import { pickupDays, toMinutes, type StoreInfo } from "@/lib/ordering";

/**
 * What the OPEN sign on the store's front door says right now, as plain text:
 * a big word ("OPEN" or "CLOSED") and one short line under it.
 */
export function openSignText(info: StoreInfo): { title: string; line: string } {
  const days = pickupDays(info);
  const today = days.find((d) => d.isToday);
  const nextToday = today?.windows.find((w) => w.open);

  if (nextToday) {
    const orderBy = toMinutes(nextToday.window.starts_at) - info.order_lead_minutes;
    const hhmm = `${Math.floor(orderBy / 60)}:${String(orderBy % 60).padStart(2, "0")}`;
    return { title: "OPEN", line: `Order by ${formatClock(hhmm)}` };
  }

  const later = days.find((d) => !d.isToday && d.anyOpen);
  if (later) return { title: "OPEN", line: `Pickup ${relativeDay(later.date, info.today)}` };

  return { title: "CLOSED", line: "Online ordering" };
}
