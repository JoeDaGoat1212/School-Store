/**
 * Which days and pickup windows students can order for right now.
 *
 * The database (place_order) has the final say. This file mirrors those
 * rules so the checkout page can grey out times that are already closed.
 */

export type PickupWindow = { id: number; label: string; starts_at: string };

export type StoreInfo = {
  store_name: string;
  store_hours: string;
  pickup_location: string;
  banner_text: string | null;
  today: string; // "YYYY-MM-DD" in Arizona
  now_time: string; // "HH:MM" in Arizona
  order_cutoff_time: string; // "HH:MM"
  order_lead_minutes: number;
  max_items_per_order: number;
  today_is_open: boolean;
  next_open_day: string | null;
  pickup_windows: PickupWindow[];
};

export type PickupDay = {
  date: string;
  isToday: boolean;
  /** Window id → can it still be ordered for? */
  windows: { window: PickupWindow; open: boolean }[];
  anyOpen: boolean;
};

/** "07:15" → 435 (minutes after midnight) */
export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The days a student can pick from (today and/or the next school day), with
 * each pickup window marked open or closed.
 */
export function pickupDays(info: StoreInfo): PickupDay[] {
  const days: PickupDay[] = [];
  const now = toMinutes(info.now_time);
  const beforeCutoff = now < toMinutes(info.order_cutoff_time);

  if (info.today_is_open) {
    const windows = info.pickup_windows.map((window) => ({
      window,
      open: beforeCutoff && now < toMinutes(window.starts_at) - info.order_lead_minutes,
    }));
    days.push({ date: info.today, isToday: true, windows, anyOpen: windows.some((w) => w.open) });
  }

  if (info.next_open_day) {
    const windows = info.pickup_windows.map((window) => ({ window, open: true }));
    days.push({ date: info.next_open_day, isToday: false, windows, anyOpen: windows.length > 0 });
  }

  return days;
}

/** A short line for the top of the menu about whether ordering is open. */
export function orderingStatus(info: StoreInfo) {
  const days = pickupDays(info);
  const today = days.find((d) => d.isToday && d.anyOpen);
  if (today) {
    const lastOpen = [...today.windows].reverse().find((w) => w.open);
    return { open: true, todayOpen: true, lastWindow: lastOpen?.window.label ?? null };
  }
  return { open: days.some((d) => d.anyOpen), todayOpen: false, lastWindow: null };
}
