import { describe, expect, it } from "vitest";
import { productLook, readableOn } from "./product-look";

describe("productLook", () => {
  it("guesses shape, color and falling pieces from the name", () => {
    expect(productLook({ name: "Strawberry Fanta", description: "12 oz can" })).toMatchObject({ shape: "can", particle: "strawberry" });
    expect(productLook({ name: "Bottled Water", description: "16.9 oz bottle" })).toMatchObject({ shape: "bottle", particle: "bubble" });
    expect(productLook({ name: "Chocolate Milk", description: "Low-fat" })).toMatchObject({ shape: "carton", particle: "cocoa" });
    expect(productLook({ name: "Capri Sun", description: "Pacific Cooler pouch" }).shape).toBe("pouch");
  });

  it("always gives something, even for unknown drinks", () => {
    const look = productLook({ name: "Mystery Drink" });
    expect(look.shape).toBe("can");
    expect(look.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("readableOn", () => {
  it("uses dark text on light colors and white on dark ones", () => {
    expect(readableOn("#fff3a3")).toBe("#111111");
    expect(readableOn("#4b1610")).toBe("#ffffff");
  });
});
