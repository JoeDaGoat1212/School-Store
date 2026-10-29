"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor, Sky as DreiSky } from "@react-three/drei";
import * as THREE from "three";
import { useFontsReady } from "../showcase/drink-scene";
import type { UnitKey } from "../store/catalog";
import type { Placement, StoreItem, UnitLayout } from "../store/layout";
import { CameraRig, testView } from "./camera";
import { Effects, QUALITY, slowDown, useQuality } from "./effects";
import { CheckoutCounter, type TillDisplay, type TillUnit } from "./checkout-scene";
import { HalloweenInside, HalloweenLawn, HalloweenOutside } from "./halloween";
import type { Season } from "@/lib/seasons";
import { Building, Interior, Lot, SUN_DIR, Sky } from "./exterior";
import { BulletinBoard, CandyStand, CheckoutLane, FloorMarker, WorldFridge, WorldShelf, YellowLetters, type BoardCard } from "./fixtures";
import { PriceTag, ProductCopies } from "./products";
import { RequestDesk } from "./request-desk";
import { parkedSpots, player, trafficSpots } from "./bump";
import { Cars, drive, input } from "./drive";
import { Town } from "./town";
import { City } from "./city";
import { CityGame } from "./city-fx";
import { Police } from "./police";
import { ClosedSign, Jewelry } from "./city-sites";
import { Bank } from "./bank";
import { game } from "./heist";
import { Mountains } from "./mountains";
import { Aircraft } from "./flight";
import { Jail } from "./jail";
import { Airport } from "./airport";
import { Birds, StreetProps } from "./street-props";
import { RestaurantRow } from "./buildings";
import { Homes } from "./home-models";
import { RealtyOffice, Showroom } from "./showroom";
import { clockIn, jobs } from "./jobs";
import { dealer } from "./dealer";
import { realty, startTour } from "./realty";
import { profile } from "./profile";
import { notify } from "./game-events";
import { PlayerAvatar } from "./player-avatar";
import { Smoke } from "./smoke";
import { Traffic } from "./traffic";
import { BULLETIN, BUILDING, LANES, STORE_SCALE, blockers, doors, placeUnits, stations, unitAt, worldStations, type Place, type StationKey } from "./world-layout";

/*
 * The whole 3D world in one <Canvas>: sky, town, the city next to it (with
 * the bank and jewelry shop you can rob), parking lot, the store building
 * and everything inside it. The store is built in its own (bigger)
 * units and drawn shrunk by STORE_SCALE, so people are the same size inside
 * and out (see world-layout.ts). React Three Fiber lets us write three.js as React
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
  calm: boolean;
  cards: BoardCard[];
  openSign: { title: string; line: string };
  onDoors: () => void;
  onGo: (station: StationKey) => void;
  onArrive: (station: StationKey) => void;
  onOpenDeals: () => void;
  /** Open the "request an item" form (at the request table). */
  onOpenRequests: () => void;
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
  /** Holiday decorations to put up (or null). */
  season: Season;
  /** Walked up to a spot (or away from one) with the arrow keys / WASD. */
  onWalk: (station: StationKey) => void;
  /** The car being driven (its number), or null. */
  driving: number | null;
  /** The parked car you're standing next to (you can tap it to get in), or null. */
  nearCar: number | null;
  onNearCar: (car: number | null) => void;
  /** Went into the store, or out of it. */
  onInside: (inside: boolean) => void;
  onPickCar: (car: number) => void;
  /** Your car hit something ("Bonk!" / "Crash!"). */
  onBump: (text: string) => void;
  /** The aircraft you're flying crashed (you're out of it). */
  onBail: () => void;
};

export default function WorldScene(props: WorldSceneProps) {
  const { layouts, station, moving, calm } = props;
  // How good it looks (effects.tsx): shadows and effects drop off on devices that can't keep up.
  const quality = useQuality();
  const q = QUALITY[quality];
  const shadows = q.shadows;
  const fontsReady = useFontsReady();
  const places = useMemo(() => placeUnits(layouts), [layouts]);
  // Spots to stand: in store units (for the floor arrows, drawn with the store) and in world units (for the camera).
  const spots = useMemo(() => stations(places, layouts), [places, layouts]);
  const worldSpots = useMemo(() => worldStations(spots), [spots]);
  const walls = useMemo(() => blockers(places, layouts), [places, layouts]);
  const here = spots[station];
  const spooky = props.season === "halloween";

  return (
    <Canvas
      shadows={shadows ? "soft" : false}
      dpr={q.dpr}
      camera={{ fov: 56, near: 0.2, far: 2600, position: [40, 40, 60] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[spooky ? "#ffd2a4" : "#a8d2f2"]} />
      {/* Haze in the distance, so the far end of town fades softly into the sky (far enough out that the city's skyline shows from the store) */}
      <fog attach="fog" args={[spooky ? "#ffd8b0" : "#d6e8f4", 260, 1250]} />
      <PerformanceMonitor onDecline={slowDown} flipflops={2} />
      <Effects />
      <CameraRig stations={worldSpots} current={station} calm={calm} onArrive={props.onArrive} blockers={walls} onWalk={props.onWalk} onNearCar={props.onNearCar} onInside={props.onInside} />
      <FirstFrame onReady={props.onReady} />
      {process.env.NODE_ENV !== "production" && <TestHook spots={worldSpots} places={places} layouts={layouts} station={station} moving={moving} items={props.items} />}

      {/* Daylight: the sun (with shadows), sky light from above, and soft fill. */}
      <hemisphereLight args={[spooky ? "#f1defa" : "#dcefff", "#8f8466", 0.85]} />
      <ambientLight intensity={0.22} />
      <Sun key={q.shadowMap} shadows={shadows} warm={spooky} mapSize={q.shadowMap} />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2} position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
        <Lightformer intensity={1.2} color="#ffe2c4" position={[-10, 3, 6]} rotation-y={Math.PI / 4} scale={[10, 4, 1]} />
        <Lightformer intensity={1} color="#c4f2ee" position={[10, 3, 6]} rotation-y={-Math.PI / 4} scale={[10, 4, 1]} />
        {/* The sky, so shiny things (car paint, glass, chrome) reflect it */}
        {!spooky && <DreiSky distance={900} sunPosition={SUN_DIR} turbidity={5.5} rayleigh={1.25} mieCoefficient={0.0045} mieDirectionalG={0.86} />}
      </Environment>

      <Sky spooky={spooky} />
      {fontsReady && (
        <>
          <Lot />
          {/* The neighbourhood round the store: streets, houses, trees, people walking */}
          <Town />
          <Traffic calm={calm} />
          {/* The city: skyscrapers, the park, and the bank and jewelry shop (both robbable) */}
          <City />
          <Bank />
          <Jewelry />
          <ClosedSign site="bank" height={44} />
          <ClosedSign site="jewelry" height={22} />
          <Police />
          <CityGame calm={calm} />
          {/* The jail, east of the city */}
          <Jail />
          <RestaurantRow />
          <Showroom />
          <RealtyOffice />
          <Homes />
          <Airport />
          <StreetProps />
          <Birds />
          {/* The mountains to the north, with the road up to the secret base */}
          <Mountains />
          {/* You, seen in third person */}
          <PlayerAvatar />
          <Smoke />
          {/* The parked cars: walk up to one and press E (or tap it) to drive it */}
          <Cars driving={props.driving} canPick={props.driving === null && !moving ? props.nearCar : null} calm={calm} onPick={props.onPickCar} onBump={props.onBump} />
          {/* The planes and helicopters at the airport (fly them!) */}
          <Aircraft driving={props.driving} onBail={props.onBail} />
          {spooky && <HalloweenLawn />}

          {/* ---- The store, shrunk to the world's size ---- */}
          <group scale={STORE_SCALE}>
            {/* Inside: warm ceiling light over the shop floor (a light's reach doesn't shrink with the group, so it's set by hand). */}
            <pointLight position={[-13, BUILDING.height - 1, -20]} intensity={105 * STORE_SCALE ** 1.2} distance={46 * STORE_SCALE} decay={1.2} color="#fff4e6" />
            <pointLight position={[13, BUILDING.height - 1, -20]} intensity={105 * STORE_SCALE ** 1.2} distance={46 * STORE_SCALE} decay={1.2} color="#fff4e6" />
            <Building onDoors={props.onDoors} canEnter={station === "outside" && !moving} openSign={props.openSign} />
            <Interior />
            {spooky && <HalloweenOutside />}
            {spooky && <HalloweenInside fridgeX={places.drinks?.x ?? -8.5} />}

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
              halloween={spooky}
              display={props.display}
              onScanned={props.onScanned}
              onBagged={props.onBagged}
            />
            {LANES.slice(1).map((lane) => (
              <CheckoutLane key={lane.number} lane={lane} />
            ))}

            {/* The request table, front left: someone at a computer takes requests */}
            <RequestDesk
              near={station === "requests" && !moving}
              calm={calm}
              halloween={spooky}
              onOpen={() => (station === "requests" ? props.onOpenRequests() : props.onGo("requests"))}
            />

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
          </group>
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
      // Live positions: you, the car you're driving, the doors, the cars.
      live: { player, drive, doors, parkedSpots, trafficSpots, input, game, testView, jobs, dealer, realty, profile, notify, clockIn, startTour },
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

const sunLook = new THREE.Vector3();

/**
 * The sun, high behind the lot, casting soft shadows. Shadows only reach so
 * far, so the sun follows you round the town (in 4-unit steps, so the
 * shadows don't shimmer as you move).
 */
function Sun({ shadows, warm, mapSize }: { shadows: boolean; warm: boolean; mapSize: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(0, 0, -10);
    scene.add(l.target);
    return () => {
      scene.remove(l.target);
    };
  }, [scene]);
  useFrame((state) => {
    const l = light.current;
    if (!l) return;
    // Centre the shadows a little ahead of where you're looking.
    const look = state.camera.getWorldDirection(sunLook);
    const x = Math.round((state.camera.position.x + look.x * 30) / 4) * 4;
    const z = Math.round((state.camera.position.z + look.z * 30) / 4) * 4;
    if (l.target.position.x === x && l.target.position.z === z - 10) return;
    // (Same angle as ever, just twice as far up, so the city's tall towers still cast shadows.)
    l.position.set(x + 68, 120, z + 92);
    l.target.position.set(x, 0, z - 10);
    l.target.updateMatrixWorld();
  });
  return (
    <directionalLight
      ref={light}
      position={[68, 120, 92]}
      intensity={2.6}
      color={warm ? "#ffd6a8" : "#fff3df"}
      castShadow={shadows}
      shadow-mapSize={[mapSize, mapSize]}
      shadow-bias={-0.0002}
      shadow-normalBias={0.04}
      shadow-camera-left={-75}
      shadow-camera-right={75}
      shadow-camera-top={75}
      shadow-camera-bottom={-75}
      shadow-camera-near={10}
      shadow-camera-far={420}
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
