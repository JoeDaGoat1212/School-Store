"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { useFontsReady } from "../showcase/drink-scene";
import type { UnitKey } from "../store/catalog";
import type { Placement, StoreItem, UnitLayout } from "../store/layout";
import { CameraRig } from "./camera";
import { CheckoutCounter, type TillDisplay, type TillUnit } from "./checkout-scene";
import { Building, Interior, Lot, Sky } from "./exterior";
import { BulletinBoard, CandyStand, CheckoutLane, FloorMarker, WorldFridge, WorldShelf, YellowLetters, type BoardCard } from "./fixtures";
import { PriceTag, ProductCopies } from "./products";
import { BULLETIN, BUILDING, LANES, placeUnits, stations, unitAt, type Place, type StationKey } from "./world-layout";

/*
 * The whole 3D world in one <Canvas>: sky, parking lot, the store building and
 * everything inside it. React Three Fiber lets us write three.js as React
 * components. This file only puts things in place and passes taps up to
 * world-app.tsx, which decides what happens.
 */

export type WorldSceneProps = {
  items: StoreItem[];
  layouts: Record<UnitKey, UnitLayout | null>;
  /** Where you are standing (or flying to). */
  station: StationKey;
  /** True while the camera is still moving there. */
  moving: boolean;
  doorsOpen: boolean;
  calm: boolean;
  cards: BoardCard[];
  openSign: { title: string; line: string };
  onDoors: () => void;
  onGo: (station: StationKey) => void;
  onArrive: (station: StationKey) => void;
  onOpenDeals: () => void;
  onTap: (item: StoreItem, x: number, y: number) => void;
  onHover: (item: StoreItem | null) => void;
  onHoverUnit: (unit: UnitKey | null) => void;
  /** Called once the first picture has been drawn. */
  onReady: () => void;
  /** Ringing up at checkout lane 1: the items, and whether it has started. */
  till: { units: TillUnit[]; running: boolean };
  /** What the register's screen says. */
  display: TillDisplay;
  onScanned: (index: number) => void;
  onBagged: () => void;
  /** Checking out: no floor arrows. */
  busy: boolean;
};

export default function WorldScene(props: WorldSceneProps) {
  const { layouts, station, moving, calm } = props;
  // Shadows are switched off on devices that can't keep up.
  const [shadows, setShadows] = useState(true);
  const fontsReady = useFontsReady();
  const places = useMemo(() => placeUnits(layouts), [layouts]);
  const spots = useMemo(() => stations(places, layouts), [places, layouts]);
  const here = spots[station];

  return (
    <Canvas
      shadows={shadows ? "percentage" : false}
      dpr={[1, 1.6]}
      camera={{ fov: 56, near: 0.2, far: 900, position: [40, 40, 60] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#a9dcfb"]} />
      <fog attach="fog" args={["#d9effc", 140, 380]} />
      <PerformanceMonitor onDecline={() => setShadows(false)} />
      <CameraRig stations={spots} current={station} calm={calm} onArrive={props.onArrive} />
      <FirstFrame onReady={props.onReady} />
      {process.env.NODE_ENV !== "production" && <TestHook spots={spots} places={places} layouts={layouts} station={station} moving={moving} items={props.items} />}

      {/* Daylight: the sun (with shadows), sky light from above, and soft fill. */}
      <hemisphereLight args={["#e8f6ff", "#b9a98a", 1.1]} />
      <ambientLight intensity={0.35} />
      <Sun shadows={shadows} />
      {/* Inside: warm ceiling light over the shop floor. */}
      <pointLight position={[-9, BUILDING.height - 1, -16]} intensity={80} distance={34} decay={1.2} color="#fff4e6" />
      <pointLight position={[9, BUILDING.height - 1, -16]} intensity={80} distance={34} decay={1.2} color="#fff4e6" />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer intensity={1.2} color="#ffe2c4" position={[-10, 3, 6]} rotation-y={Math.PI / 4} scale={[10, 4, 1]} />
        <Lightformer intensity={1} color="#c4f2ee" position={[10, 3, 6]} rotation-y={-Math.PI / 4} scale={[10, 4, 1]} />
      </Environment>

      <Sky />
      {fontsReady && (
        <>
          <Lot />
          <Building doorsOpen={props.doorsOpen} onDoors={props.onDoors} canEnter={station === "outside" && !props.doorsOpen} openSign={props.openSign} />
          <Interior />

          {(["drinks", "snacks", "candy"] as UnitKey[]).map((key) => {
            const layout = layouts[key];
            const place = places[key];
            if (!layout || !place) return null;
            return <Unit key={key} unitKey={key} layout={layout} place={place} active={unitAt(station) === key && !moving} {...props} />;
          })}

          {/* Lane 1 is where you check out; 2 and 3 are just for show. */}
          <CheckoutCounter
            lane={LANES[0]}
            units={props.till.units}
            running={props.till.running}
            calm={calm}
            display={props.display}
            onScanned={props.onScanned}
            onBagged={props.onBagged}
          />
          {LANES.slice(1).map((lane) => (
            <CheckoutLane key={lane.number} lane={lane} />
          ))}

          <BulletinBoard cards={props.cards} near={station === "deals" && !moving} onOpen={() => (station === "deals" ? props.onOpenDeals() : props.onGo("deals"))} />
          {/* Big yellow letters over the board, with an arrow bouncing down at it */}
          <group position={[BULLETIN.x, BULLETIN.bottom + BULLETIN.height + 2.1, BULLETIN.z]} rotation-y={BULLETIN.turn}>
            <group position-y={1.15}>
              <YellowLetters text="HOT DEALS!" size={1.15} arrow={false} />
            </group>
            <YellowLetters text="COUPONS + REWARDS + BUNDLES" size={0.5} />
          </group>

          {/* Floor arrows to the next spots (hidden while you walk) */}
          {station !== "outside" &&
            !moving &&
            !props.busy &&
            here.next.map((key) => {
              const at = spots[key].marker ?? spots[key];
              return <FloorMarker key={`${station}-${key}`} x={at.x} z={at.z} label={spots[key].label} from={here} onGo={() => props.onGo(key)} />;
            })}
        </>
      )}
    </Canvas>
  );
}

/** Tells the page once the first picture is on screen (so the loading screen can fade away). */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    // Wait one more frame, so the first frame has really been drawn.
    requestAnimationFrame(() => onReady());
  });
  return null;
}

/**
 * Only while developing: lets automated tests find where things are on the
 * screen (window.__world.project(x, y, z) → screen x, y), so they can click
 * the doors, arrows and products like a person would.
 */
function TestHook(info: { spots: ReturnType<typeof stations>; places: ReturnType<typeof placeUnits>; layouts: Record<UnitKey, UnitLayout | null>; station: StationKey; moving: boolean; items: StoreItem[] }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const w = window as unknown as { __world?: unknown };
    w.__world = {
      ...info,
      scene: get().scene,
      three: get,
      project(x: number, y: number, z: number) {
        const { camera, size } = get();
        const v = new THREE.Vector3(x, y, z).project(camera);
        return { x: size.left + ((v.x + 1) / 2) * size.width, y: size.top + ((1 - v.y) / 2) * size.height, inFront: v.z < 1 };
      },
    };
    return () => {
      delete w.__world;
    };
  }, [get, info]);
  return null;
}

/** The sun, low in the sky behind the lot, casting soft shadows over the store and cars. */
function Sun({ shadows }: { shadows: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(0, 0, -6);
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  return (
    <directionalLight
      ref={light}
      position={[34, 60, 46]}
      intensity={2.1}
      color="#fff3df"
      castShadow={shadows}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
      shadow-camera-left={-60}
      shadow-camera-right={60}
      shadow-camera-top={60}
      shadow-camera-bottom={-60}
      shadow-camera-near={10}
      shadow-camera-far={180}
    />
  );
}

/**
 * The fridge, the snack shelf or the candy stand, with its products. Products
 * can only be tapped while you stand in front of it; from anywhere else,
 * tapping it walks you over.
 */
function Unit({
  unitKey,
  layout,
  place,
  active,
  items,
  onGo,
  onTap,
  onHover,
  onHoverUnit,
}: WorldSceneProps & { unitKey: UnitKey; layout: UnitLayout; place: Place; active: boolean }) {
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
        if (active || e.delta > 8) return;
        e.stopPropagation();
        onGo(unitKey);
      }}
      onPointerOver={(e) => {
        if (active) return;
        e.stopPropagation();
        onHoverUnit(unitKey);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (active) return;
        onHoverUnit(null);
        document.body.style.cursor = "";
      }}
    >
      {unitKey === "drinks" && <WorldFridge layout={layout} interactive={active} />}
      {unitKey === "snacks" && <WorldShelf layout={layout} />}
      {unitKey === "candy" && <CandyStand layout={layout} />}

      {groups.map(([id, placements]) => {
        const item = byId.get(id);
        return item ? <ProductCopies key={id} item={item} placements={placements} interactive={active} onTap={onTap} onHover={onHover} /> : null;
      })}
      {layout.tags.map((t, i) => {
        const item = byId.get(t.id);
        return item ? <PriceTag key={i} tag={t} item={item} /> : null;
      })}
    </group>
  );
}
