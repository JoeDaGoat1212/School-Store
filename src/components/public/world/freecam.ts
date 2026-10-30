import * as THREE from "three";
import { notify } from "./game-events";
import { groundAt } from "./terrain";
import { WORLD_BOUNDS } from "./world-map";
import { player } from "./you";

/*
 * Fly mode: a free camera to fly round the whole map and look at
 * everything. Plain TypeScript; camera.tsx hands it the camera every frame
 * while it's on, and city-hud.tsx has the button.
 *
 *   W / S or ↑ ↓    forward and back (the way you're looking, so look down and W dives)
 *   A / D           slide left and right
 *   ← →             turn
 *   Space / E       up        Q / C   down
 *   Shift           fast (hold)
 *   Mouse wheel     slower / faster
 *   Drag            look round (mouse or finger)
 *   Esc             back to where you were
 *
 * You stay where you were standing while the camera's away, and come back to
 * it when you're done.
 */

export const freecam = {
  on: false,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  /** Cruising speed (units a second); the wheel changes it. */
  speed: 45,
  started: false,
  /** On-screen buttons (phones): forward, back, up, down. */
  touch: { fwd: 0, up: 0 },
};

const keys = new Set<string>();
let wasFrozen = false;
let drag: { id: number; x: number; y: number } | null = null;

const FLY_KEYS = new Set(["KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyE", "KeyQ", "KeyC", "ShiftLeft", "ShiftRight"]);

function typing(e: Event) {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)));
}
function onDown(e: KeyboardEvent) {
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Escape") {
    stopFreecam();
    return;
  }
  if (FLY_KEYS.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
}
function onUp(e: KeyboardEvent) {
  keys.delete(e.code);
}
function onBlur() {
  keys.clear();
  drag = null;
}
function onPointerDown(e: PointerEvent) {
  // Only drags that start on the world itself (not on the buttons over it).
  if ((e.target as HTMLElement | null)?.tagName !== "CANVAS") return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
}
function onPointerMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  freecam.yaw += dx * 0.0042;
  freecam.pitch = THREE.MathUtils.clamp(freecam.pitch - dy * 0.0042, -1.45, 1.45);
}
function onPointerUp(e: PointerEvent) {
  if (drag && e.pointerId === drag.id) drag = null;
}
function onWheel(e: WheelEvent) {
  freecam.speed = THREE.MathUtils.clamp(freecam.speed * (e.deltaY > 0 ? 1 / 1.18 : 1.18), 6, 400);
  notify();
}

/** Start flying (from wherever the camera is now). */
export function startFreecam() {
  if (freecam.on) return;
  freecam.on = true;
  freecam.started = false;
  freecam.vel.set(0, 0, 0);
  wasFrozen = player.frozen;
  player.frozen = true;
  keys.clear();
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("wheel", onWheel, { passive: true });
  notify();
}

/** Stop flying: back to where you were standing. */
export function stopFreecam() {
  if (!freecam.on) return;
  freecam.on = false;
  player.frozen = wasFrozen;
  keys.clear();
  drag = null;
  freecam.touch.fwd = 0;
  freecam.touch.up = 0;
  window.removeEventListener("keydown", onDown);
  window.removeEventListener("keyup", onUp);
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
  window.removeEventListener("wheel", onWheel);
  notify();
}

export const toggleFreecam = () => (freecam.on ? stopFreecam() : startFreecam());

const fwd = new THREE.Vector3();
const side = new THREE.Vector3();
const want = new THREE.Vector3();
const look = new THREE.Vector3();

/** Every frame while flying: move and point the camera. */
export function tickFreecam(cam: THREE.Camera, dt: number) {
  if (!freecam.started) {
    // Start from the camera as it is, lifted up a little so you can see round you.
    freecam.started = true;
    freecam.pos.copy(cam.position);
    cam.getWorldDirection(look);
    freecam.yaw = Math.atan2(look.x, -look.z);
    freecam.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(look.y, -1, 1)), -1.2, 1.2) - 0.15;
    freecam.vel.set(0, 6, 0);
  }
  const k = (c: string) => (keys.has(c) ? 1 : 0);
  const turn = k("ArrowRight") - k("ArrowLeft");
  freecam.yaw += turn * 1.6 * dt;
  const cp = Math.cos(freecam.pitch);
  fwd.set(Math.sin(freecam.yaw) * cp, Math.sin(freecam.pitch), -Math.cos(freecam.yaw) * cp);
  side.set(Math.cos(freecam.yaw), 0, Math.sin(freecam.yaw));
  const f = k("KeyW") + k("ArrowUp") - k("KeyS") - k("ArrowDown") + freecam.touch.fwd;
  const s = k("KeyD") - k("KeyA");
  const u = k("Space") + k("KeyE") - k("KeyQ") - k("KeyC") + freecam.touch.up;
  const fast = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4 : 1;
  // Higher up, a little quicker (it looks slower from up there).
  const height = Math.max(0, freecam.pos.y - groundAt(freecam.pos.x, freecam.pos.z));
  const sp = freecam.speed * fast * (1 + Math.min(2, height / 250));
  want
    .set(0, 0, 0)
    .addScaledVector(fwd, Math.sign(f) * Math.min(1, Math.abs(f)))
    .addScaledVector(side, s);
  if (want.lengthSq() > 1) want.normalize();
  want.multiplyScalar(sp);
  want.y += Math.sign(u) * Math.min(1, Math.abs(u)) * sp * 0.7;
  // Smooth starts and stops (like a drone).
  freecam.vel.lerp(want, 1 - Math.exp(-dt * 4));
  freecam.pos.addScaledVector(freecam.vel, dt);
  // Not through the ground, not off into space or past the edge of the map.
  const floor = groundAt(freecam.pos.x, freecam.pos.z) + 1.2;
  if (freecam.pos.y < floor) {
    freecam.pos.y = floor;
    if (freecam.vel.y < 0) freecam.vel.y = 0;
  }
  freecam.pos.y = Math.min(freecam.pos.y, 1100);
  freecam.pos.x = THREE.MathUtils.clamp(freecam.pos.x, WORLD_BOUNDS.minX - 300, WORLD_BOUNDS.maxX + 300);
  freecam.pos.z = THREE.MathUtils.clamp(freecam.pos.z, WORLD_BOUNDS.minZ - 300, WORLD_BOUNDS.maxZ + 300);
  cam.position.copy(freecam.pos);
  look.copy(freecam.pos).add(fwd);
  cam.lookAt(look);
}

/** How high you are (for the screen). */
export const freecamHeight = () => Math.max(0, Math.round(freecam.pos.y - groundAt(freecam.pos.x, freecam.pos.z)));
