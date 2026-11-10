"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, CheckIcon, Loader2Icon, PlusIcon, SendIcon, UsersIcon } from "lucide-react";

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
};

const TZ = "America/Phoenix";
function when(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  if (day(d) === day(new Date())) return d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" });
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
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background"
        >
          <PlusIcon className="size-4" /> New
        </button>
      </div>
      {error && <p className="mb-3 text-sm font-semibold text-destructive">{error}</p>}
      {mode === "new" ? (
        <NewChat contacts={contacts} actions={actions} onOpened={opened} onCancel={() => setMode("list")} />
      ) : threads === null ? (
        <Loader2Icon className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => opened(t.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 ${openId === t.id && wide ? "bg-accent" : ""}`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${t.kind === "direct" ? "bg-muted" : "bg-foreground text-background"}`}>
                  {t.kind === "direct" ? t.title.slice(0, 1).toUpperCase() : <UsersIcon className="size-4.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${t.unread ? "font-semibold" : "font-medium"}`}>{t.title}</span>
                    {t.last && <span className="shrink-0 text-xs text-muted-foreground">{when(t.last.at)}</span>}
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
    <div className="overflow-hidden rounded-xl border bg-card">
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
    <section className="flex min-h-[60vh] flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-3 py-2.5">
        {showBack && (
          <button type="button" onClick={onBack} aria-label="Back to chats" className="grid size-9 place-items-center rounded-md hover:bg-accent">
            <ArrowLeftIcon className="size-5" />
          </button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate font-semibold">{thread?.title ?? "Chat"}</h2>
          {thread && thread.kind !== "direct" && (
            <p className="truncate text-xs text-muted-foreground">{thread.kind === "everyone" ? "The whole team" : thread.members.map((m) => m.name).join(", ")}</p>
          )}
        </div>
        {thread?.kind === "group" && (
          <button type="button" onClick={leave} className="h-8 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            Leave
          </button>
        )}
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4" style={{ maxHeight: "60vh" }}>
        {messages === null ? (
          <Loader2Icon className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hi.</p>
        ) : (
          messages.map((m, i) => {
            const firstOfRun = i === 0 || messages[i - 1].sender !== m.sender;
            return (
              <div key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"} ${firstOfRun ? "pt-2" : ""}`}>
                {firstOfRun && showNames && !m.mine && <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">{m.senderName}</span>}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-snug whitespace-pre-wrap break-words ${
                    m.mine ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md bg-muted"
                  }`}
                  title={new Date(m.at).toLocaleString("en-US", { timeZone: TZ })}
                >
                  {m.body}
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
        className="flex items-end gap-2 border-t p-2.5"
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
          className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-base"
        />
        <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-lg bg-foreground text-background disabled:opacity-40">
          {sending ? <Loader2Icon className="size-5 animate-spin" /> : <SendIcon className="size-5" />}
        </button>
      </form>
    </section>
  );
}
