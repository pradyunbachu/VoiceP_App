import { describe, it, expect } from "vitest";
import { detectCategory, isPantryItem } from "../lib/categoryDetection";

describe("detectCategory", () => {
  it("detects dairy items", () => {
    expect(detectCategory("milk")).toBe("Dairy");
    expect(detectCategory("cheddar cheese")).toBe("Dairy");
    expect(detectCategory("yogurt")).toBe("Dairy");
    expect(detectCategory("eggs")).toBe("Dairy");
  });

  it("detects produce items", () => {
    expect(detectCategory("apples")).toBe("Produce");
    expect(detectCategory("banana")).toBe("Produce");
    expect(detectCategory("spinach")).toBe("Produce");
    expect(detectCategory("broccoli")).toBe("Produce");
  });

  it("detects meat & seafood", () => {
    expect(detectCategory("chicken breast")).toBe("Meat & Seafood");
    expect(detectCategory("ground beef")).toBe("Meat & Seafood");
    expect(detectCategory("salmon")).toBe("Meat & Seafood");
    expect(detectCategory("shrimp")).toBe("Meat & Seafood");
  });

  it("detects bakery items", () => {
    expect(detectCategory("sourdough bread")).toBe("Bakery");
    expect(detectCategory("bagel")).toBe("Bakery");
    expect(detectCategory("tortilla")).toBe("Bakery");
  });

  it("detects snacks", () => {
    expect(detectCategory("potato chips")).toBe("Snacks");
    expect(detectCategory("trail mix")).toBe("Snacks");
    expect(detectCategory("almonds")).toBe("Snacks");
  });

  it("detects beverages", () => {
    expect(detectCategory("orange juice")).toBe("Beverages");
    expect(detectCategory("coffee")).toBe("Beverages");
    expect(detectCategory("sparkling water")).toBe("Beverages");
  });

  it("detects condiments", () => {
    expect(detectCategory("ketchup")).toBe("Condiments");
    expect(detectCategory("soy sauce")).toBe("Condiments");
    expect(detectCategory("olive oil")).toBe("Condiments");
  });

  it("detects grains & pasta", () => {
    expect(detectCategory("spaghetti")).toBe("Grains & Pasta");
    expect(detectCategory("brown rice")).toBe("Grains & Pasta");
    expect(detectCategory("oatmeal")).toBe("Grains & Pasta");
  });

  it("returns Other for unrecognized items", () => {
    expect(detectCategory("random gadget")).toBe("Other");
  });

  it("handles compound overrides", () => {
    expect(detectCategory("peanut butter")).toBe("Condiments");
    expect(detectCategory("ice cream")).toBe("Frozen");
    expect(detectCategory("cream cheese")).toBe("Dairy");
    expect(detectCategory("sour cream")).toBe("Dairy");
  });

  it("prioritizes tail words for multi-word items", () => {
    expect(detectCategory("Garlic & Cheese Breadsticks")).toBe("Bakery");
  });
});

describe("isPantryItem", () => {
  it("returns true for food items", () => {
    expect(isPantryItem("chicken")).toBe(true);
    expect(isPantryItem("apples")).toBe(true);
    expect(isPantryItem("rice")).toBe(true);
  });

  it("returns false for cleaning supplies", () => {
    expect(isPantryItem("dish soap")).toBe(false);
    expect(isPantryItem("bleach")).toBe(false);
    expect(isPantryItem("paper towels")).toBe(false);
  });

  it("returns false for personal care items", () => {
    expect(isPantryItem("shampoo")).toBe(false);
    expect(isPantryItem("toothpaste")).toBe(false);
    expect(isPantryItem("deodorant")).toBe(false);
  });

  it("returns false for pet supplies", () => {
    expect(isPantryItem("dog food")).toBe(false);
    expect(isPantryItem("cat litter")).toBe(false);
  });

  it("handles pluralized non-pantry items", () => {
    expect(isPantryItem("batteries")).toBe(false);
    expect(isPantryItem("candles")).toBe(false);
    expect(isPantryItem("diapers")).toBe(false);
  });

  it("returns false for household items", () => {
    expect(isPantryItem("trash bags")).toBe(false);
    expect(isPantryItem("toilet paper")).toBe(false);
    expect(isPantryItem("light bulbs")).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(isPantryItem("BLEACH")).toBe(false);
    expect(isPantryItem("Shampoo")).toBe(false);
    expect(isPantryItem("DOG FOOD")).toBe(false);
  });
});

describe("detectCategory edge cases", () => {
  it("handles leading/trailing whitespace", () => {
    expect(detectCategory("  milk  ")).toBe("Dairy");
  });

  it("handles uppercase input", () => {
    expect(detectCategory("MILK")).toBe("Dairy");
    expect(detectCategory("CHICKEN")).toBe("Meat & Seafood");
  });

  it("detects frozen items", () => {
    expect(detectCategory("frozen pizza")).toBe("Frozen");
    expect(detectCategory("frozen waffles")).toBe("Frozen");
  });

  it("detects canned goods", () => {
    expect(detectCategory("soup")).toBe("Canned Goods");
    expect(detectCategory("chicken broth")).toBe("Canned Goods");
    expect(detectCategory("chicken stock")).toBe("Canned Goods");
  });

  it("handles almond butter as Condiments", () => {
    expect(detectCategory("almond butter")).toBe("Condiments");
  });

  it("handles string cheese as Dairy", () => {
    expect(detectCategory("string cheese")).toBe("Dairy");
  });

  it("handles cottage cheese as Dairy", () => {
    expect(detectCategory("cottage cheese")).toBe("Dairy");
  });

  it("detects plural produce items via singularization", () => {
    expect(detectCategory("cherries")).toBe("Produce");
    expect(detectCategory("potatoes")).toBe("Produce");
    expect(detectCategory("strawberries")).toBe("Produce");
  });
});
