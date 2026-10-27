"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { useFontsReady } from "../showcase/drink-scene";
import type { UnitKey } from "./catalog";
import { ROOM, placeUnits, unitViews, type Placement, type StoreItem, type Tag, type UnitLayout, type View } from "./layout";
import { useLook } from "./models";
import { CandyCounter, FridgeUnit, HangingSign, Room, ShelfUnit } from "./store-room";

/*
 * The 3D store (React Three Fiber = three.js in React).
 *
 * `view` says where the camera is: "store" (the whole room), a unit ("drinks")
 * or one section of a unit ("drinks:soda"). Changing it flies the camera there.
 * Products can be tapped once the camera is at their unit; tapping a unit from
 * further away flies to it instead.
 */

export type StoreSceneProps = {
  items: StoreItem[];
  layouts: Record<UnitKey, UnitLayout | null>;
  view: string;
  active: boolean;
  calm: boolean;
  /** Shiny floor and glow effects (turned off automatically if the device struggles). */
  fancy: boolean;
  onPickUnit: (unit: UnitKey) => void;
  onTap: (item: StoreItem, x: number, y: number) => void;
  onHover: (item: StoreItem | null) => void;
  onHoverUnit: (unit: UnitKey | null) => void;
};

export default function StoreScene(props: StoreSceneProps) {
  const { layouts, view, active, calm } = props;
  const [fancy, setFancy] = useState(props.fancy);
  const fontsReady = useFontsReady();
  const places = useMemo(() => placeUnits(layouts), [layouts]);
  const views = useMemo(() => {
    const list: View[] = [];
    for (const key of ["drinks", "snacks", "candy"] as UnitKey[]) {
      const layout = layouts[key];
      const place = places[key];
      if (layout && place) list.push(...unitViews(layout, place));
    }
    return list;
  }, [layouts, places]);

  return (
    <Canvas
      dpr={fancy ? [1, 1.6] : [1, 1.25]}
      frameloop={active ? "always" : "never"}
      camera={{ fov: 40, near: 0.1, far: 90, position: [2, 4, 30] }}
      gl={{ antialias: !fancy, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#07080a"]} />
      <fog attach="fog" args={["#07080a", 24, 48]} />
      <PerformanceMonitor onDecline={() => setFancy(false)} />
      <CameraRig views={views} view={view} calm={calm} />

      {/* Light: soft fill, a spotlight from the ceiling onto each unit, the fridge's cold glow */}
      <ambientLight intensity={0.4} color="#d6dcff" />
      <hemisphereLight args={["#ffeedd", "#17171c", 0.85]} />
      <Environment resolution={256} frames={1}>
        {[-4.8, -1, 2.8, 6.6].map((z) => (
          <Lightformer key={z} intensity={2.2} position={[0, 10, z]} rotation-x={Math.PI / 2} scale={[13, 0.5, 1]} />
        ))}
        <Lightformer intensity={1.4} color="#ff5a1f" position={[-12, 4, 0]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={1.2} color="#13a8a0" position={[12, 4, 0]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>

      {fontsReady && <Room fancy={fancy} logoX={places.snacks?.x ?? 0} />}
      {fontsReady &&
        (["drinks", "snacks", "candy"] as UnitKey[]).map((key) => {
          const layout = layouts[key];
          const place = places[key];
          if (!layout || !place) return null;
          return <Unit key={key} unitKey={key} layout={layout} place={place} focused={view.split(":")[0] === key} {...props} />;
        })}

      <ContactShadows position={[0, 0.01, (ROOM.front + ROOM.back) / 2]} scale={[ROOM.halfWidth * 2, ROOM.front - ROOM.back]} resolution={1024} blur={2.4} opacity={0.75} far={2.5} frames={1} />

      {fancy && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={0.9} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.25} darkness={0.65} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

// ---- Camera -------------------------------------------------------------------------------------

const OVERVIEW_LOOK = new THREE.Vector3(-0.4, 4.3, -2.6);
const OVERVIEW_DIR = new THREE.Vector3(0.12, 0.17, 1).normalize();
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where the camera should be for a view: far enough back that the whole thing fits the screen. */
function cameraFor(view: string, views: View[], aspect: number, fov: number) {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const v = views.find((x) => x.key === view);
  if (!v) {
    // The whole room, far enough back that it all fits.
    const d = Math.min(aspect < 1 ? 46 : 34, Math.max(7 / tan, 12.8 / (tan * aspect)));
    return { pos: OVERVIEW_LOOK.clone().addScaledVector(OVERVIEW_DIR, d), look: OVERVIEW_LOOK.clone() };
  }
  const [w, h] = v.size;
  const d = Math.max(h / 2 / tan, w / 2 / (tan * aspect)) * 1.04 + 0.4;
  const rot = new THREE.Euler(0, v.turn, 0);
  const center = new THREE.Vector3(...v.center).applyEuler(rot).add(new THREE.Vector3(...v.origin));
  const normal = new THREE.Vector3(Math.sin(v.turn), 0, Math.cos(v.turn));
  return { pos: center.clone().addScaledVector(normal, d).add(new THREE.Vector3(0, d * 0.1, 0)), look: center };
}

/**
 * Flies the camera between views: a smooth ease in and out, rising a little in
 * the middle of the move (like a camera on a crane). On first open it glides in
 * through the front of the store. Otherwise the view holds still.
 */
function CameraRig({ views, view, calm }: { views: View[]; view: string; calm: boolean }) {
  const size = useThree((st) => st.size);
  // The camera is read fresh each time (three.js objects are changed in place, outside React).
  const getState = useThree((st) => st.get);
  const portrait = size.width < size.height;
  const s = useRef({
    fromPos: new THREE.Vector3(),
    fromLook: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toLook: new THREE.Vector3(),
    pos: new THREE.Vector3(1.5, 4.5, 34),
    look: OVERVIEW_LOOK.clone(),
    start: -1,
    duration: 2.4,
    arc: 0,
  });

  useLayoutEffect(() => {
    const cam = getState().camera as THREE.PerspectiveCamera;
    cam.fov = portrait ? 52 : 40;
    cam.updateProjectionMatrix();
    const target = cameraFor(view, views, size.width / size.height, cam.fov);
    const r = s.current;
    r.fromPos.copy(r.pos);
    r.fromLook.copy(r.look);
    r.toPos.copy(target.pos);
    r.toLook.copy(target.look);
    const distance = r.fromPos.distanceTo(r.toPos);
    r.duration = calm ? 0.01 : Math.min(2.4, 0.9 + distance * 0.06);
    r.arc = Math.min(2.5, distance * 0.12);
    r.start = -1;
  }, [view, views, size.width, size.height, portrait, getState, calm]);

  useFrame((state) => {
    const r = s.current;
    const camera = state.camera;
    const now = state.clock.elapsedTime;
    if (r.start < 0) r.start = now;
    const t = Math.min(1, (now - r.start) / r.duration);
    const e = ease(t);
    r.pos.lerpVectors(r.fromPos, r.toPos, e);
    r.pos.y += Math.sin(Math.PI * t) * r.arc;
    r.look.lerpVectors(r.fromLook, r.toLook, e);

    // The view holds still: only the buttons (or tapping a unit) move the camera.
    camera.position.copy(r.pos);
    camera.lookAt(r.look);
  });
  return null;
}

// ---- A unit with its products ---------------------------------------------------------------------

function Unit({
  unitKey,
  layout,
  place,
  focused,
  items,
  onPickUnit,
  onTap,
  onHover,
  onHoverUnit,
}: StoreSceneProps & { unitKey: UnitKey; layout: UnitLayout; place: { x: number; z: number; turn: number }; focused: boolean }) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // All copies of each product together, so each product is drawn in one go.
  const groups = useMemo(() => {
    const m = new Map<string, Placement[]>();
    for (const p of layout.placements) m.set(p.id, [...(m.get(p.id) ?? []), p]);
    return [...m];
  }, [layout]);

  return (
    <group
      position={[place.x, 0, place.z]}
      rotation-y={place.turn}
      onClick={(e) => {
        // From across the room, tapping anywhere on a unit flies there.
        if (focused) return;
        e.stopPropagation();
        onPickUnit(unitKey);
      }}
      onPointerOver={(e) => {
        if (focused) return;
        e.stopPropagation();
        onHoverUnit(unitKey);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (focused) return;
        onHoverUnit(null);
        document.body.style.cursor = "";
      }}
    >
      {unitKey === "drinks" && <FridgeUnit layout={layout} />}
      {unitKey === "snacks" && <ShelfUnit layout={layout} />}
      {unitKey === "candy" && <CandyCounter layout={layout} />}

      {groups.map(([id, placements]) => {
        const item = byId.get(id);
        return item ? <ProductCopies key={id} item={item} placements={placements} interactive={focused} onTap={onTap} onHover={onHover} /> : null;
      })}
      {layout.tags.map((t, i) => {
        const item = byId.get(t.id);
        return item ? <PriceTag key={i} tag={t} item={item} /> : null;
      })}

      {/* Spotlight from the ceiling onto the unit */}
      <UnitLight position={[0, ROOM.height - 0.4, 4]} target={[0, layout.height * 0.5, -0.4]} />
      {unitKey === "drinks" && <pointLight position={[0, layout.height * 0.55, 1.2]} color="#dff7ff" intensity={14} decay={1.8} />}
      {unitKey === "drinks" && (
        <group position={[0, 0, 1.7]}>
          <HangingSign text={layout.sign} y={Math.min(ROOM.height - 1.3, layout.height + 1.9)} />
        </group>
      )}
      {unitKey === "candy" && (
        <group position={[0.6, 0, 1.2]}>
          <HangingSign text={layout.sign} y={Math.min(ROOM.height - 1.6, layout.height + 1.9)} />
        </group>
      )}
    </group>
  );
}

/** A soft spotlight from the ceiling. */
function UnitLight({ position, target }: { position: [number, number, number]; target: [number, number, number] }) {
  const light = useRef<THREE.SpotLight>(null);
  const aim = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (light.current && aim.current) light.current.target = aim.current;
  }, []);
  return (
    <>
      <spotLight ref={light} position={position} angle={0.62} penumbra={0.85} intensity={60} decay={1.6} color="#fff1e2" />
      <object3D ref={aim} position={target} />
    </>
  );
}

/**
 * Every copy of one product, drawn together (an "instanced mesh": one shape,
 * many positions). Pointing at a copy lifts it; tapping it adds the product to
 * the cart and the copy hops.
 */
function ProductCopies({
  item,
  placements,
  interactive,
  onTap,
  onHover,
}: {
  item: StoreItem;
  placements: Placement[];
  interactive: boolean;
  onTap: (item: StoreItem, x: number, y: number) => void;
  onHover: (item: StoreItem | null) => void;
}) {
  const look = useLook(item.model, item.name, item.color);
  const ref = useRef<THREE.InstancedMesh>(null);
  const hovered = useRef(-1);
  const release = useRef<number[]>([]);
  const hops = useRef(new Map<number, number>());
  const clock = useRef(0);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  /** Put copy i in its spot, lifted by `lift` and hopping by `hop`. */
  const place = (mesh: THREE.InstancedMesh, i: number, lift = 0, hop = 0) => {
    const p = placements[i];
    tmp.position.set(p.x, p.y + lift + hop, p.z + lift * 0.6);
    tmp.rotation.set(p.tilt, p.turn, 0, "YXZ");
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
  };

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    for (let i = 0; i < placements.length; i++) place(mesh, i);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // `place` only reads `placements`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, placements]);

  useFrame((state) => {
    const mesh = ref.current;
    clock.current = state.clock.elapsedTime;
    if (!mesh) return;
    let changed = false;
    for (const i of release.current) {
      place(mesh, i);
      changed = true;
    }
    release.current = [];
    for (const [i, start] of hops.current) {
      const t = (state.clock.elapsedTime - start) / 0.45;
      if (t >= 1) hops.current.delete(i);
      place(mesh, i, i === hovered.current ? 0.06 : 0, t < 1 ? Math.sin(t * Math.PI) * 0.2 : 0);
      changed = true;
    }
    if (hovered.current >= 0 && !hops.current.has(hovered.current)) {
      place(mesh, hovered.current, 0.06);
      changed = true;
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  });

  if (!look) return null;

  const setHover = (i: number) => {
    if (hovered.current === i) return;
    if (hovered.current >= 0) release.current.push(hovered.current);
    hovered.current = i;
  };

  return (
    <instancedMesh
      key={look.geometry.uuid}
      ref={ref}
      args={[look.geometry, look.material, placements.length]}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!interactive || e.instanceId === undefined) return;
        e.stopPropagation();
        setHover(e.instanceId);
        onHover(item);
        document.body.style.cursor = item.soldOut ? "not-allowed" : "pointer";
      }}
      onPointerOut={() => {
        if (!interactive) return;
        setHover(-1);
        onHover(null);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!interactive || e.instanceId === undefined) return;
        e.stopPropagation();
        if (!item.soldOut) hops.current.set(e.instanceId, clock.current);
        onTap(item, e.nativeEvent.clientX, e.nativeEvent.clientY);
      }}
    />
  );
}

const tagTextures = new Map<string, { texture: THREE.CanvasTexture; aspect: number }>();

/** "Coke  $2.00" (or "Sold out"), drawn once per product and shared by its tags. */
function tagTexture(item: StoreItem) {
  const key = `${item.id}|${item.name}|${item.label}|${item.soldOut}`;
  let t = tagTextures.get(key);
  if (!t) {
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-body").trim() || "sans-serif";
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const h = 64;
    const price = item.soldOut ? "Sold out" : item.label;
    ctx.font = `700 30px ${family}`;
    const nameW = ctx.measureText(item.name).width;
    ctx.font = `800 32px ${family}`;
    const priceW = ctx.measureText(price).width;
    canvas.width = Math.ceil(nameW + priceW + 52);
    canvas.height = h;
    ctx.fillStyle = "#0a0a0b";
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, h, 10);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.font = `700 30px ${family}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(item.name, 16, h / 2 + 2);
    ctx.font = `800 32px ${family}`;
    ctx.fillStyle = item.soldOut ? "#ff8a8a" : "#ff7a45";
    ctx.fillText(price, canvas.width - 16 - priceW, h / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    t = { texture, aspect: canvas.width / h };
    tagTextures.set(key, t);
  }
  return t;
}

function PriceTag({ tag, item }: { tag: Tag; item: StoreItem }) {
  const { texture, aspect } = tagTexture(item);
  const height = Math.min(0.11, tag.width / aspect);
  return (
    <mesh position={[tag.x, tag.y - 0.07, tag.z + 0.035]} raycast={() => null}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}
