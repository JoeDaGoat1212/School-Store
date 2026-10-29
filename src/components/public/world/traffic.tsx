"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { carCircles, copSpots, parkedSpots, player, trafficSpots, type CarSpot } from "./bump";
import { CarModel, newLook } from "./car-model";
import type { Body } from "./vehicles";
import { drive } from "./drive";
import { noRaycast, signTexture } from "./paint";
import { LOOPS, TOWN_LOOPS } from "./town-layout";

/*
 * Cars driving round the town and the city. Each one follows a loop round a
 * block, in the right-hand lane, at about 30 mph. They slow down for
 * corners, and brake (brake lights and all) for anything in front of them:
 * another car, your car, or you walking in the road. The city is busier (more
 * cars per block, lots of yellow taxis). Cars far from the camera aren't
 * drawn (you couldn't see them anyway), which keeps the busy city smooth.
 */

const PER_LOOP = 2;
const PER_CITY_LOOP = 3;
/** Cars further than this from the camera aren't drawn. */
const DRAW_DISTANCE = 260;
/** A car that's been stuck behind another this long squeezes past (so two cars at a crossroads never wait for each other forever). */
const STUCK = 3;
const CRUISE = 14; // units/s (about 30 mph)
const CORNER = 6.5; // round the corners
const LOOK_AHEAD = 20; // how far ahead drivers watch the road

const COLORS = ["#e5483b", "#3d6fe0", "#f2f2f2", "#2f3338", "#13a8a0", "#ffd21f", "#9aa3ad", "#7b5cd6", "#ff7a2a", "#5aa84a", "#b8323a", "#1d4f91"];

type Driver = { loop: number; s: number; speed: number; spot: CarSpot; look: ReturnType<typeof newLook>; color: string; body: Body; stuck: number; squeeze: number };
const BODIES: Body[] = ["sedan", "hatch", "suv", "sedan", "pickup", "hatch", "suv", "sports"];

const TAXI = "#ffcc00";
const CITY_COLORS = [TAXI, TAXI, TAXI, ...COLORS];

/** The little lit-up "TAXI" sign on a taxi's roof. */
function TaxiSign() {
  const sign = useMemo(() => signTexture("Taxi", { bg: "#1b1d21", fg: "#ffcc00", height: 64 }), []);
  return (
    <mesh position={[0, 2.78, 0.55]} raycast={noRaycast}>
      <boxGeometry args={[1.5, 0.5, 0.6]} />
      <meshBasicMaterial map={sign.texture} toneMapped={false} />
    </mesh>
  );
}

/** A point a fraction of the way round a loop. */
function pointAt(pts: { x: number; z: number }[], s: number) {
  const n = pts.length;
  const i = ((Math.floor(s) % n) + n) % n;
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const f = s - Math.floor(s);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

/** Everyone's starting spot: spread evenly round their loop. */
const DRIVERS: Driver[] = LOOPS.flatMap((pts, loop) => {
  const city = loop >= TOWN_LOOPS;
  const n = city ? PER_CITY_LOOP : PER_LOOP;
  return Array.from({ length: n }, (_, k) => {
    const s = ((k + 0.25 * (loop % 3)) / n) * pts.length;
    const here = pointAt(pts, s);
    const ahead = pointAt(pts, s + 2.5);
    const spot = { x: here.x, z: here.z, heading: Math.atan2(-(ahead.x - here.x), -(ahead.z - here.z)) };
    trafficSpots.push(spot);
    const i = trafficSpots.length - 1;
    const color = city ? CITY_COLORS[(i * 7 + loop) % CITY_COLORS.length] : COLORS[i % COLORS.length];
    const body: Body = color === TAXI ? "sedan" : BODIES[(i * 5 + loop * 3) % BODIES.length];
    return { loop, s, speed: CRUISE * 0.8, spot, look: newLook(), color, body, stuck: 0, squeeze: 0 };
  });
});

/** How sharply the road bends between here and a little way ahead (0 = straight). */
function bendAhead(pts: { x: number; z: number }[], s: number) {
  const a = pointAt(pts, s);
  const b = pointAt(pts, s + 6);
  const c = pointAt(pts, s + 12);
  const h1 = Math.atan2(b.x - a.x, b.z - a.z);
  const h2 = Math.atan2(c.x - b.x, c.z - b.z);
  return Math.abs(((h2 - h1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
}

/** Is there something in the lane just ahead of this car? Returns how far, or Infinity. */
function clearAhead(d: Driver) {
  const fx = -Math.sin(d.spot.heading);
  const fz = -Math.cos(d.spot.heading);
  let nearest = Infinity;
  const check = (x: number, z: number, wide: number) => {
    const dx = x - d.spot.x;
    const dz = z - d.spot.z;
    const ahead = dx * fx + dz * fz;
    if (ahead <= 0 || ahead > LOOK_AHEAD) return;
    const across = Math.abs(dx * -fz + dz * fx);
    if (across < wide) nearest = Math.min(nearest, ahead);
  };
  // Other traffic (unless squeezing past after being stuck).
  if (d.squeeze <= 0)
    for (const o of DRIVERS) if (o !== d && Math.abs(o.spot.x - d.spot.x) < LOOK_AHEAD + 4 && Math.abs(o.spot.z - d.spot.z) < LOOK_AHEAD + 4) for (const p of carCircles(o.spot)) check(p.x, p.z, 2.6);
  for (const c of copSpots) if (Math.abs(c.x - d.spot.x) < 30 && Math.abs(c.z - d.spot.z) < 30) for (const p of carCircles(c)) check(p.x, p.z, 3.4);
  for (const c of parkedSpots) if (Math.abs(c.x - d.spot.x) < 30 && Math.abs(c.z - d.spot.z) < 30) for (const p of carCircles(c)) check(p.x, p.z, 3.4);
  // You, walking in the road (or anywhere close to this lane).
  if (player.onFoot) check(player.x, player.z, 2.4);
  if (drive.active) check(drive.pos.x, drive.pos.z, 3.4);
  return nearest;
}

export function Traffic({ calm }: { calm: boolean }) {
  const groups = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const cam = state.camera.position;
    DRIVERS.forEach((d, i) => {
      const pts = LOOPS[d.loop];
      // How fast to go: slower into bends, and stop for whatever's ahead.
      const bend = bendAhead(pts, d.s);
      let want = bend > 0.25 ? CORNER : CRUISE;
      const gap = clearAhead(d);
      if (gap < LOOK_AHEAD) want = Math.min(want, Math.max(0, (gap - 9) * 1.1));
      const braking = want < d.speed - 0.5;
      d.speed = braking ? Math.max(want, d.speed - 16 * dt) : Math.min(want, d.speed + 4 * dt);
      if (d.speed < 0.05 && want === 0) d.speed = 0;
      // Stuck for a while? Squeeze past for a moment.
      d.squeeze -= dt;
      d.stuck = d.speed < 0.3 ? d.stuck + dt : 0;
      if (d.stuck > STUCK) {
        d.stuck = 0;
        d.squeeze = 2.5;
      }

      // Points are about 1 unit apart, so units travelled ≈ points moved along.
      d.s = (d.s + d.speed * dt) % pts.length;
      const here = pointAt(pts, d.s);
      const ahead = pointAt(pts, d.s + 2.5);
      const heading = Math.atan2(-(ahead.x - here.x), -(ahead.z - here.z));
      const turn = ((heading - d.spot.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      d.spot.x = here.x;
      d.spot.z = here.z;
      d.spot.heading = heading;

      d.look.spin += (d.speed / 0.75) * dt;
      // Front wheels turned just enough for this bend.
      d.look.steer = THREE.MathUtils.clamp(Math.atan(((turn / Math.max(dt, 1e-3)) * 4.5) / Math.max(d.speed, 1)), -0.5, 0.5);
      d.look.braking = braking || d.speed === 0;
      d.look.pitch = calm ? 0 : braking ? -0.03 : 0;

      const g = groups.current[i];
      if (g) {
        g.visible = Math.abs(here.x - cam.x) < DRAW_DISTANCE && Math.abs(here.z - cam.z) < DRAW_DISTANCE;
        g.position.set(here.x, 0, here.z);
        g.rotation.set(0, heading, 0);
      }
    });
  });

  return (
    <group>
      {DRIVERS.map((d, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
        >
          <CarModel color={d.color} look={d.look} body={d.body} />
          {d.color === TAXI && <TaxiSign />}
        </group>
      ))}
    </group>
  );
}
