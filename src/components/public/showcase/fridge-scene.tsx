"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { DrinkModel, useFontsReady, type SceneItem } from "./drink-scene";

/*
 * The drinks fridge: every drink on lit shelves, one shelf per brand.
 * With lots of brands it becomes a two-door fridge. Hovering a drink lifts
 * it; clicking a drink (or a shelf's brand tag) opens that brand's flavors.
 *
 * Sizes are in "scene units". A drink model is about 1.9 units tall; on the
 * shelves it's shrunk to SHELF_SCALE.
 */

export type FridgeBrand = { name: string; items: SceneItem[] };
export type FridgePick = { brand: string; itemId: string; x: number; y: number; color: string };

const SHELF_SCALE = 0.33;
const ROW = 0.92; // height of one shelf row
const SLOT = 0.44; // width per drink
const DEPTH = 0.7;
const FRAME = 0.12; // thickness of the fridge walls

/** How far below its middle each shape's bottom is (so drinks stand on the shelf). */
const BASE: Record<SceneItem["look"]["shape"], number> = { can: 0.95, bottle: 0.98, carton: 0.75, pouch: 0.725 };

type Layout = {
  doors: { brands: FridgeBrand[]; width: number; x: number }[];
  rows: number;
  width: number;
  height: number;
};

/** Split brands between one or two doors, and work out the fridge's size. */
function layout(brands: FridgeBrand[], columns: number): Layout {
  const perDoor = Math.ceil(brands.length / columns);
  const groups = Array.from({ length: columns }, (_, i) => brands.slice(i * perDoor, (i + 1) * perDoor)).filter((g) => g.length);
  const doorWidths = groups.map((g) => Math.max(2.4, ...g.map((b) => b.items.length * SLOT + 0.5)));
  const rows = Math.max(...groups.map((g) => g.length));
  const width = doorWidths.reduce((a, b) => a + b, 0) + FRAME * (groups.length + 1);
  let x = -width / 2 + FRAME;
  const doors = groups.map((g, i) => {
    const door = { brands: g, width: doorWidths[i], x: x + doorWidths[i] / 2 };
    x += doorWidths[i] + FRAME;
    return door;
  });
  return { doors, rows, width, height: rows * ROW + 0.35 };
}

export default function FridgeScene({
  brands,
  columns,
  active,
  calm,
  onPick,
  onHover,
}: {
  brands: FridgeBrand[];
  columns: number;
  active: boolean;
  calm: boolean;
  onPick: (pick: FridgePick) => void;
  onHover: (item: SceneItem | null) => void;
}) {
  const fontsReady = useFontsReady();
  const plan = useMemo(() => layout(brands, columns), [brands, columns]);

  return (
    <Canvas dpr={[1, 1.5]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0, 10], fov: 30 }} gl={{ antialias: true, alpha: true }}>
      <FitCamera width={plan.width} height={plan.height} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 5, 6]} intensity={0.8} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 4, 3]} scale={[10, 2, 1]} />
        <Lightformer intensity={1.5} rotation-y={Math.PI / 2} position={[-5, 0, 2]} scale={[10, 1, 1]} />
        <Lightformer intensity={1.5} rotation-y={-Math.PI / 2} position={[5, 0, 2]} scale={[10, 1, 1]} />
      </Environment>

      <Cabinet plan={plan} calm={calm} />
      {fontsReady &&
        plan.doors.map((door) =>
          door.brands.map((brand, row) => (
            <Shelf
              key={brand.name}
              brand={brand}
              x={door.x}
              width={door.width}
              y={plan.height / 2 - 0.25 - (row + 1) * ROW}
              onPick={onPick}
              onHover={onHover}
            />
          )),
        )}
    </Canvas>
  );
}

/** Move the camera back far enough that the whole fridge fits, whatever the screen shape. */
function FitCamera({ width, height }: { width: number; height: number }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const distance = Math.max((height * 1.08) / 2 / tan, (width * 1.1) / 2 / (tan * aspect)) + DEPTH / 2;
    cam.position.set(0, 0, distance);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height, width, height]);
  return null;
}

/**
 * The photo textures for the fridge (public/showcase/fridge/): the lit back
 * panel, the brushed black metal and the frost on the glass. They load in the
 * background; until then the fridge is drawn in plain colors.
 */
function useFridgeTextures() {
  return useMemo(() => {
    const loader = new THREE.TextureLoader();
    const load = (name: string, repeat?: [number, number]) =>
      loader.load(`/showcase/fridge/${name}.webp`, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        if (repeat) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(...repeat);
        }
        t.needsUpdate = true;
      });
    return { wall: load("back-wall"), metal: load("metal", [4, 4]), frost: load("frost") };
  }, []);
}

/** The fridge box: dark metal frame, glowing back wall, door handles. The light flickers on at the start. */
function Cabinet({ plan, calm }: { plan: Layout; calm: boolean }) {
  const textures = useFridgeTextures();
  // One material shared by every door's back panel, so they flicker together.
  const glow = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#dfeeee",
        map: textures.wall,
        emissive: "#ffffff",
        emissiveMap: textures.wall,
        emissiveIntensity: 0,
        roughness: 0.9,
      }),
    [textures.wall],
  );
  const glowRef = useRef(glow);
  useEffect(() => {
    glowRef.current = glow;
  });
  const strip = useRef<THREE.MeshStandardMaterial>(null);
  const born = useRef<number | null>(null);

  useFrame((state) => {
    const wall = glowRef.current;
    if (!strip.current) return;
    born.current ??= state.clock.elapsedTime;
    const t = state.clock.elapsedTime - born.current;
    // Flicker... flicker... on. (Straight on with "reduce motion".)
    const on = calm || t > 1.1 ? 1 : t < 0.15 ? 0 : t < 0.25 ? 0.7 : t < 0.4 ? 0.1 : t < 0.55 ? 0.9 : t < 0.7 ? 0.35 : Math.min(1, (t - 0.7) / 0.4);
    wall.emissiveIntensity = 0.9 * on;
    strip.current.emissiveIntensity = 2.2 * on;
  });

  const { width: W, height: H } = plan;
  const metal = <meshStandardMaterial color="#5a6066" map={textures.metal} metalness={0.6} roughness={0.4} />;

  return (
    <group>
      {/* Glowing back wall, one panel per door (a photo of a lit fridge panel, glowing by its own light) */}
      {plan.doors.map((d, i) => (
        <mesh key={`w${i}`} position={[d.x, 0, -DEPTH / 2]} material={glow}>
          <planeGeometry args={[d.width, H]} />
        </mesh>
      ))}
      {/* Frame: top, bottom, sides and the posts between doors */}
      <mesh position={[0, H / 2 + FRAME / 2, 0]}>
        <boxGeometry args={[W + FRAME * 2, FRAME, DEPTH]} />
        {metal}
      </mesh>
      <mesh position={[0, -H / 2 - FRAME * 1.5, 0]}>
        <boxGeometry args={[W + FRAME * 2, FRAME * 3, DEPTH]} />
        {metal}
      </mesh>
      {[-W / 2 - FRAME / 2, W / 2 + FRAME / 2, ...plan.doors.slice(1).map((d) => d.x - d.width / 2 - FRAME / 2)].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[FRAME, H + FRAME * 2, DEPTH]} />
          {metal}
        </mesh>
      ))}
      {/* Teal light strip along the top */}
      <mesh position={[0, H / 2 - 0.05, DEPTH / 2 - 0.08]}>
        <boxGeometry args={[W - 0.1, 0.04, 0.04]} />
        <meshStandardMaterial ref={strip} color="#13a8a0" emissive="#13a8a0" emissiveIntensity={0} />
      </mesh>
      {/* Door handles */}
      {plan.doors.map((d, i) => (
        <RoundedBox
          key={i}
          args={[0.06, Math.min(1.6, H * 0.5), 0.08]}
          radius={0.03}
          position={[i === plan.doors.length - 1 ? d.x - d.width / 2 + 0.12 : d.x + d.width / 2 - 0.12, 0, DEPTH / 2 + 0.06]}
        >
          <meshStandardMaterial color="#c8ced4" metalness={1} roughness={0.25} />
        </RoundedBox>
      ))}
      {/* Frost creeping up from the bottom of the glass (clicks pass straight through it) */}
      {plan.doors.map((d, i) => (
        <mesh key={`f${i}`} position={[d.x, 0, DEPTH / 2 + 0.001]} raycast={() => null} renderOrder={2}>
          <planeGeometry args={[d.width, H]} />
          <meshBasicMaterial map={textures.frost} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {/* A couple of faint reflections, so it reads as a glass door */}
      {plan.doors.map((d, i) => (
        <mesh key={`g${i}`} position={[d.x - d.width * 0.22, 0, DEPTH / 2]} rotation-z={-0.12}>
          <planeGeometry args={[0.14, H * 0.92]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.07} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** One shelf: a glass plate, its brand's drinks standing on it, and a brand tag. */
function Shelf({
  brand,
  x,
  width,
  y,
  onPick,
  onHover,
}: {
  brand: FridgeBrand;
  x: number;
  width: number;
  y: number;
  onPick: (pick: FridgePick) => void;
  onHover: (item: SceneItem | null) => void;
}) {
  const n = brand.items.length;
  const startX = -((n - 1) * SLOT) / 2;
  const pick = (item: SceneItem, e?: ThreeEvent<MouseEvent>) =>
    onPick({
      brand: brand.name,
      itemId: item.id,
      x: e?.nativeEvent.clientX ?? window.innerWidth / 2,
      y: e?.nativeEvent.clientY ?? window.innerHeight / 2,
      color: item.look.color,
    });

  return (
    <group position={[x, y, 0]}>
      {/* Glass shelf with a lit front edge */}
      <mesh>
        <boxGeometry args={[width - 0.04, 0.025, DEPTH - 0.08]} />
        <meshPhysicalMaterial color="#cfe9e7" roughness={0.1} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -0.01, DEPTH / 2 - 0.04]}>
        <boxGeometry args={[width - 0.04, 0.05, 0.01]} />
        <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={0.6} />
      </mesh>

      {brand.items.map((item, i) => (
        <ShelfDrink key={item.id} item={item} x={startX + i * SLOT} onPick={(e) => pick(item, e)} onHover={onHover} />
      ))}

      {/* Brand tag on the shelf edge (keyboard users get real buttons, outside the 3D) */}
      <BrandTag name={brand.name} count={n} onClick={() => pick(brand.items[0])} />
    </group>
  );
}

/** A little black price-rail tag with the brand name, drawn onto a plane. */
function BrandTag({ name, count, onClick }: { name: string; count: number; onClick: () => void }) {
  const { texture, aspect } = useMemo(() => {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || "sans-serif";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const h = 64;
    ctx.font = `700 34px ${family}`;
    const label = `${name}  ${count}`;
    const w = Math.ceil(ctx.measureText(label).width) + 36;
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fill();
    ctx.font = `700 34px ${family}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(name, 18, h / 2 + 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(String(count), 18 + ctx.measureText(`${name}  `).width, h / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, aspect: w / h };
  }, [name, count]);
  const height = 0.13;

  return (
    <mesh
      // Centered under the shelf's drinks, clear of the door handles.
      position={[0, -0.1, DEPTH / 2 + 0.005]}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/** A drink on a shelf: stands on the glass, lifts when you point at it. */
function ShelfDrink({
  item,
  x,
  onPick,
  onHover,
}: {
  item: SceneItem;
  x: number;
  onPick: (e: ThreeEvent<MouseEvent>) => void;
  onHover: (item: SceneItem | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  // A small random-looking turn, so the rows don't look copy-pasted.
  const turn = useMemo(() => ((item.id.charCodeAt(0) + item.id.charCodeAt(1)) % 7) * 0.08 - 0.24, [item.id]);
  const baseY = 0.0125 + BASE[item.look.shape] * SHELF_SCALE;

  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, delta * 10);
    g.position.y = THREE.MathUtils.lerp(g.position.y, baseY + (hover ? 0.12 : 0), k);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, SHELF_SCALE * (hover ? 1.12 : 1), k));
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, hover ? 0 : turn, k);
  });

  return (
    <group
      ref={ref}
      position={[x, baseY, 0]}
      scale={SHELF_SCALE}
      rotation-y={turn}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        onHover(item);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "";
        onPick(e);
      }}
    >
      <DrinkModel item={item} />
    </group>
  );
}
