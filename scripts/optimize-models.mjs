#!/usr/bin/env node
/*
 * Turns the downloaded CGTrader models into small, fast .glb files for the
 * 3D world, in public/models/, and writes public/models/available.json (the
 * game only loads what's listed there).
 *
 *   npm run models                      (looks in ~/Downloads)
 *   npm run models -- "/path/to/folder" (or wherever you saved them)
 *
 * The terminal's kept at full quality (every triangle, its textures at
 * their own size). For the others, what it does (with gltf-transform):
 *   - meshopt-compresses the geometry (the game decodes it; no extra files),
 *   - re-saves the textures as WebP, no bigger than 2048 px (1024 for trees),
 *   - for the trees, cuts the triangle count to about a third first,
 *   - welds, de-duplicates and prunes whatever isn't used.
 *
 * The elms only come as .rar files: if `unar` is installed
 * (brew install unar) it unpacks "American Elm_Fall-obj.rar" and "Map.rar"
 * itself; otherwise unpack them into the same folder first (The Unarchiver
 * app does it). The .obj is then turned into a .glb with obj2gltf.
 *
 * Needs an internet connection the first time (npx fetches the tools).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const from = resolve(process.argv[2] ?? join(homedir(), "Downloads"));
const out = resolve("public/models");
const tmp = join(tmpdir(), "school-store-models");
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const run = (cmd, args) => {
  console.log(`  $ ${cmd} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
};
const gt = (...args) => run("npx", ["-y", "@gltf-transform/cli@4", ...args]);
const mb = (f) => `${(statSync(f).size / 1048576).toFixed(1)} MB`;

/** Find a file by name (looking a few folders deep, as unzipped downloads tend to be nested). */
function find(dir, test, depth = 4) {
  if (!existsSync(dir) || depth < 0) return null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isFile() && test(name)) return p;
    if (st.isDirectory() && !name.startsWith(".") && name !== "node_modules") {
      const hit = find(p, test, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

function optimize(src, dest, size) {
  return gt("optimize", src, dest, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", String(size));
}
/** Full quality: every triangle and the textures at their own size and format (only cleaned up: duplicates merged, unused parts dropped). Bigger to download. */
function fullQuality(src, dest) {
  return gt("optimize", src, dest, "--compress", "false", "--simplify", "false", "--texture-compress", "false", "--texture-size", "8192");
}

const done = new Set();
const listFile = join(out, "available.json");
if (existsSync(listFile)) for (const id of JSON.parse(readFileSync(listFile, "utf8"))) if (existsSync(join(out, `${id}.glb`))) done.add(id);

console.log(`Looking for the downloads in ${from}\n`);

// ---- The car: "Lamborghini Revuelto.glb" ----
{
  const src = find(from, (n) => /^Lamborghini Revuelto\.glb$/i.test(n));
  if (!src) console.log("• Revuelto: Lamborghini Revuelto.glb not found (skipped)");
  else {
    console.log(`• Revuelto: ${src} (${mb(src)})`);
    if (optimize(src, join(out, "revuelto.glb"), 2048)) {
      done.add("revuelto");
      console.log(`  → public/models/revuelto.glb (${mb(join(out, "revuelto.glb"))})\n`);
    }
  }
}

// ---- The terminal: "modern+airport+terminal+3d+model.glb" (kept at full quality: it's the airport, seen up close and life size) ----
{
  const src = find(from, (n) => /^modern\+airport\+terminal\+3d\+model\.glb$/i.test(n));
  if (!src) console.log("• Terminal: modern+airport+terminal+3d+model.glb not found (skipped)");
  else {
    console.log(`• Terminal: ${src} (${mb(src)})`);
    if (fullQuality(src, join(out, "terminal.glb"))) {
      done.add("terminal");
      console.log(`  → public/models/terminal.glb (${mb(join(out, "terminal.glb"))})\n`);
    }
  }
}

// ---- The elms: the .obj inside "American Elm_Fall-obj.rar" (textures in "Map.rar") ----
{
  let obj = find(from, (n) => /elm.*\.obj$/i.test(n) || /\.obj$/i.test(n) && /elm/i.test(n));
  if (!obj) {
    const rar = find(from, (n) => /^American Elm_Fall-obj\.rar$/i.test(n));
    if (rar && spawnSync("unar", ["-v"], { stdio: "ignore" }).status === 0) {
      const into = join(tmp, "elms");
      mkdirSync(into, { recursive: true });
      run("unar", ["-f", "-o", into, rar]);
      const maps = find(from, (n) => /^Map\.rar$/i.test(n));
      if (maps) run("unar", ["-f", "-o", into, maps]);
      obj = find(into, (n) => /\.obj$/i.test(n));
    } else if (rar) console.log("• Elms: unpack \"American Elm_Fall-obj.rar\" and \"Map.rar\" first (or: brew install unar), then run this again");
  }
  if (!obj) console.log("• Elms: no elm .obj found (skipped)");
  else {
    console.log(`• Elms: ${obj} (${mb(obj)})`);
    const raw = join(tmp, "elms-raw.glb");
    const thin = join(tmp, "elms-thin.glb");
    if (
      run("npx", ["-y", "obj2gltf", "-i", obj, "-o", raw]) &&
      gt("simplify", raw, thin, "--ratio", "0.33", "--error", "0.002") &&
      optimize(thin, join(out, "elms.glb"), 1024)
    ) {
      done.add("elms");
      console.log(`  → public/models/elms.glb (${mb(join(out, "elms.glb"))})\n`);
    }
  }
}

// ---- The soldier outfit: listed, not converted ----
console.log("• Soldier outfit: skipped. It's MetaHuman clothing only (no body or animations), so the game doesn't use it.");

writeFileSync(listFile, JSON.stringify([...done].sort(), null, 2) + "\n");
console.log(`\npublic/models/available.json: ${JSON.stringify([...done].sort())}`);
for (const id of done) {
  const f = join(out, `${id}.glb`);
  if (statSync(f).size > 40 * 1048576) console.log(`  (${id}.glb is ${mb(f)}: over 40 MB, slow to load and near GitHub's 100 MB limit. Try a smaller --texture-size.)`);
}
