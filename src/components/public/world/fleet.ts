import type { CarSpot } from "./bump";
import { newLook, type CarLook } from "./car-model";
import { PARKED_CARS } from "./exterior";
import { notify } from "./game-events";
import { modelOf, type Body } from "./vehicles";
import { AIRPORT, DEALERSHIP } from "./world-map";

/*
 * Every vehicle you can get into: the cars parked round the store and the
 * bank, the plane and helicopters at the airport, and the cars and bikes
 * you've bought (they wait for you in the dealership's lot). Plain
 * TypeScript. Each one remembers where it is (they stay wherever you leave
 * them).
 */

export type Vehicle = {
  id: string;
  model: string;
  body: Body;
  color: string;
  spot: CarSpot;
  /** Height off the ground (aircraft) and how fast it's climbing. */
  alt: number;
  look: CarLook;
  owned: boolean;
};

/** Where each vehicle is now (bump.ts treats them as things you bump into). */
export const parkedSpots: CarSpot[] = [];
export const fleet: Vehicle[] = [];

function add(v: Omit<Vehicle, "look" | "alt" | "body"> & { alt?: number }) {
  const vehicle: Vehicle = { ...v, alt: v.alt ?? 0, body: modelOf(v.model).body, look: newLook() };
  fleet.push(vehicle);
  parkedSpots.push(vehicle.spot);
  return vehicle;
}

// The town's parked cars (a mix of everyday models).
const TOWN_MODELS = ["town-sedan", "town-hatch", "town-suv", "town-sedan", "town-pickup", "town-hatch", "town-suv", "town-sedan", "town-sedan", "town-suv"];
PARKED_CARS.forEach((c, i) => add({ id: `town-${i}`, model: TOWN_MODELS[i % TOWN_MODELS.length], color: c.color, spot: { x: c.x, z: c.z, heading: c.turn }, owned: false }));
// The aircraft at the airport.
add({ id: "plane-1", model: "plane", color: "#f2f4f7", spot: { x: -1000, z: 190, heading: Math.PI / 2 }, owned: false });
add({ id: "plane-2", model: "plane", color: "#ffd21f", spot: { x: -960, z: 190, heading: Math.PI / 2 }, owned: false });
AIRPORT.helipads.forEach((h, i) => add({ id: `heli-${i}`, model: "heli", color: i ? "#e5483b" : "#1d4f91", spot: { x: h.x, z: h.z, heading: Math.PI }, owned: false }));

export const isAircraft = (v: Vehicle | undefined) => v?.body === "plane" || v?.body === "heli";

/** Parking spaces in the dealership's lot, for cars you buy. */
function lotSpot(n: number): CarSpot {
  const L = DEALERSHIP.lot;
  const per = Math.floor((L.z1 - L.z0) / 5);
  const col = Math.floor(n / per) % 2;
  const row = n % per;
  return { x: L.x0 + 9 + col * 18, z: L.z0 + 3 + row * 5, heading: col ? -Math.PI / 2 : Math.PI / 2 };
}

/** Your cars (from your save): they're waiting in the lot (or where you last left them). */
export function syncOwned(cars: { id: string; model: string; color: string; x?: number; z?: number; heading?: number }[]) {
  cars.forEach((c, i) => {
    if (fleet.some((v) => v.id === c.id)) return;
    const spot = typeof c.x === "number" && typeof c.z === "number" ? { x: c.x, z: c.z, heading: c.heading ?? 0 } : lotSpot(i);
    add({ id: c.id, model: c.model, color: c.color, spot, owned: true });
  });
  notify();
}

/** A car you've just bought: parked in the lot. Returns its number in the fleet. */
export function addBought(id: string, model: string, color: string) {
  const n = fleet.filter((v) => v.owned).length;
  add({ id, model, color, spot: lotSpot(n), owned: true });
  notify();
  return fleet.length - 1;
}
