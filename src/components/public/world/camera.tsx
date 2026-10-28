"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { inStore, parkedSpots, player, walkBlocked } from "./bump";
import { drive, input, moving } from "./drive";
import { doors, EYE, INSIDE, nearestStation, type Blocker, type Station, type StationKey } from "./world-layout";

/*
 * The camera, like a person (or a drone) in the store.
 *
 * Start: a drone circling the store. Drag to fly around it.
 * "Click to enter": the camera swoops down and drops you in the parking lot,
 * facing the doors. Walk with the arrow keys / WASD, anywhere: into the
 * store (the doors open by themselves as you get close, and shut once you're
 * far enough away), round the lot, and out into the town. You can't walk
 * through walls, shelves, houses, trees or cars.
 * Inside you can also drag to look around and tap floor arrows to walk.
 * Driving a car: the camera follows behind it.
 */

const WALK_SPEED = 8;
const RUN_SPEED = 14;
const TURN_SPEED = 1.9;
/** The doors open when someone's this close to them, and shut again past SHUT. */
const OPEN = 8;
const SHUT = 10;
/** How close you need to be to a car to get in. */
const REACH = 6.5;

/** Where the drone circles: around this point, this far out. */
const ORBIT_CENTER = new THREE.Vector3(0, 4, -14);
const ORBIT_RADIUS = 74;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** The shortest way round from one angle to another. */
const turnBetween = (a: number, b: number) => ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

function yawPitchOf(from: THREE.Vector3, to: THREE.Vector3) {
  const v = to.clone().sub(from);
  return { yaw: Math.atan2(v.x, -v.z), pitch: Math.asin(clamp(v.y / Math.max(v.length(), 1e-6), -1, 1)) };
}

function dirOf(yaw: number, pitch: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

export function CameraRig({
  stations,
  current,
  calm,
  onArrive,
  blockers = [],
  onWalk,
  onNearCar,
}: {
  stations: Record<StationKey, Station>;
  current: StationKey;
  calm: boolean;
  /** Called when the camera finishes moving to a spot. */
  onArrive: (station: StationKey) => void;
  /** Things you can't walk through (for the arrow keys). */
  blockers?: Blocker[];
  /** Walked (with the keys) up to a spot, or away from it ("walk"). */
  onWalk?: (station: StationKey) => void;
  /** Walked up to a parked car (its number), or away from it (null). */
  onNearCar?: (car: number | null) => void;
}) {
  const size = useThree((s) => s.size);
  const portrait = size.width < size.height;
  const getState = useThree((s) => s.get);
  const onArriveRef = useRef(onArrive);
  const onWalkRef = useRef(onWalk);
  const onNearCarRef = useRef(onNearCar);
  const blockersRef = useRef(blockers);
  const stationsRef = useRef(stations);
  useEffect(() => {
    onArriveRef.current = onArrive;
    onWalkRef.current = onWalk;
    onNearCarRef.current = onNearCar;
    blockersRef.current = blockers;
    stationsRef.current = stations;
  });

  const currentRef = useRef(current);
  const r = useRef({
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    // Outside: the drone's angle round the store, and how high up.
    orbitYaw: 0,
    orbitPitch: 0.42,
    // A slow side-to-side drift while nobody's dragging (so the view feels alive).
    sway: 0,
    flight: null as null | {
      from: THREE.Vector3;
      fromYaw: number;
      fromPitch: number;
      to: THREE.Vector3;
      toYaw: number;
      toPitch: number;
      start: number;
      duration: number;
      curve: THREE.CatmullRomCurve3 | null;
      key: StationKey;
    },
    dragging: false,
    lastDrag: 0,
    started: false,
    /** The spot we last told the page we'd walked to (so it doesn't fly us there). */
    walkedTo: null as StationKey | null,
    /** The car we last said you were next to. */
    nearCar: null as number | null,
    /** The normal field of view (it widens a little at high speed). */
    fov: 56,
  });

  // Wider view on tall phone screens.
  useLayoutEffect(() => {
    const cam = getState().camera as THREE.PerspectiveCamera;
    cam.fov = portrait ? 68 : 56;
    r.current.fov = cam.fov;
    cam.updateProjectionMatrix();
  }, [portrait, getState]);

  // Drag to look around (inside) or fly around the store (outside).
  useEffect(() => {
    const el = getState().gl.domElement;
    el.style.touchAction = "none";
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      r.current.dragging = true;
      // Fold the slow drift into the drone's angle, so nothing jumps.
      r.current.orbitYaw += Math.sin(r.current.sway) * 0.28;
      r.current.sway = 0;
    };
    const move = (e: PointerEvent) => {
      if (!last || !r.current.dragging) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      r.current.lastDrag = performance.now();
      if (r.current.flight) return;
      if (currentRef.current === "outside") {
        r.current.orbitYaw -= dx * 0.005;
        r.current.orbitPitch = clamp(r.current.orbitPitch + dy * 0.004, 0.16, 1.2);
      } else {
        r.current.yaw -= dx * 0.0042;
        r.current.pitch = clamp(r.current.pitch + dy * 0.0042, -0.8, 0.65);
      }
    };
    const up = () => {
      last = null;
      r.current.dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [getState]);

  // A new spot: plan the trip there.
  useEffect(() => {
    const s = r.current;
    const prev = currentRef.current;
    currentRef.current = current;
    const st = stations[current];
    if (current === "outside") return;
    // Got here by walking with the keys: you're already here, no need to fly.
    if (current === "walk" || current === s.walkedTo) return;
    const to = new THREE.Vector3(st.x, EYE, st.z);
    const target = new THREE.Vector3(...st.look);
    if (portrait && current !== "entrance" && current !== "center" && current !== "lot") {
      // Tall phone screen: step back from what you're looking at so more of it fits.
      const back = to.clone().sub(target).setY(0).normalize();
      to.addScaledVector(back, current === "checkout" ? 4 : 5);
      to.x = clamp(to.x, INSIDE.left + 1.5, INSIDE.right - 1.5);
      to.z = clamp(to.z, INSIDE.back + 1.5, INSIDE.front - 1.5);
    }
    if (current === "lot") {
      // Dropped in the parking lot: stand still and look straight at the doors.
      target.set(0, EYE - 0.3, -10);
    }
    const look = yawPitchOf(to, target);
    if (!s.started) {
      // Opening the page already inside (shouldn't happen, but be safe).
      s.pos.copy(to);
      s.yaw = look.yaw;
      s.pitch = look.pitch;
      s.started = true;
      return;
    }
    const from = s.pos.clone();
    let curve: THREE.CatmullRomCurve3 | null = null;
    let duration = Math.min(2.4, 0.9 + from.distanceTo(to) * 0.045);
    const goingIn = to.z < 0 && !inStore(from.x, from.z);
    if (prev === "outside" && current === "lot") {
      // From the sky, swoop down into the parking lot in front of the doors.
      curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(from.x * 0.4, 26, 52), new THREE.Vector3(0, EYE + 2, 22), to], false, "centripetal");
      duration = 3.4;
    } else if (prev === "outside") {
      // Down from the sky, through the doors, and in.
      curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(0, 14, 34), new THREE.Vector3(0, EYE + 0.4, 9), new THREE.Vector3(0, EYE, 1.5), to], false, "centripetal");
      duration = 4.2;
    } else if (goingIn) {
      // From outside: walk up to the doors, through them, and on.
      const pts = [from, new THREE.Vector3(0, EYE, Math.max(6, Math.min(from.z, 14))), new THREE.Vector3(0, EYE, 1.5), new THREE.Vector3(0, EYE, -3), to];
      curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      duration = clamp(1.6 + from.distanceTo(pts[1]) * 0.02, 2.2, 5);
    }
    if (calm) duration = 0.01;
    s.flight = { from, fromYaw: s.yaw, fromPitch: s.pitch, to, toYaw: look.yaw, toPitch: look.pitch, start: -1, duration, curve, key: current };
  }, [current, stations, calm, portrait]);

  useFrame((state, delta) => {
    const s = r.current;
    const cam = state.camera;
    const now = state.clock.elapsedTime;
    // (Capped, so a long pause between frames doesn't teleport you.)
    const dt = Math.min(delta, 0.1);

    // ---- Driving: follow the car from behind and a little above ----
    if (drive.active) {
      const fx = -Math.sin(drive.heading);
      const fz = -Math.cos(drive.heading);
      // Pull back further the faster you go.
      const back = 12 + Math.abs(drive.speed) * 0.18;
      const want = new THREE.Vector3(drive.pos.x - fx * back, 5.2, drive.pos.z - fz * back);
      if (!s.started) s.pos.copy(want);
      s.pos.x = THREE.MathUtils.damp(s.pos.x, want.x, 5, dt);
      s.pos.y = THREE.MathUtils.damp(s.pos.y, want.y, 5, dt);
      s.pos.z = THREE.MathUtils.damp(s.pos.z, want.z, 5, dt);
      const look = yawPitchOf(s.pos, new THREE.Vector3(drive.pos.x + fx * 6, 1.6, drive.pos.z + fz * 6));
      s.yaw = look.yaw;
      s.pitch = look.pitch;
      s.started = true;
      s.flight = null;
      player.onFoot = false;
      // A wider view the faster you go (it feels faster).
      widen(cam as THREE.PerspectiveCamera, s.fov + Math.min(Math.abs(drive.speed) * 0.3, 14), dt);
      shutDoors(drive.pos.x, drive.pos.z, false);
      cam.position.copy(s.pos);
      cam.lookAt(dirOf(s.yaw, s.pitch).add(s.pos));
      return;
    }
    widen(cam as THREE.PerspectiveCamera, s.fov, dt);

    // ---- Just got out of a car: hop down beside it ----
    if (player.hop) {
      player.hop = false;
      const to = new THREE.Vector3(player.x, EYE, player.z);
      s.flight = { from: s.pos.clone(), fromYaw: s.yaw, fromPitch: s.pitch, to, toYaw: player.yaw, toPitch: -0.05, start: -1, duration: calm ? 0.01 : 0.9, curve: null, key: "walk" };
    }

    // ---- Walking with the keys (inside and out) ----
    if (currentRef.current !== "outside" && !s.flight && moving()) {
      s.yaw += (Number(input.turnRight) - Number(input.turnLeft)) * TURN_SPEED * dt;
      const fwd = Number(input.forward) - Number(input.back);
      const side = Number(input.strafeRight) - Number(input.strafeLeft);
      const speed = (input.run ? RUN_SPEED : WALK_SPEED) * dt;
      const mx = (Math.sin(s.yaw) * fwd + Math.cos(s.yaw) * side) * speed;
      const mz = (-Math.cos(s.yaw) * fwd + Math.sin(s.yaw) * side) * speed;
      const b = blockersRef.current;
      // Slide along walls and shelves instead of stopping dead.
      if (!walkBlocked(s.pos.x + mx, s.pos.z + mz, b)) {
        s.pos.x += mx;
        s.pos.z += mz;
      } else if (!walkBlocked(s.pos.x + mx, s.pos.z, b)) s.pos.x += mx;
      else if (!walkBlocked(s.pos.x, s.pos.z + mz, b)) s.pos.z += mz;
      s.pos.y = THREE.MathUtils.damp(s.pos.y, EYE, 6, dt);
      // Level the view a little while walking.
      s.pitch = THREE.MathUtils.damp(s.pitch, Math.min(s.pitch, 0.05), 2, dt);
      // Tell the page when you've walked up to a spot (or away from one).
      // (Only in the store: outside you're just "walking".)
      const near = (inStore(s.pos.x, s.pos.z) && nearestStation(stationsRef.current, s.pos.x, s.pos.z)) || "walk";
      if (near !== currentRef.current) {
        s.walkedTo = near;
        onWalkRef.current?.(near);
      }
    }

    // ---- Outside: ← → and ↑ ↓ fly the drone round ----
    if (currentRef.current === "outside" && !s.flight && moving()) {
      s.orbitYaw += (Number(input.turnRight || input.strafeRight) - Number(input.turnLeft || input.strafeLeft)) * 1.2 * dt;
      s.orbitPitch = clamp(s.orbitPitch + (Number(input.forward) - Number(input.back)) * 0.6 * dt, 0.16, 1.2);
      s.lastDrag = performance.now();
    }

    if (currentRef.current === "outside" && !s.flight) {
      // The drone circles slowly on its own until you drag.
      if (!calm && !s.dragging && performance.now() - s.lastDrag > 2500) s.sway += delta * 0.22;
      const yaw = s.orbitYaw + Math.sin(s.sway) * 0.28;
      const p = s.orbitPitch;
      // Fly further out on tall phone screens, so the whole store fits across.
      const radius = ORBIT_RADIUS * (portrait ? 1.55 : 1);
      const orbit = new THREE.Vector3(
        ORBIT_CENTER.x + Math.sin(yaw) * Math.cos(p) * radius,
        ORBIT_CENTER.y + Math.sin(p) * radius,
        ORBIT_CENTER.z + Math.cos(yaw) * Math.cos(p) * radius,
      );
      s.pos.copy(orbit);
      const look = yawPitchOf(s.pos, ORBIT_CENTER);
      s.yaw = look.yaw;
      s.pitch = look.pitch;
      s.started = true;
    } else if (s.flight) {
      const f = s.flight;
      if (f.start < 0) f.start = now;
      const t = Math.min(1, (now - f.start) / f.duration);
      const e = ease(t);
      if (f.curve) {
        f.curve.getPoint(e, s.pos);
        // Look where we're going, then settle on the view of the spot.
        const ahead = f.curve.getPoint(Math.min(1, e + 0.04));
        const along = yawPitchOf(s.pos, ahead);
        const settle = clamp((t - 0.7) / 0.3, 0, 1);
        const travelYaw = Number.isFinite(along.yaw) && s.pos.distanceTo(ahead) > 0.01 ? along.yaw : f.toYaw;
        s.yaw = travelYaw + turnBetween(travelYaw, f.toYaw) * settle;
        s.pitch = along.pitch * (1 - settle) + f.toPitch * settle;
      } else {
        s.pos.lerpVectors(f.from, f.to, e);
        s.yaw = f.fromYaw + turnBetween(f.fromYaw, f.toYaw) * e;
        s.pitch = f.fromPitch + (f.toPitch - f.fromPitch) * e;
      }
      if (t >= 1) {
        s.flight = null;
        onArriveRef.current(f.key);
      }
    }

    // ---- Where you are, for everyone else ----
    const onFoot = currentRef.current !== "outside";
    player.onFoot = onFoot;
    if (onFoot) {
      player.x = s.pos.x;
      player.z = s.pos.z;
      player.yaw = s.yaw;
    }
    // The doors: open when you're close (or flying through), shut once you're far enough away.
    shutDoors(s.pos.x, s.pos.z, Boolean(s.flight?.curve));

    // Next to a car you can drive? (Not while flying anywhere.)
    let near: number | null = null;
    if (onFoot && !s.flight && !inStore(s.pos.x, s.pos.z)) {
      let best = REACH;
      parkedSpots.forEach((c, i) => {
        const d = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
        if (d < best) {
          best = d;
          near = i;
        }
      });
    }
    if (near !== s.nearCar) {
      s.nearCar = near;
      onNearCarRef.current?.(near);
    }

    cam.position.copy(s.pos);
    cam.lookAt(dirOf(s.yaw, s.pitch).add(s.pos));
  });

  return null;
}

/** Open the doors when (x, z) is close to them, shut them once it's far enough away. */
function shutDoors(x: number, z: number, flyingThrough: boolean) {
  const d = Math.hypot(x, z);
  if (d < OPEN || (flyingThrough && d < 24)) doors.open = true;
  else if (d > SHUT) doors.open = false;
}

/** Ease the camera's field of view toward `fov`. */
function widen(cam: THREE.PerspectiveCamera, fov: number, dt: number) {
  if (Math.abs(cam.fov - fov) < 0.02) return;
  cam.fov = THREE.MathUtils.damp(cam.fov, fov, 3, dt);
  cam.updateProjectionMatrix();
}
