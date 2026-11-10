import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Absence, loadAbsences, type Portal, punch, type Restock, signOut, SignedOut, startRestock, undo } from "./api";
import * as Notifications from "expo-notifications";
import { checkMessages, planShiftReminders } from "./notify";
import { RestockFlow } from "./restock";
import { AbsencesCard, ChatTab, TasksTab } from "./team";
import {
  dayOfMonth,
  formatCents,
  formatClock,
  formatDay,
  formatMinutes,
  formatTime,
  greeting,
  minutesBetween,
  nowParts,
  relativeDay,
  ruleText,
  storeDay,
  weekdayShort,
} from "./format";
import { type Colors, radius, score, useColors } from "./theme";

type Tab = "today" | "tasks" | "chat" | "schedule" | "money";
type Note = { tone: "in" | "out" | "auto" | "error"; text: string; undo?: { id: string; token: string } } | null;

export function Home({
  data,
  error,
  onRefresh,
  onSignedOut,
}: {
  data: Portal | null;
  error: string | null;
  onRefresh: () => Promise<void>;
  onSignedOut: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("today");
  const [pulling, setPulling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [openChat, setOpenChat] = useState<string | null>(null);

  // Tapping a notification opens that chat (or the tab it's about).
  useEffect(() => {
    const go = (r: Notifications.NotificationResponse | null) => {
      const d = (r?.notification.request.content.data ?? {}) as { chat?: string; tab?: string };
      if (d.chat) {
        setTab("chat");
        setOpenChat(d.chat);
      } else if (d.tab === "today" || d.tab === "schedule") setTab(d.tab);
      else if (d.tab === "messages") setTab("chat");
    };
    Notifications.getLastNotificationResponseAsync().then(go, () => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, []);
  const [unreadCount, setUnreadCount] = useState(0);
  const [restock, setRestock] = useState<Restock | null>(null);
  const [absences, setAbsences] = useState<Absence[] | null>(null);

  useEffect(() => {
    loadAbsences().then(setAbsences, () => setAbsences([]));
  }, []);

  // "Time to clock in" reminders follow the schedule (and skip shifts you'll miss).
  useEffect(() => {
    if (data && absences) void planShiftReminders(data, absences);
  }, [data, absences]);

  // New messages while the app is open but you're not on Chat.
  useEffect(() => {
    if (tab === "chat") return;
    const check = () => void checkMessages(true).then(setUnreadCount, () => undefined);
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, [tab]);

  // One tick a second for the timers and the live discount pass.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // When a shift is about to end on its own, reload right after.
  const autoOut = data?.open && data.maxShiftMinutes > 0 ? new Date(data.open.in).getTime() + data.maxShiftMinutes * 60000 : null;
  useEffect(() => {
    if (!autoOut) return;
    const t = setTimeout(() => void onRefresh(), Math.max(1000, autoOut - Date.now() + 1500));
    return () => clearTimeout(t);
  }, [autoOut, onRefresh]);

  const pull = async () => {
    setPulling(true);
    await onRefresh();
    setPulling(false);
  };

  const askSignOut = () =>
    Alert.alert("Sign out?", "You'll need your name and PIN to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut().catch(() => undefined);
          onSignedOut();
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 110 + insets.bottom, gap: 12 }}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} tintColor={c.muted} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.small, { color: c.muted }]}>{greeting()}</Text>
            <Text style={[styles.name, { color: c.ink }]} numberOfLines={1}>
              {data?.name ?? " "}
            </Text>
          </View>
          <Pressable onPress={askSignOut} hitSlop={8} style={[styles.ghost, { borderColor: c.rule, backgroundColor: c.paper }]}>
            <Text style={[styles.ghostText, { color: c.muted }]}>Sign out</Text>
          </Pressable>
        </View>

        {error && (
          <View style={[styles.banner, { borderColor: c.red }]}>
            <Text style={{ color: c.red, fontWeight: "600" }}>{error}</Text>
          </View>
        )}

        {!data ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={c.muted} />
        ) : tab === "today" ? (
          <Today data={data} now={now} c={c} onRefresh={onRefresh} onSignedOut={onSignedOut} openSchedule={() => setTab("schedule")} onRestock={setRestock} />
        ) : tab === "tasks" ? (
          <TasksTab c={c} />
        ) : tab === "chat" ? (
          <ChatTab c={c} openChat={openChat} onOpenChat={setOpenChat} onUnread={setUnreadCount} />
        ) : tab === "schedule" ? (
          <>
            <Schedule data={data} now={now} c={c} />
            <AbsencesCard data={data} c={c} onChanged={setAbsences} />
          </>
        ) : (
          <Money data={data} c={c} />
        )}
      </ScrollView>

      {/* Keeps the phone's status bar readable over scrolled content. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: c.board }} />

      {restock && <RestockFlow session={restock} c={c} onClose={() => setRestock(null)} />}

      {/* Tab bar */}
      <View style={[styles.tabs, { paddingBottom: insets.bottom + 6, backgroundColor: c.paper, borderTopColor: c.rule }]}>
        {(
          [
            ["today", "Today"],
            ["tasks", "Tasks"],
            ["chat", "Chat"],
            ["schedule", "Schedule"],
            ["money", "Credit"],
          ] as const
        ).map(([key, label]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                Haptics.selectionAsync().catch(() => undefined);
                setTab(key);
              }}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.tabMark, { backgroundColor: on ? c.orange : "transparent" }]} />
              <Text style={[styles.tabText, { color: on ? c.ink : c.muted, fontWeight: on ? "700" : "500" }]}>
                {label}
                {key === "chat" && unreadCount > 0 ? ` (${unreadCount > 9 ? "9+" : unreadCount})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- Today */

function Today({
  data,
  now,
  c,
  onRefresh,
  onSignedOut,
  openSchedule,
  onRestock,
}: {
  data: Portal;
  now: number;
  c: Colors;
  onRefresh: () => Promise<void>;
  onSignedOut: () => void;
  openSchedule: () => void;
  onRestock: (r: Restock) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const loadedAt = useRef(Date.now());
  useEffect(() => {
    loadedAt.current = Date.now();
  }, [data]);

  const on = Boolean(data.open);
  // This week's minutes keep counting while they're on the clock.
  const live = on ? Math.max(0, Math.floor((now - loadedAt.current) / 60000)) : 0;
  const weekMinutes = data.weekMinutes + live;
  const rule = data.rule;
  const hours = Math.floor(weekMinutes / 60);
  const discount = Math.min(hours, rule.afterHours) * rule.pct;
  const intoHour = weekMinutes % 60;

  const elapsed = data.open ? Math.max(0, Math.floor((now - new Date(data.open.in).getTime()) / 1000)) : 0;
  const timer = `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const limit = data.maxShiftMinutes * 60;
  const progress = on && limit > 0 ? Math.min(1, elapsed / limit) : 0;
  const autoOutAt = data.open && data.maxShiftMinutes > 0 ? new Date(new Date(data.open.in).getTime() + data.maxShiftMinutes * 60000).toISOString() : null;
  const clock = nowParts(now);

  const doPunch = async () => {
    setBusy(true);
    try {
      const r = await punch();
      if (r.status === "pending") {
        setNote({ tone: "error", text: "Your account is waiting for the manager to approve it." });
      } else if (r.status === "auto") {
        setNote({ tone: "auto", text: `You were already clocked out automatically at ${formatTime(r.out)}. Tap Clock in to start a new shift.` });
      } else {
        setNote({
          tone: r.status,
          text:
            r.status === "in"
              ? `Clocked in at ${formatTime(r.in)}.${r.autoOutAt ? ` You'll be clocked out automatically at ${formatTime(r.autoOutAt)}.` : ""}`
              : `Clocked out. You worked ${formatMinutes(minutesBetween(r.in, r.out))}.`,
          undo: { id: r.id, token: r.undo },
        });
        // After every shift: the restock photos.
        if (r.status === "out") startRestock(r.id, r.undo).then(onRestock, () => undefined);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await onRefresh();
    } catch (e) {
      if (e instanceof SignedOut) return onSignedOut();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setNote({ tone: "error", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  const doUndo = async (u: { id: string; token: string }) => {
    setBusy(true);
    try {
      const r = await undo(u.id, u.token);
      setNote(r.ok ? null : { tone: "error", text: r.error ?? "Too late to undo. Ask your manager." });
      await onRefresh();
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : "Couldn't undo." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* The time clock */}
      <View style={[styles.sheet, { backgroundColor: c.dark, borderColor: c.dark, padding: 20 }]}>
        <Text style={[styles.small, { color: on ? "#3dd68c" : "rgba(255,255,255,0.6)", fontWeight: "600" }]}>{on ? "On the clock" : "Off the clock"}</Text>
        {on ? (
          <Text style={[score, styles.timer]}>{timer}</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <Text style={[score, styles.timer]}>{clock.time}</Text>
            <Text style={[score, { color: c.orange, fontSize: 30, marginBottom: 10 }]}>{clock.seconds}</Text>
          </View>
        )}
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
          {on && data.open ? `Since ${formatTime(data.open.in)}${autoOutAt ? `. Clocks out on its own at ${formatTime(autoOutAt)}` : ""}` : `${clock.weekday}, ${clock.date}`}
        </Text>
        {on && limit > 0 && (
          <View style={[styles.track, { backgroundColor: "rgba(255,255,255,0.1)", marginTop: 14 }]}>
            <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: "#3dd68c" }]} />
          </View>
        )}
        <Pressable
          onPress={doPunch}
          disabled={busy}
          style={({ pressed }) => [
            styles.punch,
            { backgroundColor: on ? "#ffffff" : c.orange, opacity: busy ? 0.6 : 1, transform: [{ translateY: pressed ? 1 : 0 }] },
          ]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.punchText}>{on ? "Clock out" : "Clock in"}</Text>}
        </Pressable>
        {note && (
          <View
            style={[
              styles.note,
              { backgroundColor: note.tone === "error" ? "rgba(255,107,87,0.18)" : note.tone === "auto" ? "rgba(242,181,68,0.2)" : "rgba(255,255,255,0.08)" },
            ]}
          >
            <Text style={{ color: "#fff", flex: 1, fontSize: 14, lineHeight: 19 }}>{note.text}</Text>
            {note.undo && (
              <Pressable onPress={() => doUndo(note.undo!)} hitSlop={8}>
                <Text style={{ color: "#fff", fontWeight: "700", textDecorationLine: "underline" }}>Undo</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* The discount pass: a ticking clock shows it's live, not a screenshot. */}
      <View style={[styles.sheet, { backgroundColor: c.orange, borderColor: c.orange, padding: 20 }]}>
        <Text style={[styles.small, { color: c.onOrange, fontWeight: "600" }]}>Employee discount</Text>
        <Text style={[score, { color: c.onOrange, fontSize: 96, lineHeight: 96, marginTop: 6 }]}>{discount}%</Text>
        <Text style={{ color: c.onOrange, fontSize: 18, fontWeight: "600" }}>off everything</Text>
        <View style={[styles.passFoot, { borderTopColor: "rgba(0,0,0,0.15)" }]}>
          <View>
            <Text style={{ color: c.onOrange, fontWeight: "700", fontSize: 15 }}>{data.name}</Text>
            <Text style={{ color: c.onOrange, opacity: 0.75, fontSize: 12 }}>Show this at the window</Text>
          </View>
          <Text style={{ color: c.onOrange, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
            {clock.date}, {clock.time}:{clock.seconds} {clock.ampm}
          </Text>
        </View>
        {discount === 0 && <Text style={{ color: c.onOrange, marginTop: 8, fontWeight: "500" }}>Work an hour this week to unlock {rule.pct}% off.</Text>}
      </View>

      {/* This week */}
      <View style={[styles.sheet, { backgroundColor: c.paper, borderColor: c.rule, padding: 20, gap: 14 }]}>
        <View style={styles.row}>
          <Text style={[styles.h2, { color: c.ink }]}>This week</Text>
          <Text style={[score, { color: c.ink, fontSize: 32 }]}>{formatMinutes(weekMinutes)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {Array.from({ length: rule.afterHours }, (_, i) => {
            const done = hours > i;
            const current = hours === i;
            return (
              <View key={i} style={{ flex: 1, gap: 6, alignItems: "center" }}>
                <View style={[styles.track, { backgroundColor: c.track, alignSelf: "stretch" }]}>
                  <View style={[styles.fill, { backgroundColor: c.orange, width: done ? "100%" : current ? `${(intoHour / 60) * 100}%` : "0%" }]} />
                </View>
                <Text style={{ fontSize: 12, color: done ? c.ink : c.muted, fontWeight: "500" }}>{(i + 1) * rule.pct}%</Text>
              </View>
            );
          })}
        </View>
        <View style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule, paddingTop: 12, justifyContent: "flex-start", gap: 8 }]}>
          <Text style={[score, { color: c.ink, fontSize: 26 }]}>{60 - intoHour}m</Text>
          <Text style={{ color: c.ink, fontSize: 14, flex: 1 }}>
            more work for{" "}
            <Text style={{ fontWeight: "700" }}>{hours < rule.afterHours ? `+${rule.pct}% off` : `+${formatCents(rule.cents).replace(".00", "")} credit`}</Text>
          </Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>{ruleText(rule)}</Text>
      </View>

      {data.schedule[0] && (
        <Pressable onPress={openSchedule} style={[styles.sheet, { backgroundColor: c.paper, borderColor: c.rule, paddingHorizontal: 20, paddingVertical: 14 }]}>
          <Text style={[styles.small, { color: c.muted }]}>Next shift</Text>
          <Text style={{ color: c.ink, fontSize: 16, fontWeight: "600", marginTop: 2 }}>
            {relativeDay(data.schedule[0].date)}, {data.schedule[0].label}, {formatClock(data.schedule[0].startsAt)}
          </Text>
        </Pressable>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Schedule */

function Schedule({ data, now, c }: { data: Portal; now: number; c: Colors }) {
  const today = storeDay();
  const byDay = new Map<string, Portal["schedule"]>();
  for (const s of data.schedule) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);

  return (
    <>
      <View style={[styles.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
        <Text style={[styles.h2, styles.sheetHead, { color: c.ink, borderBottomColor: c.rule }]}>My schedule</Text>
        {byDay.size === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>You're not on the schedule yet. Ask your manager.</Text>
        ) : (
          [...byDay.entries()].map(([date, list], i) => (
            <View key={date} style={[styles.dayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}>
              <View style={{ width: 52, alignItems: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: date === today ? c.orange : c.muted }}>{weekdayShort(date)}</Text>
                <Text style={[score, { fontSize: 32, color: date === today ? c.orange : c.ink }]}>{dayOfMonth(date)}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                {list.map((s) => (
                  <View key={s.label} style={styles.row}>
                    <Text style={{ color: c.ink, fontSize: 16, fontWeight: "500" }}>{s.label}</Text>
                    <Text style={{ color: c.muted, fontSize: 14, fontVariant: ["tabular-nums"] }}>{formatClock(s.startsAt)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={[styles.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
        <Text style={[styles.h2, styles.sheetHead, { color: c.ink, borderBottomColor: c.rule }]}>My shifts</Text>
        {data.shifts.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>No shifts yet.</Text>
        ) : (
          data.shifts.map((s, i) => (
            <View key={s.in} style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}>
              <Text style={{ width: 96, color: c.ink, fontWeight: "500" }}>{formatDay(storeDay(new Date(s.in).getTime()))}</Text>
              <Text style={{ flex: 1, color: c.muted }}>
                {formatTime(s.in)} – {s.out ? formatTime(s.out) : "now"}
                {s.phone ? "  (phone)" : ""}
              </Text>
              <Text style={{ color: c.ink, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{formatMinutes(minutesBetween(s.in, s.out, now))}</Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}

/* ---------------------------------------------------------------- Credit */

function Money({ data, c }: { data: Portal; c: Colors }) {
  return (
    <>
      <View style={[styles.sheet, { backgroundColor: c.dark, borderColor: c.dark, padding: 20 }]}>
        <Text style={[styles.small, { color: "rgba(255,255,255,0.65)", fontWeight: "600" }]}>Store credit</Text>
        <Text style={[score, { color: "#fff", fontSize: 80, lineHeight: 84, marginTop: 6 }]}>{formatCents(data.creditCents)}</Text>
        <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 4 }}>
          Earned {formatCents(data.earnedCents)} so far, {formatMinutes(data.workedMinutes)} worked in all
        </Text>
        <Text style={[styles.passFootText, { borderTopColor: "rgba(255,255,255,0.15)" }]}>
          Using credit? Tell the person at the window. They take it off here.
        </Text>
      </View>

      <View style={[styles.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
        <Text style={[styles.h2, styles.sheetHead, { color: c.ink, borderBottomColor: c.rule }]}>Credit used and added</Text>
        {data.credit.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>Nothing yet.</Text>
        ) : (
          data.credit.map((x, i) => (
            <View key={`${x.at}-${i}`} style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}>
              <Text style={{ width: 76, fontWeight: "700", color: x.cents < 0 ? c.red : c.green, fontVariant: ["tabular-nums"] }}>
                {x.cents < 0 ? "−" : "+"}
                {formatCents(Math.abs(x.cents))}
              </Text>
              <Text style={{ flex: 1, color: c.ink }} numberOfLines={1}>
                {x.note ?? (x.cents < 0 ? "Used" : "Added")}
              </Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{formatDay(storeDay(new Date(x.at).getTime()))}</Text>
            </View>
          ))
        )}
      </View>
      <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 }}>{ruleText(data.rule)}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  small: { fontSize: 13 },
  name: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  ghost: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 8 },
  ghostText: { fontSize: 14, fontWeight: "500" },
  banner: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4 },
  sheet: { borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sheetHead: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  h2: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  timer: { color: "#fff", fontSize: 76, lineHeight: 82, marginTop: 4 },
  track: { height: 5, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  punch: { height: 56, borderRadius: radius.control, alignItems: "center", justifyContent: "center", marginTop: 18 },
  punchText: { color: "#000", fontSize: 18, fontWeight: "700" },
  note: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.control, padding: 12, marginTop: 12 },
  passFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12 },
  passFootText: { color: "#fff", fontSize: 14, marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  empty: { padding: 20, textAlign: "center", fontSize: 14 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 12 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  tabs: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 0 },
  tab: { flex: 1, alignItems: "center", paddingTop: 0, paddingBottom: 8, gap: 8 },
  tabMark: { height: 2, alignSelf: "stretch", marginHorizontal: 14 },
  tabText: { fontSize: 13 },
});
