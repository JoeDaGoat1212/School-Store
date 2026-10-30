import { nameCar } from "./wallet-names";

/*
 * Every kind of vehicle in the world, and the dealership's catalogue. Plain
 * data. Prices are like their real-world counterparts (2026 US sticker
 * prices); the names are made up. The more it costs, the faster it goes.
 */

export type Body = "sedan" | "suv" | "sports" | "super" | "pickup" | "hatch" | "moto" | "plane" | "heli" | "cart";
export type Category = "Motorcycles" | "Sedans" | "SUVs" | "Sports cars" | "Supercars" | "Trucks";

export type Model = {
  id: string;
  name: string;
  category: Category;
  body: Body;
  price: number;
  /** Top speed, mph. */
  top: number;
  /** 0–60 mph, seconds. */
  zeroToSixty: number;
  /** How well it grips in corners (1 = an ordinary car). */
  grip: number;
  /** One line for the showroom. */
  blurb: string;
  /** Colours it comes in. */
  colors: string[];
};

export const MODELS: Model[] = [
  // ---- Motorcycles ----
  { id: "urbano", name: "Zippo Urbano 150", category: "Motorcycles", body: "moto", price: 4299, top: 62, zeroToSixty: 9.5, grip: 1.1, blurb: "A zippy little scooter for getting round town.", colors: ["#e5483b", "#9fd3c7", "#f2f0ea"] },
  { id: "kestrel", name: "Kestrel 500", category: "Motorcycles", body: "moto", price: 7999, top: 108, zeroToSixty: 4.6, grip: 1.2, blurb: "A friendly all-rounder with plenty of go.", colors: ["#1d4f91", "#2b2f36", "#ff7a2a"] },
  { id: "raiden", name: "Raiden RS6", category: "Motorcycles", body: "moto", price: 13499, top: 158, zeroToSixty: 3.1, grip: 1.35, blurb: "A screaming sport bike. Hold on tight.", colors: ["#13a8a0", "#e5483b", "#1b1d21"] },
  { id: "panthera", name: "Volante Panthera V4", category: "Motorcycles", body: "moto", price: 34500, top: 186, zeroToSixty: 2.6, grip: 1.45, blurb: "A track-bred superbike. Ridiculously fast.", colors: ["#c8102e", "#f2f0ea", "#2b2f36"] },

  // ---- Sedans ----
  { id: "civetta", name: "Corvo Civetta LX", category: "Sedans", body: "sedan", price: 24500, top: 118, zeroToSixty: 7.8, grip: 1, blurb: "Sensible, reliable, cheap to run.", colors: ["#9aa3ad", "#f2f2f2", "#1d4f91", "#b8323a"] },
  { id: "accordo", name: "Meridian Accordo Sport", category: "Sedans", body: "sedan", price: 31900, top: 128, zeroToSixty: 6.4, grip: 1.05, blurb: "A roomy family car with a sporty edge.", colors: ["#2b2f36", "#f2f2f2", "#7b1e1e", "#3d6fe0"] },
  { id: "valtera", name: "Valtera ES 350", category: "Sedans", body: "sedan", price: 47000, top: 131, zeroToSixty: 6.1, grip: 1.05, blurb: "Quiet, plush luxury.", colors: ["#e9e4da", "#1b1d21", "#5a6470"] },
  { id: "brennan", name: "Brennan B5 Competizione", category: "Sedans", body: "sedan", price: 118000, top: 190, zeroToSixty: 3.1, grip: 1.3, blurb: "A family car that eats supercars for breakfast.", colors: ["#1f5f8b", "#2b2f36", "#e5e5e5"] },
  { id: "montague", name: "Montague S580", category: "Sedans", body: "sedan", price: 128000, top: 155, zeroToSixty: 4.4, grip: 1.15, blurb: "The flagship limousine. Arrive like a boss.", colors: ["#111317", "#c9ced4", "#2a3442"] },

  // ---- SUVs ----
  { id: "rover", name: "Trailmark Rover", category: "SUVs", body: "suv", price: 30500, top: 116, zeroToSixty: 8.2, grip: 0.95, blurb: "A small SUV for every adventure.", colors: ["#5aa84a", "#f2f2f2", "#2b2f36", "#c9b48a"] },
  { id: "pathway", name: "Ridgeline Pathway XLT", category: "SUVs", body: "suv", price: 42000, top: 121, zeroToSixty: 7, grip: 0.95, blurb: "Three rows, room for all your friends.", colors: ["#1d4f91", "#9aa3ad", "#7b1e1e"] },
  { id: "titan", name: "Highlander Titan Z71", category: "SUVs", body: "suv", price: 68000, top: 112, zeroToSixty: 6.8, grip: 0.9, blurb: "A huge full-size SUV. Big and proud.", colors: ["#111317", "#f2f2f2", "#3a4150"] },
  { id: "g63", name: "Atlas G63 Expedition", category: "SUVs", body: "suv", price: 185000, top: 149, zeroToSixty: 4.4, grip: 1, blurb: "A boxy luxury off-roader with a mighty V8.", colors: ["#2b2f36", "#6b7a4f", "#f2f2f2"] },
  { id: "urano", name: "Taurino Urano S", category: "SUVs", body: "suv", price: 233000, top: 190, zeroToSixty: 3.4, grip: 1.25, blurb: "A super SUV: supercar speed, room for the family.", colors: ["#ffcc00", "#2b2f36", "#2fa84f"] },

  // ---- Trucks ----
  { id: "ranger", name: "Ranger Workhorse Lariat", category: "Trucks", body: "pickup", price: 64000, top: 112, zeroToSixty: 6, grip: 0.9, blurb: "A tough pickup with a big bed.", colors: ["#7b1e1e", "#1d4f91", "#f2f2f2", "#2b2f36"] },

  // ---- Sports cars ----
  { id: "stallion", name: "Stallion GT", category: "Sports cars", body: "sports", price: 45000, top: 155, zeroToSixty: 4.3, grip: 1.15, blurb: "An American muscle car. Loud and proud.", colors: ["#c8102e", "#1d4f91", "#ffcc00", "#111317"] },
  { id: "kaiser", name: "Kaiser 9X Carrera", category: "Sports cars", body: "sports", price: 120000, top: 182, zeroToSixty: 3.5, grip: 1.4, blurb: "A legendary rear-engine sports car.", colors: ["#c9ced4", "#e5483b", "#13a8a0", "#111317"] },

  // ---- Supercars ----
  { id: "huracano", name: "Vanta Huracano EVO", category: "Supercars", body: "super", price: 260000, top: 202, zeroToSixty: 2.9, grip: 1.55, blurb: "A wild V10 supercar. Turns every head.", colors: ["#7cd31b", "#ff7a1a", "#e5e5e5", "#111317"] },
  { id: "stradale", name: "Ferro Stradale SF", category: "Supercars", body: "super", price: 525000, top: 211, zeroToSixty: 2.4, grip: 1.65, blurb: "A hybrid hypercar with 986 horsepower.", colors: ["#c8102e", "#ffcc00", "#2b2f36"] },
  { id: "revuelto", name: "Vanta Revuelto", category: "Supercars", body: "super", price: 608000, top: 217, zeroToSixty: 2.5, grip: 1.6, blurb: "A V12 plug-in hybrid with 1,001 horsepower and scissor doors.", colors: ["#ff7a1a", "#111317", "#e5e5e5"] },
  { id: "chirone", name: "Bellucci Chirone", category: "Supercars", body: "super", price: 3000000, top: 261, zeroToSixty: 2.3, grip: 1.75, blurb: "Sixteen cylinders. The fastest thing on four wheels.", colors: ["#1f3a8a", "#111317", "#c9ced4"] },
];

/** The everyday cars already in town, and the aircraft at the airport (not for sale). */
export const STOCK: Model[] = [
  { id: "town-sedan", name: "Sedan", category: "Sedans", body: "sedan", price: 0, top: 100, zeroToSixty: 8, grip: 1, blurb: "", colors: [] },
  { id: "town-hatch", name: "Hatchback", category: "Sedans", body: "hatch", price: 0, top: 100, zeroToSixty: 8.5, grip: 1, blurb: "", colors: [] },
  { id: "town-suv", name: "SUV", category: "SUVs", body: "suv", price: 0, top: 100, zeroToSixty: 8.5, grip: 0.95, blurb: "", colors: [] },
  { id: "town-pickup", name: "Pickup", category: "Trucks", body: "pickup", price: 0, top: 100, zeroToSixty: 8, grip: 0.9, blurb: "", colors: [] },
  { id: "plane", name: "Skyhawk light plane", category: "Trucks", body: "plane", price: 0, top: 160, zeroToSixty: 6, grip: 1, blurb: "", colors: [] },
  { id: "heli", name: "Hornet helicopter", category: "Trucks", body: "heli", price: 0, top: 140, zeroToSixty: 6, grip: 1, blurb: "", colors: [] },
  { id: "golf-cart", name: "Golf cart", category: "Trucks", body: "cart", price: 0, top: 42, zeroToSixty: 6.5, grip: 1.05, blurb: "", colors: [] },
];

const ALL = new Map([...MODELS, ...STOCK].map((m) => [m.id, m]));
export const modelOf = (id: string) => ALL.get(id) ?? STOCK[0];
for (const m of MODELS) nameCar(m.id, m.name);

/** Driving numbers for car-physics.ts: top speed (units/s), engine pull, grip. */
export function specOf(id: string) {
  const m = modelOf(id);
  const top = m.top / 2.2;
  // Pull hard enough to hit 60 mph (27 units/s) in about the 0–60 time.
  const engine = (27.3 / m.zeroToSixty) * 1.25;
  return { top, engine, grip: 15 * m.grip, moto: m.body === "moto" };
}

export const CATEGORIES: Category[] = ["Motorcycles", "Sedans", "SUVs", "Trucks", "Sports cars", "Supercars"];
