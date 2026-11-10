import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import {
  type Absence,
  cancelAbsent,
  type ChatMessage,
  type Contact,
  leaveGroup,
  loadAbsences,
  loadTasks,
  loadThread,
  loadThreads,
  makeGroup,
  markAbsent,
  openDirect,
  type Portal,
  sendMessage,
  setTask,
  type Task,
  type Thread,
} from "./api";
import { formatClock, relativeDay } from "./format";
import { markMessagesSeen } from "./notify";
import { type Colors, radius } from "./theme";

/* ================================================================ Tasks */

export function TasksTab({ c }: { c: Colors }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await loadTasks());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load tasks.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (t: Task) => {
    Haptics.selectionAsync().catch(() => undefined);
    setTasks((list) => list?.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) ?? null);
    try {
      await setTask(t.id, !t.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      void load();
    }
  };

  const done = tasks?.filter((t) => t.done).length ?? 0;
  return (
    <View style={[s.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
      <View style={[s.head, { borderBottomColor: c.rule }]}>
        <Text style={[s.h2, { color: c.ink }]}>Today's tasks</Text>
        {tasks && tasks.length > 0 && (
          <Text style={{ color: c.muted, fontSize: 14 }}>
            {done} of {tasks.length} done
          </Text>
        )}
      </View>
      {error && <Text style={[s.error, { color: c.red }]}>{error}</Text>}
      {tasks === null ? (
        <ActivityIndicator style={{ margin: 24 }} color={c.muted} />
      ) : tasks.length === 0 ? (
        <Text style={[s.empty, { color: c.muted }]}>No tasks today. Ask the manager if you're not sure what to do.</Text>
      ) : (
        tasks.map((t, i) => (
          <Pressable key={t.id} onPress={() => toggle(t)} style={[s.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}>
            <View style={[s.box, { borderColor: t.done ? c.green : c.input, backgroundColor: t.done ? c.green : "transparent" }]}>
              {t.done && <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.done ? c.muted : c.ink, fontSize: 16, fontWeight: "500", textDecorationLine: t.done ? "line-through" : "none" }}>{t.title}</Text>
              {t.details && <Text style={{ color: c.muted, fontSize: 14, marginTop: 2 }}>{t.details}</Text>}
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
                {t.forEveryone ? "Whoever's working" : "Just you"}
                {t.repeats ? `, ${t.repeats.toLowerCase()}` : ""}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

/* ================================================================ Absences */

export function AbsencesCard({ data, c, onChanged }: { data: Portal; c: Colors; onChanged: (a: Absence[]) => void }) {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await loadAbsences();
      setAbsences(a);
      onChanged(a);
    } catch {
      // shown elsewhere
    }
  }, [onChanged]);
  useEffect(() => {
    void load();
  }, [load]);

  if (data.schedule.length === 0) return null;
  const key = (x: { date: string; label: string }) => `${x.date}|${x.label}`;
  const absentFor = (x: { date: string; label: string }) => absences.find((a) => a.date === x.date && (a.windowId === null || a.label === x.label));

  const send = async (x: { date: string; label: string }) => {
    setBusy(true);
    try {
      await markAbsent(x.date, x.label, reason);
      setAsking(null);
      setReason("");
      setError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
      <View style={[s.head, { borderBottomColor: c.rule, flexDirection: "column", alignItems: "flex-start" }]}>
        <Text style={[s.h2, { color: c.ink }]}>Can't make a shift?</Text>
        <Text style={{ color: c.muted, fontSize: 14, marginTop: 2 }}>Let the manager know as early as you can.</Text>
      </View>
      {error && <Text style={[s.error, { color: c.red }]}>{error}</Text>}
      {data.schedule.map((x, i) => {
        const a = absentFor(x);
        const open = asking === key(x);
        return (
          <View key={key(x)} style={[{ paddingHorizontal: 20, paddingVertical: 12 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: a ? c.muted : c.ink, fontWeight: "500", fontSize: 16, textDecorationLine: a ? "line-through" : "none" }}>
                  {relativeDay(x.date)}, {x.label}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>{a ? `You said you can't make it${a.reason ? `: ${a.reason}` : ""}` : formatClock(x.startsAt)}</Text>
              </View>
              {a ? (
                <Pressable
                  disabled={busy}
                  onPress={async () => {
                    setBusy(true);
                    await cancelAbsent(a.id).catch(() => undefined);
                    setBusy(false);
                    void load();
                  }}
                  style={[s.small, { borderColor: c.rule }]}
                >
                  <Text style={{ color: c.ink, fontWeight: "500" }}>I can make it</Text>
                </Pressable>
              ) : (
                !open && (
                  <Pressable onPress={() => setAsking(key(x))} style={[s.small, { borderColor: c.rule }]}>
                    <Text style={{ color: c.ink, fontWeight: "500" }}>Can't make it</Text>
                  </Pressable>
                )
              )}
            </View>
            {open && !a && (
              <View style={{ gap: 8, marginTop: 10 }}>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  maxLength={200}
                  placeholder="Why? (optional) Like: dentist appointment"
                  placeholderTextColor={c.muted}
                  style={[s.field, { borderColor: c.input, color: c.ink, backgroundColor: c.board }]}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => send(x)} disabled={busy} style={[s.button, { backgroundColor: c.ink, flex: 1 }]}>
                    {busy ? <ActivityIndicator color={c.paper} /> : <Text style={{ color: c.paper, fontWeight: "700" }}>Tell the manager</Text>}
                  </Pressable>
                  <Pressable onPress={() => setAsking(null)} style={[s.button, { paddingHorizontal: 16 }]}>
                    <Text style={{ color: c.muted }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ================================================================ Messages */

const TZ_OFFSET = -7 * 3600000;
function when(iso: string) {
  const d = new Date(new Date(iso).getTime() + TZ_OFFSET);
  const today = new Date(Date.now() + TZ_OFFSET);
  const h = d.getUTCHours();
  const time = `${((h + 11) % 12) + 1}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  if (d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) return time;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function ChatTab({ c, openChat, onOpenChat, onUnread }: { c: Colors; openChat: string | null; onOpenChat: (id: string | null) => void; onUnread: (n: number) => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await loadThreads();
      setThreads(r.threads);
      setContacts(r.contacts);
      setError(null);
      const n = r.threads.reduce((t, x) => t + x.unread, 0);
      onUnread(n);
      void markMessagesSeen(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, [onUnread]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  if (openChat) return <Conversation id={openChat} c={c} onBack={() => (onOpenChat(null), void load())} />;
  if (making) return <NewChat contacts={contacts} c={c} onCancel={() => setMaking(false)} onOpened={(id) => (setMaking(false), onOpenChat(id))} />;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[s.h2, { color: c.ink, fontSize: 20 }]}>Messages</Text>
        <Pressable onPress={() => setMaking(true)} style={[s.small, { backgroundColor: c.ink, borderColor: c.ink }]}>
          <Text style={{ color: c.paper, fontWeight: "700" }}>+ New</Text>
        </Pressable>
      </View>
      {error && <Text style={[s.error, { color: c.red, paddingHorizontal: 0 }]}>{error}</Text>}
      <View style={[s.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
        {threads === null ? (
          <ActivityIndicator style={{ margin: 24 }} color={c.muted} />
        ) : (
          threads.map((t, i) => (
            <Pressable key={t.id} onPress={() => onOpenChat(t.id)} style={[s.row, { alignItems: "center" }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}>
              <View style={[s.avatar, { backgroundColor: t.kind === "direct" ? c.track : c.ink }]}>
                <Text style={{ color: t.kind === "direct" ? c.ink : c.paper, fontWeight: "700" }}>{t.kind === "direct" ? t.title.slice(0, 1).toUpperCase() : "#"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ color: c.ink, fontSize: 16, fontWeight: t.unread ? "700" : "500", flex: 1 }}>
                    {t.title}
                  </Text>
                  {t.last && <Text style={{ color: c.muted, fontSize: 12 }}>{when(t.last.at)}</Text>}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: t.unread ? c.ink : c.muted, fontSize: 14 }}>
                    {t.last ? `${t.kind !== "direct" ? `${t.last.senderName}: ` : ""}${t.last.body}` : t.kind === "everyone" ? "The whole team" : "No messages yet"}
                  </Text>
                  {t.unread > 0 && (
                    <View style={[s.badge, { backgroundColor: c.orange }]}>
                      <Text style={{ color: "#000", fontWeight: "800", fontSize: 12 }}>{t.unread > 9 ? "9+" : t.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </>
  );
}

function NewChat({ contacts, c, onCancel, onOpened }: { contacts: Contact[]; c: Colors; onCancel: () => void; onOpened: (id: string) => void }) {
  const [group, setGroup] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true);
    try {
      onOpened((await fn()).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start that chat.");
      setBusy(false);
    }
  };

  return (
    <View style={[s.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
      <View style={{ flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.rule }}>
        {(
          [
            [false, "Message someone"],
            [true, "New group"],
          ] as const
        ).map(([g, label]) => (
          <Pressable key={label} onPress={() => setGroup(g)} style={{ flex: 1, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: group === g ? c.orange : "transparent" }}>
            <Text style={{ color: group === g ? c.ink : c.muted, fontWeight: "600" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {group && (
        <View style={{ padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.rule }}>
          <TextInput value={name} onChangeText={setName} maxLength={40} placeholder="Group name, like Friday crew" placeholderTextColor={c.muted} style={[s.field, { borderColor: c.input, color: c.ink }]} />
        </View>
      )}
      {contacts.map((p, i) => {
        const on = picked.includes(p.member);
        return (
          <Pressable
            key={p.member}
            disabled={busy}
            onPress={() => (group ? setPicked(on ? picked.filter((x) => x !== p.member) : [...picked, p.member]) : go(() => openDirect(p.member)))}
            style={[s.row, { alignItems: "center" }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }]}
          >
            {group && (
              <View style={[s.box, { borderColor: on ? c.ink : c.input, backgroundColor: on ? c.ink : "transparent" }]}>
                {on && <Text style={{ color: c.paper, fontWeight: "900", fontSize: 13 }}>✓</Text>}
              </View>
            )}
            <Text style={{ color: c.ink, fontSize: 16, fontWeight: "500" }}>{p.name}</Text>
          </Pressable>
        );
      })}
      {error && <Text style={[s.error, { color: c.red }]}>{error}</Text>}
      <View style={{ flexDirection: "row", gap: 8, padding: 12 }}>
        {group && (
          <Pressable
            disabled={busy || !name.trim() || picked.length === 0}
            onPress={() => go(() => makeGroup(name, picked))}
            style={[s.button, { backgroundColor: c.ink, flex: 1, opacity: !name.trim() || picked.length === 0 ? 0.4 : 1 }]}
          >
            <Text style={{ color: c.paper, fontWeight: "700" }}>Make group ({picked.length})</Text>
          </Pressable>
        )}
        <Pressable onPress={onCancel} style={[s.button, { paddingHorizontal: 16 }]}>
          <Text style={{ color: c.muted }}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Conversation({ id, c, onBack }: { id: string; c: Colors; onBack: () => void }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const r = await loadThread(id);
      setThread(r.thread ?? null);
      setMessages(r.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the chat.");
    }
  }, [id]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendMessage(id, body);
      setText("");
      setError(null);
      Haptics.selectionAsync().catch(() => undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  const leave = () =>
    Alert.alert("Leave this group?", "You won't get its messages anymore.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => (await leaveGroup(id).catch(() => undefined), onBack()) },
    ]);

  const names = thread?.kind !== "direct";
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.sheet, { backgroundColor: c.paper, borderColor: c.rule }]}>
        <View style={[s.head, { borderBottomColor: c.rule, gap: 8 }]}>
          <Pressable onPress={onBack} hitSlop={10}>
            <Text style={{ color: c.ink, fontSize: 22 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[s.h2, { color: c.ink }]}>
              {thread?.title ?? "Chat"}
            </Text>
            {thread && thread.kind !== "direct" && (
              <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>
                {thread.kind === "everyone" ? "The whole team" : thread.members.map((m) => m.name).join(", ")}
              </Text>
            )}
          </View>
          {thread?.kind === "group" && (
            <Pressable onPress={leave} hitSlop={8}>
              <Text style={{ color: c.muted, fontSize: 13 }}>Leave</Text>
            </Pressable>
          )}
        </View>
        <ScrollView ref={scroll} style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 12, gap: 4 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          {messages === null ? (
            <ActivityIndicator style={{ margin: 24 }} color={c.muted} />
          ) : messages.length === 0 ? (
            <Text style={[s.empty, { color: c.muted }]}>No messages yet. Say hi.</Text>
          ) : (
            messages.map((m, i) => {
              const first = i === 0 || messages[i - 1].sender !== m.sender;
              return (
                <View key={m.id} style={{ alignItems: m.mine ? "flex-end" : "flex-start", marginTop: first ? 8 : 0 }}>
                  {first && names && !m.mine && <Text style={{ color: c.muted, fontSize: 12, marginBottom: 2, marginLeft: 4 }}>{m.senderName}</Text>}
                  <View style={[s.bubble, m.mine ? { backgroundColor: c.ink, borderBottomRightRadius: 6 } : { backgroundColor: c.track, borderBottomLeftRadius: 6 }]}>
                    <Text style={{ color: m.mine ? c.paper : c.ink, fontSize: 16, lineHeight: 21 }}>{m.body}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
        {error && <Text style={[s.error, { color: c.red }]}>{error}</Text>}
        <View style={{ flexDirection: "row", gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.rule }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={c.muted} multiline maxLength={1000} style={[s.field, { flex: 1, borderColor: c.input, color: c.ink, height: undefined, minHeight: 46, maxHeight: 120, paddingTop: 12 }]} />
          <Pressable onPress={send} disabled={sending || !text.trim()} style={[s.button, { backgroundColor: c.ink, width: 72, opacity: !text.trim() ? 0.4 : 1 }]}>
            {sending ? <ActivityIndicator color={c.paper} /> : <Text style={{ color: c.paper, fontWeight: "700" }}>Send</Text>}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  sheet: { borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  h2: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingVertical: 13 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1 },
  empty: { padding: 20, textAlign: "center", fontSize: 14 },
  error: { fontSize: 14, fontWeight: "600", paddingHorizontal: 20, paddingTop: 10 },
  small: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 8 },
  field: { height: 46, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, fontSize: 16 },
  button: { height: 46, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
});
