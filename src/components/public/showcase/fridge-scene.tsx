"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { DrinkModel, modelBase, useFontsReady } from "./drink-scene";
import { DEPTH, FRAME, ROW, ROW_DEPTH, SCALE, type FridgeLayout, type PlacedFlavor } from "./fridge-layout";

/*
 * The drinks fridge: one big glass door, every shelf packed with drinks
 * (see fridge-layout.ts for where each one goes). Pointing at a drink lifts
 * it; clicking it adds one to the cart (the page around the fridge does that,
 * through `onTap`) and the drink gives a little hop.
 */

export type FridgeTap = { flavor: PlacedFlavor; x: number; y: number };

export default function FridgeScene({
  layout,
  active,
  calm,
  onTap,
  onHover,
}: {
  layout: FridgeLayout;
  active: boolean;
  calm: boolean;
  onTap: (tap: FridgeTap) => void;
  onHover: (flavor: PlacedFlavor | null) => void;
}) {
  const fontsReady = useFontsReady();

  return (
    <Canvas dpr={[1, 1.75]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0, 10], fov: 26 }} gl={{ antialias: true, alpha: true }}>
      <FitCamera width={layout.width + FRAME * 2} height={layout.height + FRAME * 4} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 5, 6]} intensity={0.8} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 4, 3]} scale={[10, 2, 1]} />
        <Lightformer intensity={1.5} rotation-y={Math.PI / 2} position={[-5, 0, 2]} scale={[10, 1, 1]} />
        <Lightformer intensity={1.5} rotation-y={-Math.PI / 2} position={[5, 0, 2]} scale={[10, 1, 1]} />
      </Environment>

      <Cabinet layout={layout} calm={calm} />
      {layout.shelves.map((shelf, i) => (
        <Shelf key={i} flavors={shelf} width={layout.width} y={layout.height / 2 - 0.2 - (i + 1) * ROW} showTags={fontsReady} onTap={onTap} onHover={onHover} />
      ))}
    </Canvas>
  );
}

/** Move the camera back far enough that the whole fridge fits, looking down on it a little so the rows behind show. */
function FitCamera({ width, height }: { width: number; height: number }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const distance = Math.max((height * 1.04) / 2 / tan, (width * 1.04) / 2 / (tan * aspect)) + DEPTH / 2;
    cam.position.set(0, distance * 0.09, distance);
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

/** The fridge box: dark metal frame, glowing back wall, door handle, frosty glass. The light flickers on at the start. */
function Cabinet({ layout, calm }: { layout: FridgeLayout; calm: boolean }) {
  const textures = useFridgeTextures();
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const strip = useRef<THREE.MeshStandardMaterial>(null);
  const born = useRef<number | null>(null);

  useFrame((state) => {
    if (!glow.current || !strip.current) return;
    born.current ??= state.clock.elapsedTime;
    const t = state.clock.elapsedTime - born.current;
    // Flicker... flicker... on. (Straight on with "reduce motion".)
    const on = calm || t > 1.1 ? 1 : t < 0.15 ? 0 : t < 0.25 ? 0.7 : t < 0.4 ? 0.1 : t < 0.55 ? 0.9 : t < 0.7 ? 0.35 : Math.min(1, (t - 0.7) / 0.4);
    glow.current.emissiveIntensity = 0.9 * on;
    strip.current.emissiveIntensity = 2.2 * on;
  });

  const { width: W, height: H } = layout;
  const metal = <meshStandardMaterial color="#5a6066" map={textures.metal} metalness={0.6} roughness={0.4} />;

  return (
    <group>
      {/* Glowing back wall (a photo of a lit fridge panel, glowing by its own light) */}
      <mesh position={[0, 0, -DEPTH / 2]}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          ref={glow}
          color="#dfeeee"
          map={textures.wall}
          emissive="#ffffff"
          emissiveMap={textures.wall}
          emissiveIntensity={0}
          roughness={0.9}
        />
      </mesh>
      {/* Frame: top, bottom (deeper, like the grille of a real fridge) and sides */}
      <mesh position={[0, H / 2 + FRAME / 2, 0]}>
        <boxGeometry args={[W + FRAME * 2, FRAME, DEPTH]} />
        {metal}
      </mesh>
      <mesh position={[0, -H / 2 - FRAME * 1.5, 0]}>
        <boxGeometry args={[W + FRAME * 2, FRAME * 3, DEPTH]} />
        {metal}
      </mesh>
      {[-W / 2 - FRAME / 2, W / 2 + FRAME / 2].map((x) => (
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
      {/* The door handle, on the frame so it never covers a drink */}
      <RoundedBox args={[0.07, Math.min(2.2, H * 0.45), 0.09]} radius={0.035} position={[W / 2 + FRAME / 2, 0, DEPTH / 2 + 0.07]}>
        <meshStandardMaterial color="#c8ced4" metalness={1} roughness={0.25} />
      </RoundedBox>
      {/* Frost creeping up from the bottom of the glass (clicks pass straight through it) */}
      <mesh position={[0, 0, DEPTH / 2 + 0.001]} raycast={() => null} renderOrder={2}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={textures.frost} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Faint reflections, so it reads as a glass door */}
      {[-0.3, -0.24].map((k, i) => (
        <mesh key={k} position={[W * k, 0, DEPTH / 2 + 0.002]} rotation-z={-0.12} raycast={() => null}>
          <planeGeometry args={[i ? 0.05 : 0.16, H * 0.94]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.06} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** One glass shelf with a lit front edge, its drinks, and a price tag under each flavor. */
function Shelf({
  flavors,
  width,
  y,
  showTags,
  onTap,
  onHover,
}: {
  flavors: PlacedFlavor[];
  width: number;
  y: number;
  showTags: boolean;
  onTap: (tap: FridgeTap) => void;
  onHover: (flavor: PlacedFlavor | null) => void;
}) {
  return (
    <group position={[0, y, 0]}>
      <mesh>
        <boxGeometry args={[width - 0.02, 0.025, DEPTH - 0.06]} />
        <meshPhysicalMaterial color="#cfe9e7" roughness={0.1} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -0.012, DEPTH / 2 - 0.03]}>
        <boxGeometry args={[width - 0.02, 0.05, 0.01]} />
        <meshStandardMaterial color="#ff5a1f" emissive="#ff5a1f" emissiveIntensity={0.6} />
      </mesh>

      {flavors.map((flavor) => (
        <FlavorGroup key={flavor.item.id} flavor={flavor} onTap={onTap} onHover={onHover} />
      ))}
      {showTags &&
        flavors.map((flavor) => (
          <PriceTag key={flavor.item.id} flavor={flavor} onClick={(e) => onTap({ flavor, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })} />
        ))}
    </group>
  );
}

/** One flavor: side-by-side copies ("facings"), one to three rows deep. */
function FlavorGroup({ flavor, onTap, onHover }: { flavor: PlacedFlavor; onTap: (tap: FridgeTap) => void; onHover: (flavor: PlacedFlavor | null) => void }) {
  const spots = useMemo(() => {
    const list: { x: number; z: number; front: boolean; key: string }[] = [];
    const start = flavor.x - ((flavor.facings - 1) * flavor.step) / 2;
    for (let row = 0; row < flavor.rows; row++) {
      for (let i = 0; i < flavor.facings; i++) {
        list.push({ x: start + i * flavor.step, z: DEPTH / 2 - 0.25 - row * ROW_DEPTH, front: row === 0, key: `${row}-${i}` });
      }
    }
    return list;
  }, [flavor]);

  return (
    <>
      {spots.map((s) => (
        <ShelfDrink key={s.key} flavor={flavor} x={s.x} z={s.z} seed={s.key} onTap={onTap} onHover={onHover} />
      ))}
    </>
  );
}

/** A drink on a shelf: lifts when you point at it, hops when it's added to the cart. */
function ShelfDrink({
  flavor,
  x,
  z,
  seed,
  onTap,
  onHover,
}: {
  flavor: PlacedFlavor;
  x: number;
  z: number;
  seed: string;
  onTap: (tap: FridgeTap) => void;
  onHover: (flavor: PlacedFlavor | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const hopAt = useRef(-10);
  const clock = useRef(0);
  // A small random-looking turn, so the rows don't look copy-pasted.
  const turn = useMemo(() => {
    let h = 0;
    for (const ch of flavor.item.id + seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ((h % 9) - 4) * 0.06;
  }, [flavor.item.id, seed]);
  const baseY = 0.0125 + modelBase(flavor.item) * SCALE;

  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    clock.current = state.clock.elapsedTime;
    const k = Math.min(1, delta * 10);
    // The hop: up and back down over half a second.
    const since = state.clock.elapsedTime - hopAt.current;
    const hop = since < 0.5 ? Math.sin((since / 0.5) * Math.PI) * 0.22 : 0;
    // Where it rests (a little higher while pointed at), plus the hop on top.
    const rest = THREE.MathUtils.lerp(g.userData.rest ?? baseY, baseY + (hover ? 0.08 : 0), k);
    g.userData.rest = rest;
    g.position.y = rest + hop;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, hover ? 0 : turn, k);
  });

  return (
    <group
      ref={ref}
      position={[x, baseY, z]}
      scale={SCALE}
      rotation-y={turn}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        onHover(flavor);
        document.body.style.cursor = flavor.soldOut ? "not-allowed" : "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (!flavor.soldOut) hopAt.current = clock.current;
        onTap({ flavor, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }}
    >
      <DrinkModel item={flavor.item} small />
    </group>
  );
}

/** The little price tag on the shelf edge under a flavor ("Coke $2.00", or "Sold out"). */
function PriceTag({ flavor, onClick }: { flavor: PlacedFlavor; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const { texture, aspect } = useMemo(() => {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || "sans-serif";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const h = 64;
    const name = flavor.item.name;
    const price = flavor.soldOut ? "Sold out" : flavor.label;
    ctx.font = `700 30px ${family}`;
    const nameW = ctx.measureText(name).width;
    ctx.font = `800 32px ${family}`;
    const priceW = ctx.measureText(price).width;
    const w = Math.ceil(nameW + priceW + 52);
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.font = `700 30px ${family}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(name, 16, h / 2 + 2);
    ctx.font = `800 32px ${family}`;
    ctx.fillStyle = flavor.soldOut ? "#ff8a8a" : "#ff7a45";
    ctx.fillText(price, w - 16 - priceW, h / 2 + 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { texture: tex, aspect: w / h };
  }, [flavor.item.name, flavor.label, flavor.soldOut]);
  useEffect(() => () => texture.dispose(), [texture]);

  // As tall as fits, but never wider than the flavor's part of the shelf.
  const height = Math.min(0.12, (flavor.width - 0.08) / aspect);
  return (
    <mesh
      position={[flavor.x, -0.1, DEPTH / 2 + 0.005]}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}
