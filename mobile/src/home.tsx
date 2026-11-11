import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Absence, loadAbsences, openRestock, type Portal, punch, type Restock, restockState, type RestockState, signOut, SignedOut, undo } from "./api";
import * as Notifications from "expo-notifications";
import { checkMessages, planShiftReminders } from "./notify";
import { HoldButton } from "./hold-button";
import { RestockFlow, RestockTab } from "./restock";
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
  weekCredit,
  weekdayShort,
} from "./format";
import { type Colors, radius, score, useColors } from "./theme";
import { Flame, Foil, glass, NEST, ShiftRing } from "./fx";

type Tab = "today" | "tasks" | "restock" | "chat" | "schedule" | "money";
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
      } else if (d.tab === "today" || d.tab === "schedule" || d.tab === "restock") setTab(d.tab);
      else if (d.tab === "messages") setTab("chat");
    };
    Notifications.getLastNotificationResponseAsync().then(go, () => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, []);
  const [unreadCount, setUnreadCount] = useState(0);
  const [restock, setRestock] = useState<Restock | null>(null);
  const [restockInfo, setRestockInfo] = useState<RestockState>({ state: "none" });
  const [restockBusy, setRestockBusy] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);

  // Is a restock check on my list? (A dot on the Restock tab and a to-do in Tasks.)
  const checkRestock = useCallback(() => void restockState().then(setRestockInfo, () => undefined), []);
  useEffect(() => {
    checkRestock();
    const t = setInterval(checkRestock, 30000);
    return () => clearInterval(t);
  }, [checkRestock, data?.open?.id]);

  const startRestockCheck = async () => {
    setRestockError(null);
    setRestockBusy(true);
    try {
      setRestock(await openRestock());
    } catch (e) {
      if (e instanceof SignedOut) return onSignedOut();
      setRestockError(e instanceof Error ? e.message : "Couldn't start the restock check.");
    } finally {
      setRestockBusy(false);
    }
  };
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

  // One tick a second for the timers and the live credit pass.
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
            <Text style={styles.name} numberOfLines={1}>
              <Text style={{ color: "#ff5a1f" }}>{data?.name.split(" ")[0] ?? " "}</Text>
              <Text style={{ color: c.ink }}>{data && data.name.includes(" ") ? ` ${data.name.split(" ").slice(1).join(" ")}` : ""}</Text>
            </Text>
          </View>
          <Pressable onPress={askSignOut} hitSlop={8} style={[styles.ghost, glass]}>
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
          <Today data={data} now={now} c={c} onRefresh={onRefresh} onSignedOut={onSignedOut} openSchedule={() => setTab("schedule")} onClockedOut={checkRestock} />
        ) : tab === "tasks" ? (
          <TasksTab
            c={c}
            restock={restockInfo.state}
            onRestock={() => {
              setTab("restock");
              if (restockInfo.state === "due") void startRestockCheck();
            }}
          />
        ) : tab === "restock" ? (
          <RestockTab info={restockInfo} c={c} busy={restockBusy} error={restockError} onStart={() => void startRestockCheck()} />
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
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: "rgba(11,12,16,0.88)" }} />

      {restock && (
        <RestockFlow
          session={restock}
          c={c}
          onClose={() => {
            setRestock(null);
            checkRestock();
          }}
        />
      )}

      {/* Tab bar */}
      <View style={[styles.tabs, { bottom: insets.bottom + 10, backgroundColor: "rgba(16,18,24,0.96)", borderColor: "rgba(255,255,255,0.1)", }]}>
        {(
          [
            ["today", "Today"],
            ["tasks", "Tasks"],
            ["restock", "Restock"],
            ["chat", "Chat"],
            ["schedule", "Shifts"],
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
              style={[styles.tab, on && { backgroundColor: c.orange }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={key === "chat" && unreadCount > 0 ? `${label}, ${unreadCount} unread` : key === "restock" && restockInfo.state === "due" ? `${label}, to do` : label}
            >
              <Text style={[styles.tabText, { color: on ? "#0b0b0b" : "rgba(255,255,255,0.55)", fontWeight: on ? "900" : "600" }]}>{label}</Text>
              <View
                style={[
                  styles.tabMark,
                  {
                    backgroundColor: (key === "chat" && unreadCount > 0) || (key === "restock" && restockInfo.state === "due") ? (on ? "#0b0b0b" : c.orange) : "transparent",
                  },
                ]}
              />
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
  onClockedOut,
}: {
  data: Portal;
  now: number;
  c: Colors;
  onRefresh: () => Promise<void>;
  onSignedOut: () => void;
  openSchedule: () => void;
  onClockedOut: () => void;
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
  const cap = rule.capCents ?? 1000;
  const earnedWeek = weekCredit(weekMinutes, rule);
  const blocks = Math.max(1, Math.ceil(cap / Math.max(1, rule.cents)));

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
        // After a shift, the restock check waits on the Restock tab.
        if (r.status === "out") onClockedOut();
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
      <View style={[styles.sheet, { backgroundColor: on ? "#0f2a28" : "#17191e", borderColor: on ? c.teal : "#262a31", borderWidth: on ? 1.5 : 1, padding: 20 }]}>
        <View style={[styles.row, { alignItems: "center" }]}>
          <View style={[styles.chip, { backgroundColor: on ? "rgba(47,208,194,0.15)" : "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: on ? "rgba(47,208,194,0.35)" : "rgba(255,255,255,0.1)" }]}>
            <View style={[styles.dot, { backgroundColor: on ? c.teal : "rgba(255,255,255,0.4)" }]} />
            <Text style={{ color: on ? c.teal : "rgba(255,255,255,0.7)", fontWeight: "800", fontSize: 14 }}>{on ? "On the clock" : "Off the clock"}</Text>
          </View>
          <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
            {clock.weekday}, {clock.date}
          </Text>
        </View>
        {on ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
              <Text style={[score, styles.timer]}>{timer.slice(0, -3)}</Text>
              <Text style={[score, { color: NEST[0], fontSize: 40, marginBottom: 10 }]}>{timer.slice(-2)}</Text>
            </View>
            {limit > 0 && <ShiftRing progress={progress} size={86} />}
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 }}>
            <Text style={[score, styles.timer]}>{clock.time}</Text>
            <Text style={[score, { color: c.orange, fontSize: 32, marginBottom: 12 }]}>{clock.ampm}</Text>
          </View>
        )}
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
          {on && data.open ? `Since ${formatTime(data.open.in)}${autoOutAt ? ` · ends on its own at ${formatTime(autoOutAt)}` : ""}` : "Hold the button when you get to the store."}
        </Text>
        <View style={{ marginTop: 18 }}>
          <HoldButton on={on} busy={busy} c={c} onComplete={doPunch} />
        </View>
        {note && (
          <View
            style={[
              styles.note,
              { backgroundColor: note.tone === "error" ? "rgba(255,107,87,0.18)" : note.tone === "auto" ? "rgba(242,181,68,0.2)" : "rgba(255,255,255,0.07)" },
            ]}
          >
            <Text style={{ color: "#fff", flex: 1, fontSize: 14, lineHeight: 19 }}>{note.text}</Text>
            {note.undo && (
              <Pressable onPress={() => doUndo(note.undo!)} hitSlop={8}>
                <Text style={{ color: "#fff", fontWeight: "800", textDecorationLine: "underline" }}>Undo</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* The Firebird Pass: store credit on a holographic card. A ticking clock shows it's live, not a screenshot. */}
      <Pass name={data.name} credit={data.creditCents} clock={`${clock.time}:${clock.seconds} ${clock.ampm}`} />

      {/* This week */}
      <View style={[styles.sheet, glass, { padding: 20, gap: 14 }]}>
        <View style={styles.row}>
          <Text style={styles.kicker}>THIS WEEK</Text>
          <Text style={[score, { color: c.ink, fontSize: 32 }]}>{formatMinutes(weekMinutes)}</Text>
        </View>
        <View style={[styles.row, { alignItems: "flex-end" }]}>
          <Text style={[score, { color: NEST[0], fontSize: 60, lineHeight: 62 }]}>{formatCents(earnedWeek)}</Text>
          <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: 8 }}>earned of {formatCents(cap).replace(".00", "")}</Text>
        </View>
        {/* One bar per $1: each one fills up as you work that hour. */}
        <View style={{ flexDirection: "row", gap: 5, alignItems: "flex-end" }}>
          {Array.from({ length: blocks }, (_, i) => {
            const fill = Math.min(1, Math.max(0, earnedWeek / rule.cents - i));
            return (
              <View key={i} style={[styles.block, { height: 38 + i * 3, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }]}>
                <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fill * 100}%`, backgroundColor: c.teal }} />
              </View>
            );
          })}
        </View>
        <Text style={{ color: c.ink, fontSize: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 12 }}>
          {earnedWeek >= cap ? (
            <Text style={{ fontWeight: "800", color: NEST[0] }}>Maxed out for this week. Nice work.</Text>
          ) : (
            <>
              Every hour adds <Text style={{ fontWeight: "800" }}>{formatCents(rule.cents).replace(".00", "")}</Text>. {formatCents(cap - earnedWeek)} left to earn this week.
            </>
          )}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, lineHeight: 17 }}>{ruleText(rule)}</Text>
      </View>

      {data.schedule[0] && (
        <Pressable onPress={openSchedule} style={[styles.sheet, glass, { paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 16 }]}>
          <View style={{ alignItems: "center", width: 48 }}>
            <Text style={{ color: c.orange, fontSize: 12, fontWeight: "700" }}>{weekdayShort(data.schedule[0].date)}</Text>
            <Text style={[score, { color: c.ink, fontSize: 34, lineHeight: 36 }]}>{dayOfMonth(data.schedule[0].date)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.small, { color: c.muted }]}>Next shift</Text>
            <Text style={{ color: c.ink, fontSize: 18, fontWeight: "700", marginTop: 2 }}>
              {relativeDay(data.schedule[0].date)}, {data.schedule[0].label}
            </Text>
            <Text style={{ color: c.muted, fontSize: 14 }}>{formatClock(data.schedule[0].startsAt)}</Text>
          </View>
        </Pressable>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- The pass */

function Pass({ name, credit, clock }: { name: string; credit: number; clock: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[styles.sheet, { backgroundColor: "#ff5a1f", borderColor: "#ff5a1f", borderWidth: 1, padding: 20 }]}
    >
      {size.w > 0 && <Foil width={size.w} height={size.h} />}
      <View style={{ position: "absolute", right: -26, bottom: -34 }}>
        <Flame size={200} />
      </View>
      <View style={[styles.row, { alignItems: "center" }]}>
        <Text style={{ color: "#0b0b0b", fontSize: 12, fontWeight: "900", letterSpacing: 3 }}>FIREBIRD PASS</Text>
        <View style={{ backgroundColor: "#0b0b0b", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}>
          <Text style={{ color: "#ff5a1f", fontSize: 11, fontWeight: "800" }}>Employee</Text>
        </View>
      </View>
      <Text style={{ color: "#0b0b0b", fontSize: 14, fontWeight: "700", marginTop: 16 }}>Store credit</Text>
      <Text style={[score, { color: "#0b0b0b", fontSize: 92, lineHeight: 94 }]}>
        {formatCents(credit)}
      </Text>
      <View style={[styles.passFoot, { borderTopColor: "rgba(0,0,0,0.2)" }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#0b0b0b", fontWeight: "800", fontSize: 17 }}>{name}</Text>
          <Text style={{ color: "rgba(0,0,0,0.7)", fontSize: 12 }}>Show this at the window to use your credit</Text>
        </View>
        <View style={{ backgroundColor: "#0b0b0b", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
          <Text style={{ color: "#ff5a1f", fontWeight: "800", fontVariant: ["tabular-nums"] }}>{clock}</Text>
        </View>
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- Schedule */

function Schedule({ data, now, c }: { data: Portal; now: number; c: Colors }) {
  const today = storeDay();
  const byDay = new Map<string, Portal["schedule"]>();
  for (const s of data.schedule) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);

  return (
    <>
      <View style={[styles.sheet, glass]}>
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

      <View style={[styles.sheet, glass]}>
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
      <View style={[styles.sheet, { backgroundColor: "#0f2a28", borderColor: c.teal, borderWidth: 1.5, padding: 20 }]}>
        <Text style={styles.kicker}>STORE CREDIT</Text>
        <Text style={[score, { color: NEST[0], fontSize: 88, lineHeight: 92, marginTop: 6 }]}>{formatCents(data.creditCents)}</Text>
        <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 4 }}>
          Earned {formatCents(data.earnedCents)} so far, {formatMinutes(data.workedMinutes)} worked in all
        </Text>
        <Text style={[styles.passFootText, { borderTopColor: "rgba(255,255,255,0.15)" }]}>
          Using credit? Tell the person at the window. They take it off here.
        </Text>
      </View>

      <View style={[styles.sheet, glass]}>
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
  name: { fontSize: 40, lineHeight: 42, fontFamily: score?.fontFamily, fontWeight: "700" },
  ghost: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  ghostText: { fontSize: 14, fontWeight: "500" },
  banner: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4 },
  sheet: { borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  sheetHead: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  h2: { fontSize: 16, fontWeight: "600" },
  kicker: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "800", letterSpacing: 2.5 },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  timer: { color: "#fff", fontSize: 92, lineHeight: 94 },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  block: { flex: 1, height: 60, borderRadius: radius.control, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  punch: { height: 56, borderRadius: radius.control, alignItems: "center", justifyContent: "center", marginTop: 18 },
  punchText: { color: "#000", fontSize: 18, fontWeight: "700" },
  note: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.control, padding: 12, marginTop: 12 },
  passFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 12 },
  passFootText: { color: "#fff", fontSize: 14, marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  empty: { padding: 20, textAlign: "center", fontSize: 14 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 12 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  tabs: { position: "absolute", left: 12, right: 12, flexDirection: "row", borderWidth: 1, borderRadius: 22, padding: 5 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 17, gap: 4, overflow: "hidden" },
  tabMark: { width: 5, height: 5, borderRadius: 3 },
  tabText: { fontSize: 12 },
});
