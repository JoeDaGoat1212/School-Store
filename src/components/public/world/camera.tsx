"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EYE, INSIDE, type Station, type StationKey } from "./world-layout";

/*
 * The camera, like a person (or a drone) in the store.
 *
 * Outside: a drone circling the store. Drag to fly around it.
 * Going in: the camera flies down, through the doors, and stops inside.
 * Inside: you stand at a spot and drag to look around (like Street View);
 * tapping a floor arrow walks you to the next spot.
 */

/** Where the drone circles: around this point, this far out. */
const ORBIT_CENTER = new THREE.Vector3(0, 4, -10);
const ORBIT_RADIUS = 58;

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
}: {
  stations: Record<StationKey, Station>;
  current: StationKey;
  calm: boolean;
  /** Called when the camera finishes moving to a spot. */
  onArrive: (station: StationKey) => void;
}) {
  const size = useThree((s) => s.size);
  const portrait = size.width < size.height;
  const getState = useThree((s) => s.get);
  const onArriveRef = useRef(onArrive);
  useEffect(() => {
    onArriveRef.current = onArrive;
  });

  const currentRef = useRef(current);
  const r = useRef({
    pos: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    // Outside: the drone's angle round the store, and how high up.
    orbitYaw: 0.42,
    orbitPitch: 0.5,
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
  });

  // Wider view on tall phone screens.
  useLayoutEffect(() => {
    const cam = getState().camera as THREE.PerspectiveCamera;
    cam.fov = portrait ? 68 : 56;
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
    const to = new THREE.Vector3(st.x, EYE, st.z);
    const target = new THREE.Vector3(...st.look);
    if (portrait && current !== "entrance" && current !== "center") {
      // Tall phone screen: step back from what you're looking at so more of it fits.
      const back = to.clone().sub(target).setY(0).normalize();
      to.addScaledVector(back, 5);
      to.x = clamp(to.x, INSIDE.left + 1.5, INSIDE.right - 1.5);
      to.z = clamp(to.z, INSIDE.back + 1.5, INSIDE.front - 1.5);
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
    if (prev === "outside") {
      // Down from the sky, through the doors, and in.
      curve = new THREE.CatmullRomCurve3([from, new THREE.Vector3(0, 14, 34), new THREE.Vector3(0, EYE + 0.4, 9), new THREE.Vector3(0, EYE, 1.5), to], false, "centripetal");
      duration = 4.2;
    }
    if (calm) duration = 0.01;
    s.flight = { from, fromYaw: s.yaw, fromPitch: s.pitch, to, toYaw: look.yaw, toPitch: look.pitch, start: -1, duration, curve, key: current };
  }, [current, stations, calm, portrait]);

  useFrame((state, delta) => {
    const s = r.current;
    const cam = state.camera;
    const now = state.clock.elapsedTime;

    if (currentRef.current === "outside" && !s.flight) {
      // The drone circles slowly on its own until you drag.
      if (!calm && !s.dragging && performance.now() - s.lastDrag > 2500) s.orbitYaw += delta * 0.045;
      const p = s.orbitPitch;
      // Fly further out on tall phone screens, so the whole store fits across.
      const radius = ORBIT_RADIUS * (portrait ? 1.55 : 1);
      s.pos.set(
        ORBIT_CENTER.x + Math.sin(s.orbitYaw) * Math.cos(p) * radius,
        ORBIT_CENTER.y + Math.sin(p) * radius,
        ORBIT_CENTER.z + Math.cos(s.orbitYaw) * Math.cos(p) * radius,
      );
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

    cam.position.copy(s.pos);
    cam.lookAt(dirOf(s.yaw, s.pitch).add(s.pos));
  });

  return null;
}
