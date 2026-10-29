import { addBought, fleet } from "./fleet";
import { notify } from "./game-events";
import { banner, pop } from "./heist";
import { provide } from "./interact";
import { pay, profile, saveProfile, usd } from "./profile";
import { DEALER_PLAN, inRoom, roomOf, roomPoint } from "./rooms";
import { modelOf } from "./vehicles";

/*
 * Apex Motors: the car dealership by the bank. Walk in, go to the big
 * touch screen (E) and browse every car and bike they sell (none of them are
 * on the roads): pick one, pick a colour, and buy it with your cash and bank
 * card. It's waiting for you in the lot outside, and the keys are in your
 * wallet. Plain TypeScript; dealer-panel.tsx is the screen, dealer.tsx the
 * showroom.
 */

export const dealer = { open: false };

export function openDealer(open: boolean) {
  dealer.open = open;
  notify();
}

/** Buy a car. Returns an error message, or null. */
export function buyCar(modelId: string, color: string) {
  const m = modelOf(modelId);
  if (!m.price) return "That one's not for sale.";
  if (!pay(m.price)) return `You need ${usd(m.price)} (cash and bank together). You've got ${usd(profile.cash + profile.bank)}.`;
  const id = `car-${Date.now().toString(36)}`;
  profile.cars.push({ id, model: m.id, color });
  addBought(id, m.id, color);
  saveProfile(true);
  pop(-m.price, m.name);
  banner("escaped", "Sold!", `Your new ${m.name} is parked in the lot outside. The keys are in your wallet.`, 5);
  dealer.open = false;
  notify();
  return null;
}

/** Bring a car you own to just outside the dealership (if you've lost it somewhere). */
export function fetchCar(id: string) {
  const v = fleet.find((x) => x.id === id);
  if (!v) return;
  const spot = roomPoint("dealer", 26, 6);
  Object.assign(v.spot, { x: spot.x, z: spot.z, heading: Math.PI / 2 });
  v.alt = 0;
  notify();
}

provide("dealer", (you) => {
  if (!you.onFoot) return null;
  const room = roomOf("dealer");
  if (!inRoom(room, you.x, you.z)) return null;
  const s = roomPoint("dealer", DEALER_PLAN.screen.lx, DEALER_PLAN.screen.lz + 1.4);
  if (Math.hypot(you.x - s.x, you.z - s.z) < 3.5 || Math.hypot(you.x - roomPoint("dealer", 13, -22.5).x, you.z - roomPoint("dealer", 13, -22.5).z) < 3.5)
    return { key: "E", text: "Browse & buy cars", tone: "money", run: () => openDealer(true) };
  return null;
});
