import { useSyncExternalStore } from "react";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/*
 * The asset manifest: the 3D models downloaded from CGTrader, what each one
 * is for, where its optimized web copy lives (public/models/…), and who
 * made it. Plain TypeScript plus one React hook.
 *
 * The downloads themselves are far too big to send to a browser as they
 * are (the car's .glb alone is 46 MB; the trees and the soldier are .rar /
 * .fbx / .blend, which browsers can't load at all). So:
 *
 *   1. scripts/optimize-models.sh turns them into small .glb files in
 *      public/models/ (meshopt-compressed geometry, WebP textures capped at
 *      1–2K, fewer triangles), and writes public/models/available.json,
 *      the list of what's there.
 *   2. The game reads available.json once. Anything listed loads in the
 *      background after the world's up, and replaces (or joins) what's
 *      drawn now. Anything not listed just isn't used: the game looks
 *      and plays exactly as before, with no errors and no missing-file
 *      requests.
 *
 * Every loaded mesh casts and receives shadows and keeps frustum culling on
 * (three.js skips anything outside the camera's view).
 */

export type AssetId = "revuelto" | "terminal" | "elms" | "soldier";

export type Asset = {
  id: AssetId;
  /** What it is (for people). */
  label: string;
  /** The files as downloaded (from the CGTrader download page), and the one the optimizer starts from. */
  downloads: string[];
  source: string;
  /** The optimized copy the game loads. */
  url: string;
  /** What the game does with it. */
  use: string;
  /**
   * Fitting it to the world: the size it's scaled to (units: the longest
   * side across the ground, or the height), turned (radians) if it comes in
   * facing the wrong way, squared up first if it's sitting at an angle in its
   * file (align), and stretched a little across and up (stretch: [across, up])
   * to match the game's chunkier cars.
   */
  fit: { size: number; by: "length" | "height"; turn?: number; align?: boolean; stretch?: [number, number] };
  /** Who made it (CGTrader asks for credit). */
  credit: { author: string; page: string };
  /** False: listed for the record, but not used (see `use`). */
  wired: boolean;
};

export const ASSETS: Record<AssetId, Asset> = {
  revuelto: {
    id: "revuelto",
    label: "Lamborghini Revuelto (free low-poly)",
    downloads: ["Lamborghini Revuelto.glb (46.1 MB)", "Lamborghini Revuelto.fbx (36.8 MB)", "Lamborghini Revuelto.obj (61.5 MB)", "Lamborghini Revuelto.mtl (10.1 KB)", "Lamborghini Revuelto.blend (53.5 MB)", "textures.zip (15.9 MB)"],
    source: "Lamborghini Revuelto.glb",
    url: "/models/revuelto.glb",
    use: "The body of a new supercar at Apex Motors (the Vanta Revuelto), wherever it's parked, driven or shown in the dealership.",
    // The game's own cars are drawn chunky: about 7.75 long, 4.5 wide and 2.2 tall. The real car is lower and narrower, so it's
    // scaled to 8 long and filled out 15% across and up to sit right beside them. Its nose comes in toward +z: turned to face -z like every car here.
    fit: { size: 8, by: "length", turn: Math.PI, stretch: [1.15, 1.15] },
    credit: { author: "AnatolianStudios", page: "https://www.cgtrader.com/items/7588572" },
    wired: true,
  },
  terminal: {
    id: "terminal",
    label: "Muscat Airport Terminal (high-quality exterior)",
    downloads: ["modern+airport+terminal+3d+model.glb (22.8 MB)", "modern+airport+terminal+3d+model.fbx (33 MB)", "cgtrader_optimized_modern+airport+terminal+3d+model.fbx (30.3 MB)", "modern+airport+terminal+3d+model.usdz (35.2 MB)", "modern+airport+terminal+3d+model.stl (46 MB)", "modern+airport+terminal+3d+model.3mf (14.8 MB)", "modern+airport+terminal+3d+model.zip (15.2 MB)", "cgtrader_optimized_textures_…zip (930 KB)"],
    source: "modern+airport+terminal+3d+model.glb",
    url: "/models/terminal.glb",
    use: "Firebird International's terminal and office tower, life size, in place of the old terminal and control tower (the runway, taxiway, apron, hangar and planes stay). Solid: you bump into it and the camera won't go through it.",
    // Life size: the tower stands 150 units (about 85 m, 24 floors, at the game's scale of people). It sits at an angle in its file: squared up first.
    fit: { size: 150, by: "height", align: true, turn: 0 },
    credit: { author: "CGTrader item 6830356", page: "https://www.cgtrader.com/items/6830356" },
    wired: true,
  },
  elms: {
    id: "elms",
    label: "American Elm, fall (5 trees in one scene)",
    downloads: ["American Elm_Fall-obj.rar (49.4 MB)", "American Elm_Fall-vray-FBX.rar (92.3 MB)", "American Elm_Fall-corona-FBX.rar (92.3 MB)", "American Elm_Fall-vray.rar (94.1 MB)", "American Elm_Fall-corona.rar (94.2 MB)", "American Elm_Fall Standard.rar (94.2 MB)", "Map.rar (1.48 MB)"],
    source: "American Elm_Fall-obj.rar → the .obj inside (plus Map.rar for its textures)",
    url: "/models/elms.glb",
    use: "Autumn elms down both avenues of Crescent Heights, in place of the trees there now: the 5 trees are split apart and each is drawn with one InstancedMesh per part (a few draw calls for the whole avenue).",
    fit: { size: 13, by: "height" },
    credit: { author: "PANDORA-Land", page: "https://www.cgtrader.com/items/2796496" },
    wired: true,
  },
  soldier: {
    id: "soldier",
    label: "Soldier Outfit for Unreal Engine MetaHuman",
    downloads: ["Soldier_Helmet_Outfit_v1.fbx (2.81 MB)", "Soldier_Outfit_v1.fbx (22.7 MB)", "Tactical_Outfit_v1.blend (504 MB)", "Soldier_Outfit_Textures.zip (442 MB)"],
    source: "Soldier_Outfit_v1.fbx + Soldier_Helmet_Outfit_v1.fbx",
    url: "/models/soldier.glb",
    // Not usable as the player: it's clothing made to fit an Unreal MetaHuman body. There's no body, face or hands in it, and no walking animations.
    use: "Not used. It's only the clothes for an Unreal MetaHuman (no body, hands or face, and no animations), so it can't be the player on its own.",
    fit: { size: 3.1, by: "height" },
    credit: { author: "rahulmathewdavid66", page: "https://www.cgtrader.com/items/7668868" },
    wired: false,
  },
};

// ---- What's there, and loading it ------------------------------------------------------------------

type State = "unknown" | "missing" | "loading" | "ready" | "failed";
const state = new Map<AssetId, State>();
const scenes = new Map<AssetId, THREE.Group>();
const subs = new Set<() => void>();
let available: Promise<Set<string>> | null = null;
let version = 0;

function changed() {
  version++;
  for (const f of subs) f();
}

/** public/models/available.json (written by the optimizer): the ids that have a web copy. */
function availableIds() {
  if (!available)
    available = fetch("/models/available.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: unknown) => new Set(Array.isArray(list) ? list.map(String) : []))
      .catch(() => new Set<string>());
  return available;
}

let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    // The optimizer compresses the geometry with meshopt (decoded here, no extra downloads).
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** Make a loaded model ready to draw: shadows on, frustum culling on, bounds worked out, textures filtered well. */
export function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = true;
    m.visible = true;
    m.geometry.computeBoundingSphere();
    m.geometry.computeBoundingBox();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const sm = mat as THREE.MeshStandardMaterial;
      if (sm.map) sm.map.anisotropy = 8;
      // Leaves and fences come with see-through textures: cut them out rather than blending (no sorting, no see-through glitches, and they cast proper shadows).
      if (sm.alphaMap || (sm.transparent && sm.map)) {
        sm.transparent = false;
        sm.alphaTest = 0.45;
        sm.side = THREE.DoubleSide;
      }
      sm.needsUpdate = true;
    }
  });
}

/** Start loading a model (if it's there). Safe to call over and over. */
export function requestAsset(id: AssetId) {
  const st = state.get(id) ?? "unknown";
  if (st !== "unknown") return;
  state.set(id, "loading");
  void availableIds().then((ids) => {
    if (!ids.has(id) || !ASSETS[id].wired) {
      state.set(id, "missing");
      changed();
      return;
    }
    gltfLoader().load(
      ASSETS[id].url,
      (g: GLTF) => {
        prepare(g.scene);
        scenes.set(id, g.scene);
        state.set(id, "ready");
        console.info(`[assets] ${id} loaded (${ASSETS[id].url})`);
        changed();
      },
      undefined,
      (err) => {
        console.warn(`[assets] ${id} failed to load`, err);
        state.set(id, "failed");
        changed();
      },
    );
  });
}

/** The loaded model (the original: clone it to place it more than once), or null. */
export const assetScene = (id: AssetId) => scenes.get(id) ?? null;
export const assetState = (id: AssetId): State => state.get(id) ?? "unknown";

/** React: this model once it's loaded (null before then, or if it isn't there). Starts the load. */
export function useAsset(id: AssetId) {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      requestAsset(id);
      return () => subs.delete(f);
    },
    () => version,
    () => 0,
  );
  return assetScene(id);
}

// ---- Fitting a model to the world ------------------------------------------------------------------

/**
 * Scale and turn a model so it's `fit.size` along its longest side (or
 * tall), standing on y = 0 and centred on x, z = 0 (its longest side along
 * z, as the cars are).
 */
export function fitted(root: THREE.Object3D, fit: Asset["fit"]) {
  root.removeFromParent();
  // Squared up: turned so its footprint's edges run along x and z.
  const spin = new THREE.Group();
  spin.add(root);
  if (fit.align) spin.rotation.y = footprintAngle(root);
  spin.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(spin);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  // Centred, standing on the ground (moved by, not to: the model keeps its own placement inside).
  spin.position.set(-c.x, -box.min.y, -c.z);
  const k = fit.by === "height" ? fit.size / Math.max(1e-3, size.y) : fit.size / Math.max(1e-3, Math.max(size.x, size.z));
  // Longest side along z (as the cars are), then any turn the manifest asks for.
  const turn = new THREE.Group();
  turn.rotation.y = (size.x > size.z ? Math.PI / 2 : 0) + (fit.turn ?? 0);
  turn.add(spin);
  // The size (and any stretch across and up), applied after the turn so "across" really is across.
  const out = new THREE.Group();
  const [across, up] = fit.stretch ?? [1, 1];
  out.scale.set(k * across, k * up, k);
  out.add(turn);
  return out;
}

/**
 * The turn (about y) that squares a model's footprint up with x and z: the
 * angle whose bounding rectangle round the model's points is smallest.
 */
export function footprintAngle(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const xs: number[] = [];
  const zs: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      xs.push(v.x);
      zs.push(v.z);
    }
  });
  let best = 0;
  let bestArea = Infinity;
  for (let deg = 0; deg < 90; deg += 0.5) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let u0 = Infinity;
    let u1 = -Infinity;
    let w0 = Infinity;
    let w1 = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      // (Where three.js's rotation.y = a puts the point.)
      const u = xs[i] * c + zs[i] * s;
      const w = -xs[i] * s + zs[i] * c;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (w < w0) w0 = w;
      if (w > w1) w1 = w;
    }
    const area = (u1 - u0) * (w1 - w0);
    if (area < bestArea - 1e-6) {
      bestArea = area;
      best = a;
    }
  }
  return best;
}

/**
 * Split a model of several trees standing side by side into the separate
 * trees. First by how the file's arranged (one group or object per tree,
 * the usual way); failing that, by where the meshes stand (meshes whose
 * middles are close belong together: the canopies may overlap, so it goes
 * by the middle of each part, not its whole spread). Each tree comes back
 * standing on y = 0, centred on its trunk, with its height.
 */
export function splitTrees(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const meshesIn = (o: THREE.Object3D) => {
    const list: THREE.Mesh[] = [];
    o.traverse((x) => (x as THREE.Mesh).isMesh && list.push(x as THREE.Mesh));
    return list;
  };
  // 1. The file's own grouping: go down through single wrappers to the first level with several children that have meshes in them.
  let level: THREE.Object3D = root;
  for (let d = 0; d < 6; d++) {
    const kids = level.children.filter((c) => meshesIn(c).length > 0);
    if (kids.length === 1) level = kids[0];
    else break;
  }
  let groups: THREE.Mesh[][] = level.children.map(meshesIn).filter((g) => g.length > 0);
  // 2. Otherwise (or if that gave something odd): by where each part's middle stands.
  if (groups.length < 2 || groups.length > 12) {
    const all = meshesIn(root);
    const info = all.map((m) => {
      const b = new THREE.Box3().setFromObject(m);
      return { m, c: b.getCenter(new THREE.Vector3()), r: Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.2 };
    });
    const group = info.map((_, i) => i);
    const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
    for (let i = 0; i < info.length; i++)
      for (let j = i + 1; j < info.length; j++) if (Math.hypot(info[i].c.x - info[j].c.x, info[i].c.z - info[j].c.z) < Math.max(info[i].r, info[j].r)) group[find(i)] = find(j);
    const byRoot = new Map<number, THREE.Mesh[]>();
    info.forEach((x, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), x.m]));
    groups = [...byRoot.values()];
  }
  return groups.map((meshes) => {
    const box = new THREE.Box3();
    for (const m of meshes) box.union(new THREE.Box3().setFromObject(m));
    const c = box.getCenter(new THREE.Vector3());
    const to = new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z);
    return {
      parts: meshes.map((m) => ({ geometry: m.geometry, material: m.material, matrix: to.clone().multiply(m.matrixWorld) })),
      height: box.max.y - box.min.y,
    };
  });
}
