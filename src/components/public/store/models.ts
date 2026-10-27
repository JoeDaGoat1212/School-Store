"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ItemModel } from "./catalog";

/*
 * The 3D shapes and finishes for products in the store. Each product's shape
 * and finish is made once and shared by all its copies on the shelves.
 *
 *   lathe: drinks and cups, their traced outline spun round (see drink-models.ts)
 *   pack:  bags and bars: a cut-out photo pushed out by its "depth" picture,
 *          front and back, so it bulges like a real bag
 *   box:   anything without a model yet, a box with its name printed on
 */

// ---- Pictures --------------------------------------------------------------------

const textures = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<THREE.Texture>>();

function loadTexture(url: string) {
  const cached = textures.get(url);
  if (cached) return Promise.resolve(cached);
  let p = pending.get(url);
  if (!p) {
    p = new Promise((resolve, reject) =>
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          textures.set(url, t);
          resolve(t);
        },
        undefined,
        reject,
      ),
    );
    pending.set(url, p);
  }
  return p;
}

/** A picture as a 3D texture (null while it downloads). Shared: each picture downloads once. */
export function useTexture(url: string, setup?: (t: THREE.Texture) => void) {
  const [texture, setTexture] = useState<THREE.Texture | null>(() => textures.get(url) ?? null);
  useEffect(() => {
    if (texture) return;
    let alive = true;
    loadTexture(url).then((t) => {
      setup?.(t);
      if (alive) setTexture(t);
    });
    return () => {
      alive = false;
    };
    // `setup` is only used the first time the picture loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, texture]);
  return texture;
}

const depths = new Map<string, { data: Uint8ClampedArray; w: number; h: number }>();

/** The grey "how far it bulges" picture of a pack, read into numbers. */
function loadDepth(url: string) {
  const cached = depths.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise<{ data: Uint8ClampedArray; w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const d = { data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
      depths.set(url, d);
      resolve(d);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ---- Shapes ------------------------------------------------------------------------

const geometries = new Map<string, THREE.BufferGeometry>();

function latheGeometry(model: Extract<ItemModel, { type: "lathe" }>) {
  const key = `lathe:${model.slug}`;
  let g = geometries.get(key);
  if (!g) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < model.profile.length; i += 2) pts.push(new THREE.Vector2(model.profile[i], model.profile[i + 1]));
    // phiStart = π puts the front of the label at the front.
    g = new THREE.LatheGeometry(pts, 40, Math.PI, Math.PI * 2);
    const s = model.height / 1.9;
    g.scale(s, s, s);
    g.computeVertexNormals();
    geometries.set(key, g);
  }
  return g;
}

function packGeometry(model: Extract<ItemModel, { type: "pack" }>, depth: { data: Uint8ClampedArray; w: number; h: number }) {
  const key = `pack:${model.slug}`;
  let g = geometries.get(key);
  if (!g) {
    const sx = 36;
    const sy = Math.max(6, Math.round(36 * (model.height / model.width)));
    const front = new THREE.PlaneGeometry(model.width, model.height, sx, sy);
    const pos = front.attributes.position;
    const uv = front.attributes.uv;
    const at = (u: number, v: number) => {
      // Bilinear sample of the depth picture (v = 1 is the top of the picture).
      const x = u * (depth.w - 1);
      const y = (1 - v) * (depth.h - 1);
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const x1 = Math.min(depth.w - 1, x0 + 1);
      const y1 = Math.min(depth.h - 1, y0 + 1);
      const px = (xx: number, yy: number) => depth.data[(yy * depth.w + xx) * 4] / 255;
      const fx = x - x0;
      const fy = y - y0;
      return (px(x0, y0) * (1 - fx) + px(x1, y0) * fx) * (1 - fy) + (px(x0, y1) * (1 - fx) + px(x1, y1) * fx) * fy;
    };
    for (let i = 0; i < pos.count; i++) pos.setZ(i, at(uv.getX(i), uv.getY(i)) * model.puff);
    front.computeVertexNormals();
    // The back is the same shape turned round, so its picture reads the right way from behind.
    const back = front.clone();
    back.rotateY(Math.PI);
    g = mergeGeometries([front, back])!;
    front.dispose();
    back.dispose();
    geometries.set(key, g);
  }
  return g;
}

function boxGeometry(model: Extract<ItemModel, { type: "box" }>) {
  const key = `box:${model.width}:${model.height}:${model.depth}`;
  let g = geometries.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(model.width, model.height, model.depth);
    geometries.set(key, g);
  }
  return g;
}

// ---- Finishes ------------------------------------------------------------------------

const materials = new Map<string, THREE.Material | THREE.Material[]>();

/** A plain box's front: its colour with its name printed on it. */
function nameCard(name: string, color: string, aspect: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = Math.round(256 * aspect);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
  let size = 64;
  ctx.font = `800 ${size}px ${family}`;
  while (ctx.measureText(name.toUpperCase()).width > canvas.width * 0.86 && size > 18) ctx.font = `800 ${(size -= 4)}px ${family}`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase(), canvas.width / 2, canvas.height / 2);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Look = { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] };

/**
 * The shape and finish for a product, once its pictures have downloaded
 * (null until then, and the product pops onto the shelf when ready).
 */
export function useLook(model: ItemModel, name: string, color: string): Look | null {
  const key = model.type === "box" ? `box:${name}` : `${model.type}:${model.slug}`;
  const [look, setLook] = useState<Look | null>(() => {
    const g = geometries.get(model.type === "box" ? `box:${model.width}:${model.height}:${model.depth}` : key);
    const m = materials.get(key);
    return g && m ? { geometry: g, material: m } : null;
  });

  useEffect(() => {
    if (look) return;
    let alive = true;
    const done = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) => {
      materials.set(key, material);
      if (alive) setLook({ geometry, material });
    };
    if (model.type === "lathe") {
      loadTexture(`/showcase/drinks/${model.slug}-sm.webp`).then((map) => {
        const m =
          (materials.get(key) as THREE.Material) ??
          new THREE.MeshStandardMaterial({
            map,
            roughness: model.kind === "bottle" ? 0.28 : 0.36,
            metalness: 0.05,
            envMapIntensity: 0.55,
            transparent: Boolean(model.clear),
            depthWrite: !model.clear,
          });
        done(latheGeometry(model), m);
      });
    } else if (model.type === "pack") {
      Promise.all([loadTexture(`/showcase/snacks/${model.slug}.webp`), loadDepth(`/showcase/snacks/${model.slug}-depth.png`)]).then(([map, depth]) => {
        const m =
          (materials.get(key) as THREE.Material) ??
          // Wrappers are shiny plastic or foil; the cut-out's see-through edge trims the shape.
          new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.32, metalness: 0.12, envMapIntensity: 0.7 });
        done(packGeometry(model, depth), m);
      });
    } else {
      const plain = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const front = new THREE.MeshStandardMaterial({ map: nameCard(name, color, model.height / model.width), roughness: 0.5 });
      // Box faces: right, left, top, bottom, front, back.
      done(boxGeometry(model), [plain, plain, plain, plain, front, front]);
    }
    return () => {
      alive = false;
    };
  }, [look, key, model, name, color]);

  return look;
}
