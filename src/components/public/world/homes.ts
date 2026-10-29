import { profile } from "./profile";
import { DROP } from "./world-layout";

/*
 * Where you wake up: in front of your house if you own one (the one marked as
 * home), otherwise in the store's parking lot. Houses register their front
 * doors here (houses-layout.ts).
 */

const doors = new Map<string, { x: number; z: number; yaw: number }>();

export function registerHomeDoor(id: string, spot: { x: number; z: number; yaw: number }) {
  doors.set(id, spot);
}

export function homeSpot() {
  const id = profile.home ?? profile.houses[0];
  const door = id ? doors.get(id) : undefined;
  return door ?? { x: DROP.x, z: DROP.z, yaw: 0 };
}
