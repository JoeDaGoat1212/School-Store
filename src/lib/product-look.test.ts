import { describe, expect, it } from "vitest";
import { drinkBrand, productLook, readableOn } from "./product-look";

describe("productLook", () => {
  it("guesses shape, color and falling pieces from the name", () => {
    expect(productLook({ name: "Strawberry Fanta", description: "12 oz can" })).toMatchObject({ shape: "can", particle: "strawberry" });
    expect(productLook({ name: "Bottled Water", description: "16.9 oz bottle" })).toMatchObject({ shape: "bottle", particle: "bubble" });
    expect(productLook({ name: "Chocolate Milk", description: "Low-fat" })).toMatchObject({ shape: "carton", particle: "cocoa" });
    expect(productLook({ name: "Capri Sun", description: "Pacific Cooler pouch" }).shape).toBe("pouch");
  });

  it("picks the photo backdrop for the flavor", () => {
    expect(productLook({ name: "Strawberry Fanta" }).scene).toBe("strawberry");
    expect(productLook({ name: "Mango Tango" }).scene).toBe("tropical");
    expect(productLook({ name: "Jarritos Mandarin" }).scene).toBe("orange");
    expect(productLook({ name: "Flamin' Hot Cheetos" }).scene).toBeUndefined();
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


describe("drinkBrand", () => {
  it("puts flavors of the same drink on one shelf", () => {
    expect(drinkBrand("Strawberry Fanta")).toBe("Fanta");
    expect(drinkBrand("Fanta Orange 12 oz")).toBe("Fanta");
    expect(drinkBrand("Gatorade Cool Blue")).toBe("Gatorade");
    expect(drinkBrand("Bottled Water")).toBe("Water");
    expect(drinkBrand("Chocolate Milk")).toBe("Milk");
    expect(drinkBrand("Jarritos Mandarin")).toBe("Jarritos Mandarin");
    expect(drinkBrand("Tropical Jarritos")).toBe("Jarritos");
  });
});

describe("the store's real drinks", () => {
  it("land on the right shelf", () => {
    expect(drinkBrand("Diet Coke")).toBe("Coca-Cola");
    expect(drinkBrand("Dr. Pepper")).toBe("Dr Pepper");
    expect(drinkBrand("Mountain Dew (Baja Blast)")).toBe("Mountain Dew");
    expect(drinkBrand("Powerade pink")).toBe("Powerade");
    expect(drinkBrand("Starbucks Coffee Vanilla")).toBe("Starbucks");
    expect(drinkBrand("White Monster")).toBe("Monster");
    expect(drinkBrand("Yoohoo")).toBe("Yoo-hoo");
  });

  it("get a matching flavor backdrop", () => {
    expect(productLook({ name: "Mountain Dew Code Red" }).scene).toBe("cherry");
    expect(productLook({ name: "Mountain Dew Voltage" }).scene).toBe("blue");
    expect(productLook({ name: "Mountain Dew Tropical Citrus" }).scene).toBe("tropical");
    expect(productLook({ name: "Powerade Purple" }).scene).toBe("grape");
    expect(productLook({ name: "Powerade Red" }).scene).toBe("cherry");
    expect(productLook({ name: "Fanta pineapple" }).scene).toBe("tropical");
    expect(productLook({ name: "Yoohoo" }).scene).toBe("chocolate");
    expect(productLook({ name: "Dr. Pepper" }).scene).toBe("cola");
  });
});
