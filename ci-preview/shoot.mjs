// TEMPORARY (check branch only): photographs the time clock and employee app.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const out = "ci-preview/shots";
const browser = await chromium.launch();

async function page(name, url, viewport, setup) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (setup?.cookie) await ctx.addCookies([{ name: "fn_work", value: "preview", url: base }]);
  if (setup?.admin) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const user = { id: "00000000-0000-0000-0000-00000000a0a0", aud: "authenticated", role: "authenticated", email: "manager@example.com" };
    const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: "s" })}.c2ln`;
    const session = { access_token: jwt, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user };
    await ctx.addCookies([{ name: "sb-localhost-auth-token", value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, url: base }]);
  }
  if (setup?.kiosk) await ctx.addCookies([{ name: "fn_kiosk", value: "preview", url: base }]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[${name}] page error:`, e.message));
  p.on("console", (m) => m.type() === "error" && console.log(`[${name}] console:`, m.text()));
  await p.goto(base + url, { waitUntil: "networkidle" });
  await p.waitForTimeout(800);
  if (setup?.act) await setup.act(p);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: setup?.full ?? true });
  await ctx.close();
}

await page("clock-tablet", "/clock", { width: 1280, height: 860 }, { full: false });
await page("clock-phone", "/clock", { width: 390, height: 844 });
await page("clock-result", "/clock", { width: 1280, height: 860 }, {
  full: false,
  act: async (p) => {
    for (const k of ["1", "2", "3", "4"]) await p.getByRole("button", { name: k, exact: true }).click();
    await p.waitForTimeout(1500);
  },
});
await page("clock-confetti", "/clock", { width: 1280, height: 860 }, {
  full: false,
  act: async (p) => {
    for (const k of ["1", "2", "3", "4"]) await p.getByRole("button", { name: k, exact: true }).click();
    await p.waitForTimeout(900);
  },
});
await page("clock-manager", "/clock", { width: 1280, height: 860 }, {
  full: false,
  kiosk: true,
  act: async (p) => {
    await p.getByRole("button", { name: "Manager" }).click();
    for (const k of ["2", "5", "8"]) await p.getByRole("button", { name: k, exact: true }).click();
    await p.waitForTimeout(300);
  },
});
await page("work-signin", "/work", { width: 390, height: 844 });
await page("work-today", "/work", { width: 390, height: 844 }, { cookie: true });
await page("work-schedule", "/work", { width: 390, height: 844 }, {
  cookie: true,
  act: async (p) => {
    await p.getByRole("button", { name: "Schedule" }).click();
    await p.waitForTimeout(400);
  },
});
await page("work-money", "/work", { width: 390, height: 844 }, {
  cookie: true,
  act: async (p) => {
    await p.getByRole("button", { name: "Money" }).click();
    await p.waitForTimeout(400);
  },
});
for (const [name, url] of [["admin-dashboard", "/admin"], ["admin-shopping", "/admin/inventory/shopping-list"], ["admin-inventory", "/admin/inventory"], ["admin-expenses", "/admin/expenses"]]) {
  await page(name, url, { width: 1440, height: 900 }, { admin: true });
}
await page("admin-dashboard-phone", "/admin", { width: 390, height: 844 }, { admin: true });
await page("admin-shopping-phone", "/admin/inventory/shopping-list", { width: 390, height: 844 }, { admin: true });
await browser.close();
console.log("screenshots done");
