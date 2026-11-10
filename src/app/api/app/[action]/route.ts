import { revalidatePath } from "next/cache";
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
      return json({ error: "Not found" }, 404);
  }
}
