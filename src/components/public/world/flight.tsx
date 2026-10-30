"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { player, viewBlocked } from "./bump";
import { ALL_TIERS } from "./city-layout";
import { drive, getOut, input } from "./drive";
import { fleet, isAircraft, type Vehicle } from "./fleet";
import { banner } from "./heist";
import { kill, life } from "./life";
import { noRaycast } from "./paint";
import { puff } from "./smoke";
import { groundAt } from "./terrain";

/*
 * Flying: the light planes and helicopters at the airport (fleet.ts).
 *
 *   Plane:       W / S throttle, A D or ← → bank and turn, Space pull up,
 *                Shift push down. Taxi to the runway, open the throttle, and
 *                pull up once you're going fast enough (about 55 mph).
 *   Helicopter:  Space climb, Shift descend, W / S fly forward / back,
 *                A D or ← → turn.
 *   E:           get out. In the air that means jumping out! Press Space
 *                while you fall to open your parachute (or don't, and it's a
 *                long way down). An empty plane glides down and crashes.
 *
 * Hitting the ground too hard, or flying into a building or a mountain,
 * is a crash. Crashed aircraft come back at the airport after a while.
 */

/** In the air: y is the aircraft's real height (not above the ground, so flying into a mountain is a crash). */
type Air = { y: number; speed: number; vy: number; pitch: number; roll: number; throttle: number; rotor: number; crashedAt: number; home: { x: number; z: number; heading: number }; pilot: boolean };
const air = new Map<string, Air>();
function stateOf(v: Vehicle): Air {
  let a = air.get(v.id);
  if (!a) {
    a = { y: groundAt(v.spot.x, v.spot.z) + v.alt, speed: 0, vy: 0, pitch: 0, roll: 0, throttle: 0, rotor: 0, crashedAt: -1, home: { ...v.spot }, pilot: false };
    air.set(v.id, a);
  }
  return a;
}

const TAKEOFF = 25;
const PLANE_TOP = 72;

/** Is (x, y, z) inside a skyscraper? */
function inTower(x: number, y: number, z: number) {
  if (x < 480 || x > 1120) return false;
  for (const t of ALL_TIERS) if (y < t.y1 && Math.abs(x - t.x) < t.w / 2 + 1 && Math.abs(z - t.z) < t.d / 2 + 1) return true;
  return false;
}

export function Aircraft({ driving, onBail }: { driving: number | null; onBail: () => void }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const props = useRef<(THREE.Group | null)[]>([]);
  const was = useRef<number | null>(null);
  const clock = useRef(0);

  useEffect(() => {
    const before = was.current;
    was.current = driving;
    if (driving !== null && isAircraft(fleet[driving])) {
      const v = fleet[driving];
      const a = stateOf(v);
      a.pilot = true;
      if (v.alt < 0.5) Object.assign(a, { speed: 0, vy: 0, pitch: 0, roll: 0, throttle: 0 });
    }
    if (before !== null && isAircraft(fleet[before])) {
      const v = fleet[before];
      const a = stateOf(v);
      a.pilot = false;
      if (life.inJail) {
        // Taken out of it and off to jail: you're in your cell, not here.
      } else if (v.alt > 3) {
        // Jumping out mid-air: you fall from where the aircraft is, carrying a bit of its speed.
        Object.assign(player, { x: v.spot.x, z: v.spot.z, y: a.y - 1.5, vy: a.vy, yaw: -v.spot.heading, place: true, onFoot: true, grounded: false, chute: false });
        banner("info", "You jumped!", "Press Space to open your parachute.", 3);
      } else {
        getOut(v.spot);
      }
    }
  }, [driving]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    clock.current += dt;
    fleet.forEach((v, i) => {
      if (!isAircraft(v)) return;
      const a = stateOf(v);
      const flying = driving === i;
      const g = groups.current[i];

      // Crashed: smoking wreck, then it's back at the airport.
      if (a.crashedAt >= 0) {
        if (Math.random() < dt * 8) puff(v.spot.x, groundAt(v.spot.x, v.spot.z) + 1, v.spot.z);
        if (clock.current - a.crashedAt > 20) {
          a.crashedAt = -1;
          Object.assign(v.spot, a.home);
          v.alt = 0;
          Object.assign(a, { y: groundAt(a.home.x, a.home.z), speed: 0, vy: 0, pitch: 0, roll: 0, throttle: 0 });
        }
        if (g) g.visible = false;
        return;
      }

      const before = v.alt;
      if (v.body === "plane") stepPlane(v, a, flying, dt);
      else stepHeli(v, a, flying, dt);
      // Touching down (or hitting the ground).
      const y = groundAt(v.spot.x, v.spot.z);
      let hitGround = false;
      if (a.y <= y) {
        // Too fast, too steep, banked over, or flown straight into a hillside.
        hitGround = before > 0.3 && (a.vy < -9 || before > 2.5 || Math.abs(a.roll) > 0.7 || (v.body === "plane" && a.pitch < -0.25 && a.speed > 15));
        a.y = y;
        if (a.vy < 0) a.vy = 0;
        if (v.body === "plane") a.pitch = Math.max(0, a.pitch);
      }
      v.alt = a.y - y;
      // Into a skyscraper, a house or a wall.
      const hitThing = v.alt > 0.5 && (inTower(v.spot.x, a.y, v.spot.z) || (v.alt < 8 && viewBlocked(v.spot.x, v.spot.z, [])));
      if (hitGround || hitThing) {
        a.crashedAt = clock.current;
        for (let k = 0; k < 40; k++) puff(v.spot.x + (Math.random() - 0.5) * 8, y + Math.random() * 4 + v.alt, v.spot.z + (Math.random() - 0.5) * 8);
        if (flying) {
          kill("crash");
          onBail();
        }
        return;
      }

      if (g) {
        g.visible = true;
        g.position.set(v.spot.x, a.y, v.spot.z);
        // Bank into the turn. (A plane's roll is + when turning left, a helicopter's is + when turning right; +z tips the top to the left.)
        g.rotation.set(a.pitch, v.spot.heading, v.body === "plane" ? a.roll : -a.roll, "YXZ");
      }
      const p = props.current[i];
      if (p) {
        a.rotor += (v.body === "plane" ? a.throttle * 60 : Math.max(a.pilot ? 18 : 0, a.throttle * 30)) * dt;
        if (v.body === "plane") p.rotation.z = a.rotor;
        else p.rotation.y = a.rotor;
      }
      if (flying) {
        drive.pos.set(v.spot.x, a.y, v.spot.z);
        drive.heading = v.spot.heading;
        drive.speed = a.speed;
        drive.gear = a.throttle > 0.02 ? "D" : "P";
        drive.braking = false;
      }
    });
  });

  return (
    <group>
      {fleet.map((v, i) =>
        !isAircraft(v) ? null : (
          <group
            key={v.id}
            ref={(g) => {
              groups.current[i] = g;
              g?.position.set(v.spot.x, groundAt(v.spot.x, v.spot.z) + v.alt, v.spot.z);
              g?.rotation.set(0, v.spot.heading, 0);
            }}
          >
            {v.body === "plane" ? (
              <PlaneModel
                color={v.color}
                propRef={(g) => {
                  props.current[i] = g;
                }}
              />
            ) : (
              <HeliModel
                color={v.color}
                rotorRef={(g) => {
                  props.current[i] = g;
                }}
              />
            )}
          </group>
        ),
      )}
    </group>
  );
}

function stepPlane(v: Vehicle, a: Air, flying: boolean, dt: number) {
  const s = v.spot;
  if (flying) {
    if (input.forward) a.throttle = Math.min(1, a.throttle + dt * 0.6);
    if (input.back) a.throttle = Math.max(0, a.throttle - dt * 0.8);
  } else a.throttle = Math.max(0, a.throttle - dt * 0.3);
  const steer = flying ? Number(input.strafeLeft || input.turnLeft) - Number(input.strafeRight || input.turnRight) : 0;
  const up = flying ? Number(input.brake) - Number(input.run) : 0;
  // Thrust against drag (and rolling resistance on the ground).
  const thrust = a.throttle * 26;
  const drag = a.speed * a.speed * (26 / (PLANE_TOP * PLANE_TOP)) + (v.alt <= 0.05 ? 1.5 : 0);
  a.speed = Math.max(0, a.speed + (thrust - drag) * dt - (v.alt <= 0.05 && a.throttle < 0.05 ? 6 * dt : 0));
  const onGround = v.alt <= 0.05;
  if (onGround) {
    // On the ground: steer with the nose wheel; pull up to take off once fast enough.
    a.roll = 0;
    s.heading += steer * Math.min(1, a.speed / 6) * 0.7 * dt;
    a.pitch = a.speed > TAKEOFF ? Math.max(0, a.pitch + up * 0.6 * dt) : Math.max(0, a.pitch - dt);
    a.vy = a.pitch > 0.05 ? a.speed * Math.sin(a.pitch) : 0;
  } else {
    // In the air: bank to turn, pitch to climb or dive; too slow and the nose drops (a stall).
    a.roll += ((steer * 0.65) - a.roll) * Math.min(1, dt * 2.5);
    s.heading += Math.tan(a.roll) * (9.8 / Math.max(a.speed, 12)) * dt * 1.6;
    a.pitch += up * 0.7 * dt;
    if (!up) a.pitch *= 1 - dt * 0.35;
    if (a.speed < TAKEOFF * 0.8) a.pitch -= dt * 0.6;
    a.pitch = Math.max(-0.7, Math.min(0.6, a.pitch));
    const lift = Math.min(1, a.speed / TAKEOFF);
    a.vy = a.speed * Math.sin(a.pitch) - (1 - lift) * 14;
    // No one flying it: it glides down.
    if (!flying) a.pitch += (-0.12 - a.pitch) * dt;
  }
  const fx = -Math.sin(s.heading);
  const fz = -Math.cos(s.heading);
  s.x += fx * a.speed * Math.cos(a.pitch) * dt;
  s.z += fz * a.speed * Math.cos(a.pitch) * dt;
  a.y += a.vy * dt;
}

function stepHeli(v: Vehicle, a: Air, flying: boolean, dt: number) {
  const s = v.spot;
  if (flying) {
    const fwd = Number(input.forward) - Number(input.back);
    const turn = Number(input.strafeLeft || input.turnLeft) - Number(input.strafeRight || input.turnRight);
    const lift = Number(input.brake) - Number(input.run);
    a.throttle = Math.min(1, a.throttle + dt * 0.8);
    a.vy += (lift * 12 - a.vy) * Math.min(1, dt * 2);
    if (v.alt > 1.5 || lift > 0) {
      a.speed += (fwd * 50 - a.speed) * Math.min(1, dt * 0.9);
      s.heading += turn * 1.2 * dt;
    } else a.speed *= 1 - dt * 3;
    a.pitch += (fwd * -0.22 - a.pitch) * Math.min(1, dt * 3);
    a.roll += (-turn * 0.18 * Math.min(1, Math.abs(a.speed) / 20) - a.roll) * Math.min(1, dt * 3);
  } else {
    // Nobody flying it: it drops (or sits on the ground with the rotor winding down).
    a.throttle = Math.max(0, a.throttle - dt * 0.4);
    a.vy = v.alt > 0 ? Math.max(-14, a.vy - 9 * dt) : 0;
    a.speed *= 1 - dt * 0.5;
    a.pitch *= 1 - dt;
    a.roll *= 1 - dt;
  }
  const fx = -Math.sin(s.heading);
  const fz = -Math.cos(s.heading);
  s.x += fx * a.speed * dt;
  s.z += fz * a.speed * dt;
  a.y = Math.min(600, a.y + a.vy * dt);
}

// ---- Models ---------------------------------------------------------------------------------

const metal = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.4, clearcoat: 0.8 });
const DARK = new THREE.MeshStandardMaterial({ color: "#1b1d21", roughness: 0.4 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: "#1d2733", roughness: 0.05, metalness: 0.3, clearcoat: 1 });

/** A high-wing light plane with a spinning propeller and fixed landing gear. Nose toward -z. */
function PlaneModel({ color, propRef }: { color: string; propRef: (g: THREE.Group | null) => void }) {
  const body = useMemo(() => metal(color), [color]);
  const stripe = useMemo(() => metal("#1d4f91"), []);
  return (
    <group position-y={1.3}>
      {/* Fuselage: a long rounded body tapering to the tail */}
      <mesh rotation-x={Math.PI / 2} scale={[1, 1, 1]} material={body} castShadow raycast={noRaycast}>
        <capsuleGeometry args={[0.85, 3.6, 8, 16]} />
      </mesh>
      <mesh position={[0, 0.2, 3.6]} rotation-x={Math.PI / 2 - 0.12} material={body} castShadow raycast={noRaycast}>
        <coneGeometry args={[0.7, 3.2, 14]} />
      </mesh>
      <mesh position={[0, 0.05, -0.2]} rotation-x={Math.PI / 2} material={stripe} raycast={noRaycast}>
        <cylinderGeometry args={[0.87, 0.87, 2.4, 16, 1, true]} />
      </mesh>
      {/* Windows */}
      <mesh position={[0, 0.55, -1.2]} scale={[0.82, 0.45, 1.2]} material={GLASS} raycast={noRaycast}>
        <sphereGeometry args={[1, 16, 10]} />
      </mesh>
      {/* High wing with struts */}
      <mesh position={[0, 1.05, -0.4]} material={body} castShadow raycast={noRaycast}>
        <boxGeometry args={[11.5, 0.18, 1.6]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 2.2, 0.15, -0.4]} rotation-z={s * 0.6} material={DARK} raycast={noRaycast}>
          <boxGeometry args={[0.08, 2.2, 0.12]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`t${s}`} position={[s * 5.7, 1.05, -0.4]} raycast={noRaycast}>
          <boxGeometry args={[0.1, 0.12, 0.3]} />
          <meshBasicMaterial color={s < 0 ? "#ff2a1a" : "#2bff6a"} toneMapped={false} />
        </mesh>
      ))}
      {/* Tail: fin and stabiliser */}
      <mesh position={[0, 1.1, 4.6]} material={body} castShadow raycast={noRaycast}>
        <boxGeometry args={[0.12, 1.8, 1.4]} />
      </mesh>
      <mesh position={[0, 0.35, 4.8]} material={body} raycast={noRaycast}>
        <boxGeometry args={[3.6, 0.1, 1]} />
      </mesh>
      {/* Propeller */}
      <group ref={propRef} position={[0, 0, -2.75]}>
        <mesh material={DARK} raycast={noRaycast}>
          <boxGeometry args={[0.15, 2.6, 0.08]} />
        </mesh>
        <mesh material={metal("#c9ced4")} position-z={-0.1} raycast={noRaycast}>
          <coneGeometry args={[0.25, 0.4, 12]} />
        </mesh>
      </group>
      {/* Landing gear */}
      {[
        [0, -1.0, -1.9],
        [-1.1, -1.0, 0.4],
        [1.1, -1.0, 0.4],
      ].map(([x, y, z], k) => (
        <group key={k} position={[x, y, z]}>
          <mesh material={DARK} position-y={0.35} raycast={noRaycast}>
            <boxGeometry args={[0.08, 0.7, 0.08]} />
          </mesh>
          <mesh rotation-z={Math.PI / 2} material={DARK} raycast={noRaycast}>
            <cylinderGeometry args={[0.3, 0.3, 0.2, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A helicopter with a spinning main rotor and tail rotor, on skids. Nose toward -z. */
function HeliModel({ color, rotorRef }: { color: string; rotorRef: (g: THREE.Group | null) => void }) {
  const body = useMemo(() => metal(color), [color]);
  return (
    <group position-y={2.4}>
      <mesh scale={[1.9, 1.8, 3.2]} material={body} castShadow raycast={noRaycast}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh position={[0, 0.35, -1.9]} scale={[1.45, 1.05, 1.5]} material={GLASS} raycast={noRaycast}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
      <mesh position={[0, 0.3, 4.6]} material={body} castShadow raycast={noRaycast}>
        <boxGeometry args={[0.5, 0.5, 5.5]} />
      </mesh>
      <mesh position={[0, 1.1, 7.2]} material={body} raycast={noRaycast}>
        <boxGeometry args={[0.16, 1.8, 1.2]} />
      </mesh>
      <mesh position={[0.35, 1.1, 7.3]} material={DARK} raycast={noRaycast}>
        <boxGeometry args={[0.05, 2.2, 0.22]} />
      </mesh>
      <mesh position={[0, 2.0, 0]} material={DARK} raycast={noRaycast}>
        <cylinderGeometry args={[0.18, 0.18, 0.7, 8]} />
      </mesh>
      <group ref={rotorRef} position={[0, 2.4, 0]}>
        {[0, Math.PI / 2].map((r) => (
          <mesh key={r} rotation-y={r} material={DARK} raycast={noRaycast}>
            <boxGeometry args={[13, 0.08, 0.55]} />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((k) => (
        <group key={k}>
          <mesh position={[k * 1.4, -2.05, 0]} material={DARK} raycast={noRaycast}>
            <boxGeometry args={[0.16, 0.16, 4.6]} />
          </mesh>
          {[-1, 1].map((z) => (
            <mesh key={z} position={[k * 1.2, -1.6, z * 1.2]} rotation-z={k * 0.35} material={DARK} raycast={noRaycast}>
              <boxGeometry args={[0.1, 0.9, 0.1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
