import * as THREE from "three";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { FLAME_PATH } from "@/components/brand-mark";
import fontData from "./big-shoulders-bold.typeface.json";

/*
 * Real 3D (extruded) letters in the store's own typeface, Big Shoulders Bold
 * (converted once into big-shoulders-bold.typeface.json; only the letters the
 * signs need). And the flame from the logo, as a 3D shape.
 */

// three.js's font format, with the glyphs we converted.
const font = new Font(fontData as unknown as ConstructorParameters<typeof Font>[0]);

const cache = new Map<string, THREE.BufferGeometry>();

/** One letter (or a whole word), `size` tall, `depth` thick, centred on its baseline middle. */
export function letterGeometry(text: string, size: number, depth: number) {
  const key = `${text}|${size}|${depth}`;
  let g = cache.get(key);
  if (!g) {
    const t = new TextGeometry(text, {
      font,
      size,
      depth,
      curveSegments: 6,
      bevelEnabled: true,
      bevelThickness: depth * 0.18,
      bevelSize: size * 0.02,
      bevelSegments: 2,
    });
    t.computeBoundingBox();
    const box = t.boundingBox!;
    t.translate(-(box.min.x + box.max.x) / 2, 0, -depth / 2);
    g = t;
    cache.set(key, g);
  }
  return g;
}

/** How wide a word is in letters of this size (for spacing letters out one by one). */
export function advanceOf(ch: string, size: number) {
  const glyph = (fontData as { glyphs: Record<string, { ha: number }> }).glyphs[ch] ?? { ha: 600 };
  return (glyph.ha / (fontData as { resolution: number }).resolution) * size;
}

/** The logo's flame as a 3D shape, `size` tall, standing up and centred. */
export function flameGeometry(size: number, depth: number) {
  const key = `flame|${size}|${depth}`;
  let g = cache.get(key);
  if (!g) {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill-rule="evenodd" d="${FLAME_PATH}"/></svg>`);
    const shapes = data.paths.flatMap((p) => p.toShapes());
    const e = new THREE.ExtrudeGeometry(shapes, { depth: depth * (32 / size), bevelEnabled: false, curveSegments: 8 });
    // SVG's y points down: flip it, then scale to size and centre it.
    e.scale(size / 32, -size / 32, size / 32);
    e.computeBoundingBox();
    const b = e.boundingBox!;
    e.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    e.computeVertexNormals();
    g = e;
    cache.set(key, g);
  }
  return g;
}
