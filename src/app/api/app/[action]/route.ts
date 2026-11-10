import { revalidatePath } from "next/cache";
import { storeToday } from "@/lib/format";
import {
  addRestockPhoto,
  cancelAbsence,
  contacts,
  createGroup,
  leaveGroup,
  listThreads,
  markAbsent,
  meFromToken,
  myAbsences,
  openDirect,
  readThread,
  sendMessage,
  setTaskDone,
  skipRestock,
  startRestock,
  tasksForDay,
  latestUnread,
  unreadCount,
} from "@/lib/team";
import { saveFcmToken } from "@/lib/push";
import { deviceHashFrom, endSession, portalFor, punchFor, startSession, undoPunch } from "@/lib/work-session";

/*
 * The phone app's API (the native app in mobile/). Same employee sessions as
 * the web app (/work), but the token is sent as "Authorization: Bearer …"
 * instead of a cookie.
 *
 *   POST /api/app/sign-in   { name, pin }        → { token }
 *   POST /api/app/me                              → { data: PortalData | null }
 *   POST /api/app/punch                           → PunchResult
 *   POST /api/app/undo      { id, undo }          → { ok }
 *   POST /api/app/sign-out                        → { ok }
 *
 * Team tools (database update 20):
 *   threads, thread {id}, send {id, body}, direct {member}, group {name, members}, leave {id}, unread
 *   push-token {token}   (this phone's Firebase token, for instant notifications)
 *   tasks, task {id, done}
 *   absences, absent {date, shift, reason}, present {id}
 *   restock-start {shift, undo}, restock-photo {check, token, area, type, data(base64)}, restock-skip {check, token, note}
 *
 * A missing or expired token answers 401 with { code: "SIGNED_OUT" }.
 */

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const signedOut = () => json({ error: "You're signed out. Sign in again.", code: "SIGNED_OUT" }, 401);

function bearer(req: Request) {
  const m = req.headers.get("authorization")?.match(/^Bearer\s+([\w-]{20,100})$/);
  return m?.[1] ?? null;
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;

  if (action === "sign-in") {
    const b = await body(req);
    const r = await startSession(String(b.name ?? ""), String(b.pin ?? ""), deviceHashFrom(req.headers, "app"), req.headers.get("user-agent"));
    return r.token ? json({ token: r.token }) : json({ error: r.error }, 400);
  }

  const token = bearer(req);
  if (!token) return signedOut();

  switch (action) {
    case "me": {
      const r = await portalFor(token);
      if (r.error) return json({ error: r.error }, 503);
      return r.data ? json({ data: r.data }) : signedOut();
    }
    case "punch": {
      const r = await punchFor(token);
      if ("error" in r) return (r.code as string | undefined) === "SIGNED_OUT" ? signedOut() : json(r, 400);
      revalidatePath("/admin", "layout");
      return json(r);
    }
    case "undo": {
      const b = await body(req);
      const r = await undoPunch(String(b.id ?? ""), String(b.undo ?? ""));
      if (r.ok) revalidatePath("/admin", "layout");
      return json(r, r.ok ? 200 : 400);
    }
    case "sign-out":
      await endSession(token);
      return json({ ok: true });
    default:
      return team(action, token, req);
  }
}

const reply = (r: { error?: string } & Record<string, unknown>) => json(r, r.error ? 400 : 200);

async function team(action: string, token: string, req: Request) {
  const me = await meFromToken(token);
  if (!me?.staffId) return signedOut();
  const b = await body(req);
  const str = (k: string) => String(b[k] ?? "");
  switch (action) {
    case "threads": {
      const [r, people] = await Promise.all([listThreads(me), contacts(me)]);
      return reply({ ...r, contacts: people });
    }
    case "thread":
      return reply(await readThread(me, str("id")));
    case "send": {
      const r = await sendMessage(me, str("id"), str("body"));
      if (r.ok) revalidatePath("/admin/staff/messages");
      return reply(r);
    }
    case "direct":
      return reply(await openDirect(me, str("member")));
    case "group":
      return reply(await createGroup(me, str("name"), Array.isArray(b.members) ? b.members.map(String) : []));
    case "leave":
      return reply(await leaveGroup(me, str("id")));
    case "unread": {
      const [unread, latest] = await Promise.all([unreadCount(me), latestUnread(me)]);
      return json({ unread, latest });
    }
    case "push-token":
      return reply(await saveFcmToken(me.member, str("token")));
    case "tasks":
      return reply(await tasksForDay(storeToday(), me.staffId));
    case "task":
      return reply(await setTaskDone(me.staffId, str("id"), storeToday(), Boolean(b.done)));
    case "absences":
      return json({ absences: await myAbsences(me.staffId) });
    case "absent": {
      const r = await markAbsent(me, str("date"), b.shift === null || b.shift === undefined ? null : typeof b.shift === "number" ? b.shift : str("shift"), str("reason"));
      revalidatePath("/admin", "layout");
      return reply(r);
    }
    case "present":
      return reply(await cancelAbsence(me.staffId, str("id")));
    case "restock-start":
      return reply(await startRestock(str("shift"), str("undo")));
    case "restock-photo": {
      const data = str("data");
      if (data.length > 11_000_000) return json({ error: "That photo is too big." }, 400);
      const r = await addRestockPhoto(str("check"), str("token"), str("area"), new Uint8Array(Buffer.from(data, "base64")), str("type") || "image/jpeg");
      revalidatePath("/admin", "layout");
      return reply(r);
    }
    case "restock-skip":
      return reply(await skipRestock(str("check"), str("token"), str("note")));
    default:
      return json({ error: "Not found" }, 404);
  }
}
