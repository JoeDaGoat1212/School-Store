// TEMPORARY (check branch only): photographs the time clock and employee app.
import { chromium } from "playwright";

const base = "http://localhost:3000";
const out = "ci-preview/shots";
const browser = await chromium.launch();

async function page(name, url, viewport, setup) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  if (setup?.cookie) await ctx.addCookies([{ name: "fn_work", value: "preview", url: base }]);
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
await browser.close();
console.log("screenshots done");
