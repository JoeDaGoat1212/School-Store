import "server-only";

import { createCipheriv, createECDH, createHmac, createPrivateKey, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createSecretClient } from "@/lib/supabase/server";

/*
 * Web push notifications (the browser, and the home-screen web app on iPhone
 * and Android), sent straight from this server: no outside service or account.
 * Standard Web Push (RFC 8291 "aes128gcm" encryption + RFC 8292 VAPID keys).
 * The keys are made the first time they're needed and kept in app_secrets
 * (database update 20), so they're never in the code.
 *
 * Members: an employee's staff id, or "admin" for the manager.
 */

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

const b64url = (b: Buffer) => b.toString("base64url");
const unb64url = (s: string) => Buffer.from(s, "base64url");

type Vapid = { publicKey: string; jwk: { kty: string; crv: string; x: string; y: string; d: string } };

let cached: Vapid | null = null;

/** The server's push keys (made once, then kept in the database). */
export async function vapidKeys(): Promise<Vapid | null> {
  if (cached) return cached;
  const db = createSecretClient();
  const { data, error } = await db.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
  if (error) return null; // database update 20 not run yet
  if (data?.value) return (cached = JSON.parse(data.value) as Vapid);
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" }) as Vapid["jwk"];
  const publicKey = b64url(Buffer.concat([Buffer.from([4]), unb64url(jwk.x), unb64url(jwk.y)]));
  const made: Vapid = { publicKey, jwk };
  // Two servers racing: keep whichever was saved first.
  await db.from("app_secrets").upsert({ key: "vapid", value: JSON.stringify(made) }, { onConflict: "key", ignoreDuplicates: true });
  const { data: saved } = await db.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
  return (cached = saved?.value ? (JSON.parse(saved.value) as Vapid) : made);
}

function hmac(key: Buffer, data: Buffer) {
  return createHmac("sha256", key).update(data).digest();
}

/** Encrypts one message for one browser (RFC 8291, a single aes128gcm record). */
function encrypt(payload: Buffer, p256dh: string, auth: string) {
  const uaPublic = unb64url(p256dh);
  const authSecret = unb64url(auth);
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const salt = randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** The signed "who's sending" token push services ask for (RFC 8292). */
function vapidHeader(endpoint: string, keys: Vapid) {
  const aud = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:store@example.com" })));
  const key = createPrivateKey({ key: keys.jwk, format: "jwk" });
  const signature = createSign("SHA256").update(`${header}.${claims}`).sign({ key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}

/** Sends a notification to everyone listed (staff ids and/or "admin"). Never throws. */
export async function notify(members: string[], message: PushMessage) {
  try {
    if (members.length === 0) return;
    const keys = await vapidKeys();
    if (!keys) return;
    const db = createSecretClient();
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("member", [...new Set(members)]);
    if (!subs?.length) return;
    const payload = Buffer.from(JSON.stringify(message));
    const gone: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          const res = await fetch(s.endpoint, {
            method: "POST",
            headers: {
              Authorization: vapidHeader(s.endpoint, keys),
              "Content-Encoding": "aes128gcm",
              "Content-Type": "application/octet-stream",
              TTL: "86400",
              Urgency: "high",
            },
            body: new Uint8Array(encrypt(payload, s.p256dh, s.auth)),
          });
          if (res.status === 404 || res.status === 410) gone.push(s.id);
        } catch {
          // one phone being unreachable shouldn't stop the others
        }
      }),
    );
    if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  } catch {
    // notifications are a bonus; never break the action that sent them
  }
}

/** Saves a browser's push subscription for a member. */
export async function savePushSubscription(member: string, sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }) {
  const endpoint = String(sub.endpoint ?? "");
  const p256dh = String(sub.keys?.p256dh ?? "");
  const auth = String(sub.keys?.auth ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) return { error: "That browser can't get notifications." };
  const { error } = await createSecretClient()
    .from("push_subscriptions")
    .upsert({ member, endpoint, p256dh, auth }, { onConflict: "endpoint" });
  return error ? { error: "Turn on notifications needs database update 20." } : { ok: true as const };
}

export async function removePushSubscription(endpoint: string) {
  await createSecretClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
}
