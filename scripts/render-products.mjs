/**
 * Saves a picture of every product that has a 3D model, for the menu and cart.
 *
 *   1. Start the site:   npm run dev
 *   2. Run:              node scripts/render-products.mjs
 *      (needs Playwright: npm i -D playwright && npx playwright install chromium)
 *
 * Each picture is drawn by the page /dev/renders?slug=<product> and saved to
 * public/products/3d/<product>.webp (800 × 800, see-through background).
 * Then the list in src/lib/product-renders.ts is updated.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "http://localhost:3000";
const out = path.resolve("public/products/3d");
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 800 } })).newPage();
await page.goto(`${base}/dev/renders?slug=coke`, { timeout: 180000 });
await page.waitForFunction(() => window.__slugs, null, { timeout: 180000 });
const slugs = await page.evaluate(() => window.__slugs);

const done = [];
for (const slug of slugs) {
  await page.goto(`${base}/dev/renders?slug=${slug}`, { timeout: 180000 });
  try {
    await page.waitForFunction(() => window.__rendered, null, { timeout: 120000 });
  } catch {
    console.log("skipped (didn't load):", slug);
    continue;
  }
  const dataUrl = await page.evaluate(() => document.querySelector("canvas").toDataURL("image/png"));
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  // Trim nothing (every picture keeps the same framing), just compress.
  await sharp(png).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(out, `${slug}.webp`));
  done.push(slug);
  console.log("saved", slug);
}
await browser.close();

const list = fs
  .readdirSync(out)
  .filter((f) => f.endsWith(".webp"))
  .map((f) => f.replace(/\.webp$/, ""))
  .sort();
fs.writeFileSync(
  path.resolve("src/lib/product-renders.ts"),
  `/*
 * The product pictures drawn from the 3D models (public/products/3d/).
 * Made by scripts/render-products.mjs; run it again after adding a model.
 */

import { slugOf } from "@/lib/slug";

const RENDERS = new Set(${JSON.stringify(list, null, 2).replace(/\n\]/, ",\n]")});

/** The 3D picture for a product, if it has one (matched by name, like the models are). */
export function productRenderUrl(name: string): string | null {
  const slug = slugOf(name);
  return RENDERS.has(slug) ? \`/products/3d/\${slug}.webp\` : null;
}
`,
);
console.log(`\n${done.length} pictures saved; src/lib/product-renders.ts lists ${list.length}.`);
