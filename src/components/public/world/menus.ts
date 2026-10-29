import type { ShopKey } from "./world-map";

/*
 * What each shop on Restaurant Row sells, how a customer's order is made up,
 * and how well what you made matches it. Plain data and maths (no 3D code,
 * no React), so it can be tested.
 *
 * Every order is a set of choices, one per "step" of the shop's recipe:
 *   - "one": pick exactly one option (pizza size, cone or cup, wrapping…)
 *   - "many": pick any number (toppings, extras)
 *   - "list": an ordered list (the scoops on a cone, the patties on a burger)
 *   - "count": how many of each (the flowers in a bouquet)
 * plus the hands-on bits the builder checks itself (baking, grilling,
 * pulling a shot, scooping), each scored 0…1.
 */

export type Option = { id: string; label: string; color: string; price?: number };
export type Step =
  | { id: string; kind: "one"; label: string; options: Option[] }
  | { id: string; kind: "many"; label: string; options: Option[]; max: number }
  | { id: string; kind: "list"; label: string; options: Option[]; min: number; max: number }
  | { id: string; kind: "count"; label: string; options: Option[]; maxEach: number; maxTypes: number };

export type Build = Record<string, string | string[] | Record<string, number>>;

export type Menu = {
  shop: ShopKey;
  /** What it's called on the till, e.g. "pizza". */
  thing: string;
  steps: Step[];
  /** The base price, before extras. */
  base: number;
  /** How much eating one fills you up (0 = not food). */
  food: number;
  /** What you can buy to eat when you're not working (name, price). */
  snack?: { name: string; price: number };
  /** Hands-on bits ("bake", "grill", "shot", "scoop", "trim"): how much they count for in the score. */
  skill: { id: string; label: string; weight: number };
};

const o = (id: string, label: string, color: string, price?: number): Option => ({ id, label, color, price });

export const MENUS: Record<ShopKey, Menu> = {
  pizza: {
    shop: "pizza",
    thing: "pizza",
    base: 9,
    food: 45,
    snack: { name: "a hot slice", price: 4.5 },
    skill: { id: "bake", label: "Baked just right", weight: 0.3 },
    steps: [
      { id: "size", kind: "one", label: "Size", options: [o("s", 'Small 10"', "#f3d9a4", 0), o("m", 'Medium 12"', "#f3d9a4", 3), o("l", 'Large 16"', "#f3d9a4", 6)] },
      { id: "sauce", kind: "one", label: "Sauce", options: [o("tomato", "Tomato", "#c8321e"), o("white", "Garlic white", "#f4ecd8"), o("bbq", "BBQ", "#6b2a12"), o("pesto", "Pesto", "#4f8a2b")] },
      { id: "cheese", kind: "one", label: "Cheese", options: [o("mozz", "Mozzarella", "#fbe8a6"), o("extra", "Extra cheese", "#ffe07a", 1.5), o("vegan", "Vegan cheese", "#f2e6c0", 1)] },
      {
        id: "toppings",
        kind: "many",
        label: "Toppings",
        max: 4,
        options: [
          o("pepperoni", "Pepperoni", "#b3261e", 1.25),
          o("mushroom", "Mushrooms", "#c8b59a", 1),
          o("pepper", "Green peppers", "#3f9b3a", 1),
          o("olive", "Black olives", "#24221f", 1),
          o("onion", "Red onion", "#b0558f", 1),
          o("pineapple", "Pineapple", "#ffd447", 1),
          o("sausage", "Sausage", "#7a4a2e", 1.25),
          o("basil", "Fresh basil", "#2f7d32", 0.75),
        ],
      },
    ],
  },
  icecream: {
    shop: "icecream",
    thing: "ice cream",
    base: 4,
    food: 20,
    snack: { name: "a scoop of vanilla", price: 3.5 },
    skill: { id: "scoop", label: "Nice round scoops", weight: 0.25 },
    steps: [
      { id: "holder", kind: "one", label: "Cone or cup", options: [o("cone", "Sugar cone", "#d9a25b"), o("waffle", "Waffle cone", "#c4823c", 1), o("cup", "Cup", "#ff8fb1")] },
      {
        id: "scoops",
        kind: "list",
        label: "Scoops (bottom to top)",
        min: 1,
        max: 3,
        options: [
          o("vanilla", "Vanilla", "#fbf1d0", 1.5),
          o("chocolate", "Chocolate", "#6b3e26", 1.5),
          o("strawberry", "Strawberry", "#f7a1b5", 1.5),
          o("mint", "Mint chip", "#a8e6c9", 1.5),
          o("cookie", "Cookie dough", "#e8d2a8", 1.75),
          o("mango", "Mango", "#ffb63b", 1.75),
          o("blueberry", "Blue moon", "#6aa8ff", 1.75),
        ],
      },
      {
        id: "extras",
        kind: "many",
        label: "Toppings",
        max: 3,
        options: [o("sprinkles", "Rainbow sprinkles", "#ff5fa2", 0.5), o("fudge", "Hot fudge", "#3b1f12", 0.75), o("whip", "Whipped cream", "#ffffff", 0.5), o("cherry", "Cherry on top", "#d1102b", 0.25), o("nuts", "Crushed nuts", "#b98a52", 0.5)],
      },
    ],
  },
  coffee: {
    shop: "coffee",
    thing: "drink",
    base: 3,
    food: 12,
    snack: { name: "a coffee", price: 3.25 },
    skill: { id: "shot", label: "Espresso pulled right", weight: 0.3 },
    steps: [
      { id: "drink", kind: "one", label: "Drink", options: [o("latte", "Latte", "#d9b48a", 1.5), o("cappuccino", "Cappuccino", "#c79a6b", 1.5), o("mocha", "Mocha", "#7b4a2e", 2), o("americano", "Americano", "#3b2417", 0.5), o("macchiato", "Caramel macchiato", "#c98b3f", 2.25)] },
      { id: "size", kind: "one", label: "Size", options: [o("s", "Small", "#ffffff", 0), o("m", "Medium", "#ffffff", 0.75), o("l", "Large", "#ffffff", 1.25)] },
      { id: "milk", kind: "one", label: "Milk", options: [o("whole", "Whole milk", "#fffdf5"), o("oat", "Oat milk", "#efe2c4", 0.6), o("almond", "Almond milk", "#f3e7d3", 0.6), o("none", "No milk", "#3b2417")] },
      { id: "syrup", kind: "one", label: "Syrup", options: [o("none", "No syrup", "#dddddd"), o("vanilla", "Vanilla", "#f7e7b4", 0.5), o("caramel", "Caramel", "#c98b3f", 0.5), o("hazelnut", "Hazelnut", "#9b6a3c", 0.5)] },
      { id: "top", kind: "one", label: "On top", options: [o("none", "Nothing", "#dddddd"), o("whip", "Whipped cream", "#ffffff", 0.5), o("cinnamon", "Cinnamon", "#a0522d"), o("cocoa", "Cocoa dust", "#5a3420")] },
    ],
  },
  burger: {
    shop: "burger",
    thing: "burger",
    base: 7,
    food: 60,
    snack: { name: "a cheeseburger", price: 6.75 },
    skill: { id: "grill", label: "Patties cooked through", weight: 0.3 },
    steps: [
      { id: "bun", kind: "one", label: "Bun", options: [o("sesame", "Sesame bun", "#e0a458"), o("brioche", "Brioche", "#d8893a", 0.5), o("lettuce", "Lettuce wrap", "#6cbf4a")] },
      { id: "patties", kind: "list", label: "Patties", min: 1, max: 3, options: [o("beef", "Beef smash patty", "#6b3a22", 2.5), o("chicken", "Crispy chicken", "#d99a4a", 2.5), o("veggie", "Veggie patty", "#7d8f3c", 2.5)] },
      {
        id: "stack",
        kind: "many",
        label: "Toppings",
        max: 5,
        options: [o("cheese", "American cheese", "#ffbf1f", 0.75), o("lettuce", "Lettuce", "#7ccf4a"), o("tomato", "Tomato", "#e5402b"), o("onion", "Onion", "#e8d6ef"), o("pickles", "Pickles", "#6f8f2a"), o("bacon", "Bacon", "#b0472e", 1.5), o("jalapeno", "Jalapeños", "#2f8f3a", 0.5)],
      },
      { id: "sauce", kind: "one", label: "Sauce", options: [o("ketchup", "Ketchup", "#d1261e"), o("mustard", "Mustard", "#f2c400"), o("mayo", "Mayo", "#fbf3d6"), o("special", "Smash sauce", "#f08a4b", 0.5), o("none", "No sauce", "#dddddd")] },
    ],
  },
  flowers: {
    shop: "flowers",
    thing: "bouquet",
    base: 12,
    food: 0,
    skill: { id: "trim", label: "Stems trimmed neatly", weight: 0.2 },
    steps: [
      {
        id: "flowers",
        kind: "count",
        label: "Flowers",
        maxEach: 12,
        maxTypes: 3,
        options: [
          o("rose", "Red roses", "#d1102b", 3.5),
          o("pinkrose", "Pink roses", "#ff86a8", 3.5),
          o("tulip", "Tulips", "#ff9a3c", 2.5),
          o("sunflower", "Sunflowers", "#ffcf1f", 3),
          o("lily", "White lilies", "#fbf6ee", 4),
          o("daisy", "Daisies", "#ffffff", 1.5),
          o("lavender", "Lavender", "#9b7bd8", 2),
        ],
      },
      { id: "wrap", kind: "one", label: "Wrapping", options: [o("kraft", "Brown paper", "#c49a6c"), o("pink", "Pink tissue", "#ffc4d6", 2), o("vase", "Glass vase", "#cfe9f5", 15), o("basket", "Wicker basket", "#a87a45", 12)] },
      { id: "ribbon", kind: "one", label: "Ribbon", options: [o("none", "No ribbon", "#dddddd"), o("red", "Red satin", "#c8102e", 1), o("gold", "Gold", "#d4a017", 1), o("white", "White lace", "#ffffff", 1.5)] },
      { id: "card", kind: "one", label: "Card", options: [o("none", "No card", "#dddddd"), o("birthday", "Happy Birthday!", "#ffd447", 2), o("love", "I love you", "#ff5f7e", 2), o("sorry", "I'm sorry", "#8fb8ff", 2), o("congrats", "Congratulations!", "#7ee0a0", 2)] },
    ],
  },
};

// ---- Random orders ----------------------------------------------------------------------------

/** A random generator from a seed (so tests are repeatable). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pickN = <T,>(list: T[], n: number, r: () => number) => {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(r() * copy.length), 1)[0]);
  return out;
};

/** What a customer wants. */
export function randomOrder(shop: ShopKey, r: () => number = Math.random): Build {
  const m = MENUS[shop];
  const b: Build = {};
  for (const s of m.steps) {
    if (s.kind === "one") b[s.id] = s.options[Math.floor(r() * s.options.length)].id;
    else if (s.kind === "many") b[s.id] = pickN(s.options, Math.floor(r() * (s.max + 1)), r).map((x) => x.id);
    else if (s.kind === "list") b[s.id] = Array.from({ length: s.min + Math.floor(r() * (s.max - s.min + 1)) }, () => s.options[Math.floor(r() * s.options.length)].id);
    else {
      const types = pickN(s.options, 1 + Math.floor(r() * s.maxTypes), r);
      b[s.id] = Object.fromEntries(types.map((t) => [t.id, [3, 6, 6, 12, 1, 2, 4][Math.floor(r() * 7)]]));
    }
  }
  return b;
}

/** An empty build to start from (the first option for "one" steps, nothing else). */
export function emptyBuild(shop: ShopKey): Build {
  const b: Build = {};
  for (const s of MENUS[shop].steps) b[s.id] = s.kind === "one" ? "" : s.kind === "count" ? {} : [];
  return b;
}

const optionOf = (s: Step, id: string) => s.options.find((x) => x.id === id);

/** How much it costs. */
export function priceOf(shop: ShopKey, b: Build) {
  const m = MENUS[shop];
  let p = m.base;
  for (const s of m.steps) {
    const v = b[s.id];
    if (typeof v === "string") p += optionOf(s, v)?.price ?? 0;
    else if (Array.isArray(v)) for (const id of v) p += optionOf(s, id)?.price ?? 0;
    else if (v) for (const [id, n] of Object.entries(v)) p += (optionOf(s, id)?.price ?? 0) * n;
  }
  return Math.round(p * 100) / 100;
}

/** "Large pizza · Tomato · Mozzarella · Pepperoni, Basil": one line per step, for the ticket. */
export function describe(shop: ShopKey, b: Build) {
  return MENUS[shop].steps.map((s) => {
    const v = b[s.id];
    let text: string;
    if (typeof v === "string") text = optionOf(s, v)?.label ?? "—";
    else if (Array.isArray(v)) text = v.length ? v.map((id) => optionOf(s, id)?.label ?? id).join(s.kind === "list" ? " → " : ", ") : "None";
    else
      text =
        Object.entries(v ?? {})
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `${n} ${optionOf(s, id)?.label ?? id}`)
          .join(", ") || "None";
    return { label: s.label, text };
  });
}

/** A short name for the order: "Large pizza", "Waffle cone, 2 scoops", "Mocha", "Double burger", "Bouquet of 9". */
export function shortName(shop: ShopKey, b: Build) {
  const one = (id: string) => (typeof b[id] === "string" ? (b[id] as string) : "");
  const list = (id: string) => (Array.isArray(b[id]) ? (b[id] as string[]) : []);
  switch (shop) {
    case "pizza":
      return `${{ s: "Small", m: "Medium", l: "Large" }[one("size")] ?? ""} ${list("toppings")[0] ?? "cheese"} pizza`.trim();
    case "icecream":
      return `${list("scoops").length}-scoop ${one("holder") === "cup" ? "cup" : "cone"}`;
    case "coffee":
      return `${{ s: "Small", m: "Medium", l: "Large" }[one("size")] ?? ""} ${optionOf(MENUS.coffee.steps[0], one("drink"))?.label.toLowerCase() ?? "coffee"}`.trim();
    case "burger":
      return ["Single", "Double", "Triple"][list("patties").length - 1] + " burger";
    case "flowers": {
      const n = Object.values((b.flowers as Record<string, number>) ?? {}).reduce((a, c) => a + c, 0);
      return `Bouquet of ${n}`;
    }
  }
}

/**
 * How close what you made is to the order: 0…1. Each step counts the same,
 * and the hands-on part (`skill`, 0…1) counts for the menu's skill weight.
 */
export function score(shop: ShopKey, want: Build, made: Build, skill: number) {
  const m = MENUS[shop];
  let total = 0;
  for (const s of m.steps) {
    const w = want[s.id];
    const g = made[s.id];
    let k = 0;
    if (typeof w === "string") k = w === g ? 1 : 0;
    else if (Array.isArray(w)) {
      const got = Array.isArray(g) ? g : [];
      if (s.kind === "list") {
        // The right things in the right order.
        const n = Math.max(w.length, got.length);
        let same = 0;
        for (let i = 0; i < n; i++) if (w[i] && w[i] === got[i]) same++;
        k = n ? same / n : 1;
      } else {
        const a = new Set(w);
        const b = new Set(got);
        const union = new Set([...a, ...b]);
        let both = 0;
        for (const x of a) if (b.has(x)) both++;
        k = union.size ? both / union.size : 1;
      }
    } else {
      const got = g && typeof g === "object" && !Array.isArray(g) ? g : {};
      const ids = new Set([...Object.keys(w), ...Object.keys(got)]);
      let off = 0;
      let all = 0;
      for (const id of ids) {
        off += Math.abs((w[id] ?? 0) - (got[id] ?? 0));
        all += Math.max(w[id] ?? 0, got[id] ?? 0);
      }
      k = all ? Math.max(0, 1 - off / all) : 1;
    }
    total += k;
  }
  const match = total / m.steps.length;
  const sw = m.skill.weight;
  return Math.max(0, Math.min(1, match * (1 - sw) + Math.max(0, Math.min(1, skill)) * sw));
}

/** What a customer says about it. */
export function verdict(q: number) {
  if (q >= 0.95) return { stars: 5, line: "Perfect! Exactly what I wanted." };
  if (q >= 0.8) return { stars: 4, line: "Really good, thanks!" };
  if (q >= 0.6) return { stars: 3, line: "Hmm, not quite what I ordered…" };
  if (q >= 0.35) return { stars: 2, line: "This is wrong. I'll take it, I guess." };
  return { stars: 1, line: "This isn't what I ordered at all!" };
}

/** Names for customers. */
export const NAMES = [
  "Maya", "Leo", "Ava", "Noah", "Zoe", "Eli", "Ruby", "Omar", "Ivy", "Kai", "Nora", "Sam", "Priya", "Diego", "Lena", "Max",
  "Aisha", "Ben", "Chloe", "Dev", "Emma", "Finn", "Gia", "Hugo", "Isla", "Jay", "Kira", "Luca", "Mila", "Nico", "Olive", "Theo",
];
