import * as THREE from "three";

/*
 * Small helpers for drawing pictures for the 3D world on a <canvas>:
 * sign text, tiles, cork, and the like. Each picture is drawn once.
 */

export const ORANGE = "#ff5a1f";
export const TEAL = "#13a8a0";
export const TEAL_DEEP = "#0b6b67";
export const CREAM = "#f6f1e7";

/** Lets taps pass straight through (glass, trim, signs). */
export const noRaycast = () => null;

export function fontFamily(kind: "display" | "body") {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.documentElement).getPropertyValue(kind === "display" ? "--font-display" : "--font-body").trim() || "sans-serif";
}

export function canvasTexture(canvas: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

const cache = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/**
 * A sign: words on a coloured panel (rounded corners), drawn once and reused.
 * Returns the picture and its width ÷ height.
 */
export function signTexture(text: string, opts: { bg: string; fg: string; height?: number; font?: "display" | "body"; upper?: boolean; pad?: number }) {
  const { bg, fg, height = 128, font = "display", upper = true, pad = 0.45 } = opts;
  const key = `${text}|${bg}|${fg}|${height}|${font}|${upper}|${pad}`;
  let hit = cache.get(key);
  if (!hit) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const size = Math.round(height * 0.62);
    const weight = font === "display" ? 800 : 700;
    ctx.font = `${weight} ${size}px ${fontFamily(font)}`;
    const label = upper ? text.toUpperCase() : text;
    canvas.width = Math.ceil(ctx.measureText(label).width + height * pad * 2);
    canvas.height = height;
    if (bg !== "transparent") {
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, height * 0.14);
      ctx.fill();
    }
    ctx.font = `${weight} ${size}px ${fontFamily(font)}`;
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(label, canvas.width / 2, height / 2 + size * 0.05);
    hit = { texture: canvasTexture(canvas), aspect: canvas.width / canvas.height };
    cache.set(key, hit);
  }
  return hit;
}

/** Random numbers that come out the same every time (for speckled textures). */
export function seededRandom(seed: number) {
  let n = seed;
  return () => (n = (n * 16807) % 2147483647) / 2147483647;
}

/** A gentle 3-step shading ramp, for the cartoon look outside. */
export const toonRamp = (() => {
  let ramp: THREE.DataTexture | null = null;
  return () => {
    if (!ramp) {
      const data = new Uint8Array([110, 110, 110, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
      ramp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
      ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
      ramp.needsUpdate = true;
    }
    return ramp;
  };
})();
