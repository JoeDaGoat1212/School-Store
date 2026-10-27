import { describe, expect, it } from "vitest";
import { modelFor, sectionFor, unitFor } from "./catalog";
import { unitLayout, type StoreItem } from "./layout";

const item = (name: string, category: string, soldOut = false): StoreItem => {
  const unit = unitFor(category)!;
  return { id: name, name, label: "$2.00", soldOut, unit, section: sectionFor(unit, name, category), model: modelFor(name, unit), color: "#ff5a1f" };
};

describe("3D store sections", () => {
  it("puts products in the right unit and section", () => {
    expect(unitFor("Drinks")).toBe("drinks");
    expect(unitFor("candy")).toBe("candy");
    expect(unitFor("Hot food")).toBe("snacks");
    expect(unitFor("Supplies")).toBeNull();
    expect(sectionFor("drinks", "Mountain Dew Code Red", "Drinks")).toBe("soda");
    expect(sectionFor("drinks", "Powerade Blue", "Drinks")).toBe("sports");
    expect(sectionFor("drinks", "White Monster", "Drinks")).toBe("more");
    expect(sectionFor("snacks", "Chips", "Snacks")).toBe("chips");
    expect(sectionFor("snacks", "Ramen Cup (beef)", "Hot food")).toBe("hot");
    expect(sectionFor("snacks", "Honey buns", "Snacks")).toBe("sweets");
    expect(sectionFor("candy", "Twix", "candy")).toBe("chocolate");
    expect(sectionFor("candy", "Sour skittles", "candy")).toBe("sour");
  });

  it("uses the photo models, and a plain box for anything new", () => {
    expect(modelFor("Coke", "drinks").type).toBe("lathe");
    expect(modelFor("Ramen Cup (Chicken)", "snacks").type).toBe("lathe");
    expect(modelFor("Snickers", "candy").type).toBe("pack");
    expect(modelFor("Brand New Gum", "candy").type).toBe("box");
  });
});

describe("unitLayout", () => {
  const items = [
    item("Coke", "Drinks"),
    item("Sprite", "Drinks"),
    item("Fanta Orange", "Drinks"),
    item("Powerade Blue", "Drinks"),
    item("White Monster", "Drinks", true),
    item("Twix", "candy"),
  ];

  it("gives each section its own bay and fills every shelf", () => {
    const fridge = unitLayout("drinks", items)!;
    expect(fridge.bays.map((b) => b.key)).toEqual(["soda", "sports", "more"]);
    expect(fridge.shelves.length).toBeGreaterThanOrEqual(5);
    // Every product shows up, and only drinks are in the fridge.
    const ids = new Set(fridge.placements.map((p) => p.id));
    expect([...ids].sort()).toEqual(["Coke", "Fanta Orange", "Powerade Blue", "Sprite", "White Monster"]);
    // Every shelf of every bay has a price tag for each spot.
    expect(fridge.tags.length).toBe(fridge.bays.length * fridge.shelves.length * 2);
  });

  it("shows a sold-out product one row deep", () => {
    const fridge = unitLayout("drinks", items)!;
    const monster = fridge.placements.filter((p) => p.id === "White Monster");
    const depths = new Set(monster.map((p) => p.z.toFixed(3)));
    expect(depths.size).toBe(1);
  });

  it("has no unit when there's nothing to put in it", () => {
    expect(unitLayout("snacks", items)).toBeNull();
  });
});
