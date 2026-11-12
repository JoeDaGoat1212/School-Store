"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowUpIcon, CheckIcon, Loader2Icon, PlusIcon, UsersIcon, Trash2Icon } from "lucide-react";
import { Avatar } from "@/components/staff/avatar";

/*
 * Messages: the team-wide "Everyone" chat, one-on-one chats and group chats.
 * The same screen runs in the employee app (/work) and on the admin page;
 * each passes its own server actions. Checks for new messages every few
 * seconds while open; notifications cover the rest.
 */

export type Contact = { member: string; name: string };
export type Thread = {
  id: string;
  kind: "everyone" | "direct" | "group";
  title: string;
  members: Contact[];
  last: { body: string; sender: string; senderName: string; at: string } | null;
  unread: number;
};
export type Message = { id: string; sender: string; senderName: string; body: string; at: string; mine: boolean };

type Err = { error?: string };
export type MessagesActions = {
  list: () => Promise<Err & { threads?: Thread[]; contacts?: Contact[] }>;
  open: (id: string) => Promise<Err & { thread?: Thread; messages?: Message[] }>;
  send: (id: string, body: string) => Promise<Err & { ok?: true }>;
  direct: (member: string) => Promise<Err & { id?: string }>;
  group: (name: string, members: string[]) => Promise<Err & { id?: string }>;
  leave: (id: string) => Promise<Err & { ok?: true }>;
  /** Only given to the owner: delete any message. */
  remove?: (messageId: string) => Promise<Err & { ok?: true }>;
};

const TZ = "America/Phoenix";
function when(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  if (day(d) === day(new Date())) return d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const gapMinutes = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
function dayLabel(iso: string) {
  const d = dayOf(iso);
  if (d === dayOf(new Date().toISOString())) return "Today";
  if (d === dayOf(new Date(Date.now() - 86400000).toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" });
}

/** A chat's picture: the person, two faces for a group, or the team mark for Everyone. */
function ChatAvatar({ thread, size }: { thread: Thread; size: number }) {
  if (thread.kind === "direct") return <Avatar name={thread.title} size={size} />;
  if (thread.kind === "group" && thread.members.length >= 2) {
    const [a, b] = thread.members;
    const small = Math.round(size * 0.7);
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <span className="absolute top-0 left-0">
          <Avatar name={a.name} size={small} />
        </span>
        <span className="absolute right-0 bottom-0 rounded-full ring-2 ring-card">
          <Avatar name={b.name} size={small} />
        </span>
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-[var(--brand)] text-black" style={{ width: size, height: size }}>
      <UsersIcon style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={2.25} />
    </span>
  );
}

export function MessagesView({ actions, initialChat, wide = false }: { actions: MessagesActions; initialChat?: string | null; wide?: boolean }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [openId, setOpenId] = useState<string | null>(initialChat ?? null);
  const [mode, setMode] = useState<"list" | "new">("list");
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const r = await actions.list();
    if (r.error) setError(r.error);
    else {
      setError(null);
      setThreads(r.threads ?? []);
      setContacts(r.contacts ?? []);
    }
  }, [actions]);

  useEffect(() => {
    // Load now, then keep checking.
    const first = setTimeout(() => void loadList(), 0);
    const t = setInterval(() => void loadList(), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList]);

  const opened = (id: string) => {
    setOpenId(id);
    setMode("list");
    void loadList();
  };

  const list = (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Messages</h2>
        <button
          type="button"
          onClick={() => setMode(mode === "new" ? "list" : "new")}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-black transition active:scale-95"
        >
          <PlusIcon className="size-4" strokeWidth={2.5} /> New
        </button>
      </div>
      {error && <p className="mb-3 text-sm font-semibold text-destructive">{error}</p>}
      {mode === "new" ? (
        <NewChat contacts={contacts} actions={actions} onOpened={opened} onCancel={() => setMode("list")} />
      ) : threads === null ? (
        <Loader2Icon className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
      ) : (
        <ul className="grid gap-1">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => opened(t.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-accent ${openId === t.id && wide ? "bg-accent" : t.unread ? "bg-card" : ""}`}
              >
                <ChatAvatar thread={t} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[1.0625rem] ${t.unread ? "font-bold" : "font-semibold"}`}>{t.title}</span>
                    {t.last && <span className={`shrink-0 text-xs ${t.unread ? "font-semibold text-[var(--brand)]" : "text-muted-foreground"}`}>{when(t.last.at)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${t.unread ? "text-foreground" : "text-muted-foreground"}`}>
                      {t.last ? `${t.kind !== "direct" ? `${t.last.senderName}: ` : ""}${t.last.body}` : t.kind === "everyone" ? "The whole team" : "No messages yet"}
                    </span>
                    {t.unread > 0 && (
                      <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--brand)] px-1.5 text-xs font-bold text-black">
                        {t.unread > 9 ? "9+" : t.unread}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const conversation = openId ? (
    <Conversation key={openId} id={openId} actions={actions} onBack={() => setOpenId(null)} onChanged={loadList} showBack={!wide} />
  ) : wide ? (
    <div className="grid h-full min-h-80 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Pick a chat, or start a new one.</div>
  ) : null;

  if (wide) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {list}
        {conversation}
      </div>
    );
  }
  return openId ? conversation : list;
}

function NewChat({ contacts, actions, onOpened, onCancel }: { contacts: Contact[]; actions: MessagesActions; onOpened: (id: string) => void; onCancel: () => void }) {
  const [group, setGroup] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const direct = async (member: string) => {
    setBusy(true);
    const r = await actions.direct(member);
    setBusy(false);
    if (r.id) onOpened(r.id);
    else setError(r.error ?? "Couldn't start that chat.");
  };
  const make = async () => {
    setBusy(true);
    const r = await actions.group(name, picked);
    setBusy(false);
    if (r.id) onOpened(r.id);
    else setError(r.error ?? "Couldn't make the group.");
  };

  return (
    <div className="chat-panel overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <div className="flex border-b">
        {[
          [false, "Message someone"],
          [true, "New group"],
        ].map(([g, label]) => (
          <button
            key={String(g)}
            type="button"
            onClick={() => setGroup(g as boolean)}
            className={`flex-1 border-b-2 py-2.5 text-sm font-medium ${group === g ? "border-[var(--brand)] text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label as string}
          </button>
        ))}
      </div>
      {group && (
        <div className="border-b p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Group name, like Friday crew"
            className="h-11 w-full rounded-md border bg-background px-3 text-base"
          />
        </div>
      )}
      <ul className="max-h-80 divide-y overflow-y-auto">
        {contacts.map((c) => {
          const on = picked.includes(c.member);
          return (
            <li key={c.member}>
              <button
                type="button"
                disabled={busy}
                onClick={() => (group ? setPicked(on ? picked.filter((x) => x !== c.member) : [...picked, c.member]) : direct(c.member))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/60"
              >
                {group && (
                  <span className={`grid size-5 place-items-center rounded-[5px] border-[1.5px] ${on ? "border-foreground bg-foreground text-background" : "border-input"}`}>
                    {on && <CheckIcon className="size-3.5" strokeWidth={3} />}
                  </span>
                )}
                <span className="flex-1 font-medium">{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="px-4 pt-3 text-sm font-semibold text-destructive">{error}</p>}
      <div className="flex gap-2 p-3">
        {group && (
          <button type="button" onClick={make} disabled={busy || !name.trim() || picked.length === 0} className="h-10 flex-1 rounded-md bg-foreground text-sm font-semibold text-background disabled:opacity-40">
            {busy ? <Loader2Icon className="mx-auto size-4 animate-spin" /> : `Make group (${picked.length})`}
          </button>
        )}
        <button type="button" onClick={onCancel} className="h-10 rounded-md px-4 text-sm font-medium text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Conversation({ id, actions, onBack, onChanged, showBack }: { id: string; actions: MessagesActions; onBack: () => void; onChanged: () => void; showBack: boolean }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    const r = await actions.open(id);
    if (r.error) return setError(r.error);
    setThread(r.thread ?? null);
    setMessages(r.messages ?? []);
    if ((r.messages?.length ?? 0) !== count.current) {
      count.current = r.messages?.length ?? 0;
      requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
    }
  }, [actions, id]);

  useEffect(() => {
    const first = setTimeout(() => {
      void load();
      onChanged();
    }, 0);
    const t = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, onChanged]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const r = await actions.send(id, body);
    setSending(false);
    if (r.error) return setError(r.error);
    setText("");
    setError(null);
    await load();
    onChanged();
  };

  const leave = async () => {
    if (!confirm("Leave this group? You won't get its messages anymore.")) return;
    await actions.leave(id);
    onChanged();
    onBack();
  };

  const showNames = thread?.kind !== "direct";

  return (
    <section className="chat-panel flex min-h-[64vh] flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-border">
      <header className="flex items-center gap-3 border-b px-3 py-3">
        {showBack && (
          <button type="button" onClick={onBack} aria-label="Back to chats" className="grid size-10 place-items-center rounded-full hover:bg-accent">
            <ArrowLeftIcon className="size-5" />
          </button>
        )}
        {thread && <ChatAvatar thread={thread} size={40} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[1.0625rem] font-bold">{thread?.title ?? "Chat"}</h2>
          {thread && thread.kind !== "direct" && (
            <p className="truncate text-xs text-muted-foreground">{thread.kind === "everyone" ? "The whole team" : thread.members.map((m) => m.name).join(", ")}</p>
          )}
        </div>
        {thread?.kind === "group" && (
          <button type="button" onClick={leave} className="h-8 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
            Leave
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4" style={{ maxHeight: "62vh" }}>
        {messages === null ? (
          <Loader2Icon className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
        ) : messages.length === 0 ? (
          <div className="grid place-items-center gap-2 py-14 text-center">
            {thread && <ChatAvatar thread={thread} size={64} />}
            <p className="mt-2 font-semibold">{thread?.title}</p>
            <p className="text-sm text-muted-foreground">No messages yet. Say hi.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || dayOf(prev.at) !== dayOf(m.at);
            const firstOfRun = newDay || !prev || prev.sender !== m.sender || gapMinutes(prev.at, m.at) > 10;
            const lastOfRun = !next || next.sender !== m.sender || dayOf(next.at) !== dayOf(m.at) || gapMinutes(m.at, next.at) > 10;
            return (
              <div key={m.id} className={i >= messages.length - 1 ? "bubble-in" : undefined}>
                {newDay && (
                  <p className="my-3 text-center text-xs font-semibold text-muted-foreground">
                    {dayLabel(m.at)}
                  </p>
                )}
                <div className={`flex items-end gap-2 ${m.mine ? "justify-end" : "justify-start"} ${firstOfRun ? "mt-3" : "mt-0.5"}`}>
                  {!m.mine && showNames && (
                    <span className="w-7 shrink-0">{lastOfRun && <Avatar name={m.senderName} size={28} />}</span>
                  )}
                  <div className={`flex max-w-[78%] flex-col ${m.mine ? "items-end" : "items-start"}`}>
                    {firstOfRun && showNames && !m.mine && <span className="mb-1 px-3 text-xs font-semibold text-muted-foreground">{m.senderName}</span>}
                    <div className={`group/msg flex items-center gap-1 ${m.mine ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`px-3.5 py-2 text-[0.9375rem] leading-snug whitespace-pre-wrap break-words ${
                        m.mine
                          ? `bubble-mine bg-[var(--brand)] text-black ${lastOfRun ? "rounded-[20px] rounded-br-md" : "rounded-[20px]"}`
                          : `bubble-theirs bg-muted ${lastOfRun ? "rounded-[20px] rounded-bl-md" : "rounded-[20px]"}`
                      }`}
                      title={new Date(m.at).toLocaleString("en-US", { timeZone: TZ })}
                    >
                      {m.body}
                    </div>
                    {actions.remove && (
                      <button
                        type="button"
                        aria-label={`Delete message from ${m.senderName}`}
                        title="Delete for everyone"
                        onClick={async () => {
                          if (!window.confirm(`Delete this message from ${m.mine ? "you" : m.senderName}? It's removed for everyone.`)) return;
                          const r = await actions.remove!(m.id);
                          if (r.error) setError(r.error);
                          else {
                            setMessages((list) => (list ?? []).filter((x) => x.id !== m.id));
                            count.current -= 1;
                            onChanged();
                          }
                        }}
                        className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive hover:opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 focus-visible:opacity-100"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    )}
                    </div>
                    {lastOfRun && <span className="mt-1 px-2 text-[0.7rem] text-muted-foreground">{when(m.at)}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {error && <p className="px-4 pb-2 text-sm font-semibold text-destructive">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 border-t p-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Message"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[22px] bg-muted px-4 py-2.5 text-base placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-[var(--brand)]/50 focus-visible:outline-none"
        />
        <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="send-btn grid size-11 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-black transition active:scale-90 disabled:opacity-30">
          {sending ? <Loader2Icon className="size-5 animate-spin" /> : <ArrowUpIcon className="size-5" strokeWidth={2.75} />}
        </button>
      </form>
    </section>
  );
}
