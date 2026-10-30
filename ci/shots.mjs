// Screenshot the dev world in headless Chromium. Scenes come from ci/scenes.json:
// [{ "name": "...", "js": "code run in the page (has w = window.__world)", "wait": ms }]
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";

const scenes = JSON.parse(readFileSync("ci/scenes.json", "utf8"));
mkdirSync("shots", { recursive: true });
const log = (s) => appendFileSync("shots/log.txt", s + "\n");
writeFileSync("shots/log.txt", "");

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log(`[console.${m.type()}] ${m.text().slice(0, 600)}`); });
page.on("pageerror", (e) => log(`[pageerror] ${e.message}\n${(e.stack || "").slice(0, 1500)}`));

const t0 = Date.now();
await page.goto("http://localhost:3000/dev/world", { waitUntil: "domcontentloaded", timeout: 300000 });
try {
  await page.getByRole("button", { name: /click to enter/i }).waitFor({ timeout: 300000 });
  log(`ready after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} catch (e) {
  log("never got the enter button: " + e.message);
}
await page.waitForTimeout(3000);
for (const s of scenes) {
  try {
    if (s.js) await page.evaluate(`(async () => { const w = window.__world; ${s.js} })()`);
    if (s.key) { await page.mouse.move(640, 400); await page.keyboard.press(s.key); }
    if (s.hold) { await page.keyboard.down(s.hold); await page.waitForTimeout(s.holdMs ?? 1000); await page.keyboard.up(s.hold); }
    if (s.wheel) { await page.mouse.move(640, 400); for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, s.wheel / 6); await page.waitForTimeout(60); } }
    await page.waitForTimeout(s.wait ?? 2500);
    if (s.log) log(`${s.name}: ` + (await page.evaluate(`(() => { const w = window.__world; return JSON.stringify(${s.log}); })()`)));
    await page.screenshot({ path: `shots/${s.name}.png`, timeout: 90000 });
    log(`shot ${s.name}`);
  } catch (e) {
    log(`scene ${s.name} failed: ${e.message}`);
  }
}
await browser.close();
