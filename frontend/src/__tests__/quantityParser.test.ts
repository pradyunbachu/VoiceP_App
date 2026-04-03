import { describe, it, expect } from "vitest";
import { parseQuantityFromItem } from "../lib/quantityParser";

describe("parseQuantityFromItem", () => {
  describe("Pattern 1: leading number", () => {
    it("parses simple quantity + name", () => {
      expect(parseQuantityFromItem("6 chocolates")).toEqual({
        quantity: 6, unit: "", name: "chocolates",
      });
    });

    it("parses decimal quantity", () => {
      expect(parseQuantityFromItem("1.5 gallons milk")).toEqual({
        quantity: 1.5, unit: "gallons", name: "milk",
      });
    });

    it("parses quantity + unit + name", () => {
      expect(parseQuantityFromItem("2 lbs chicken")).toEqual({
        quantity: 2, unit: "lbs", name: "chicken",
      });
    });

    it("parses quantity + unit + 'of' + name", () => {
      expect(parseQuantityFromItem("3 bags of rice")).toEqual({
        quantity: 3, unit: "bags", name: "rice",
      });
    });

    it("parses singular unit", () => {
      expect(parseQuantityFromItem("1 lb ground beef")).toEqual({
        quantity: 1, unit: "lb", name: "ground beef",
      });
    });

    it("parses oz unit", () => {
      expect(parseQuantityFromItem("16 oz pasta")).toEqual({
        quantity: 16, unit: "oz", name: "pasta",
      });
    });
  });

  describe("Pattern 2: trailing x multiplier", () => {
    it("parses 'item x count'", () => {
      expect(parseQuantityFromItem("eggs x12")).toEqual({
        quantity: 12, unit: "", name: "eggs",
      });
    });

    it("parses with spaces around x", () => {
      expect(parseQuantityFromItem("chocolates x 6")).toEqual({
        quantity: 6, unit: "", name: "chocolates",
      });
    });

    it("handles decimal trailing quantity", () => {
      expect(parseQuantityFromItem("butter x1.5")).toEqual({
        quantity: 1.5, unit: "", name: "butter",
      });
    });
  });

  describe("Pattern 3: parenthesized quantity", () => {
    it("parses 'item (count)'", () => {
      expect(parseQuantityFromItem("eggs (12)")).toEqual({
        quantity: 12, unit: "", name: "eggs",
      });
    });

    it("handles decimal in parens", () => {
      expect(parseQuantityFromItem("chicken breast (2.5)")).toEqual({
        quantity: 2.5, unit: "", name: "chicken breast",
      });
    });
  });

  describe("Pattern 4: adjective form", () => {
    it("parses 'Bottled Chipotle Sauce'", () => {
      expect(parseQuantityFromItem("Bottled Chipotle Sauce")).toEqual({
        quantity: 1, unit: "bottle", name: "Chipotle Sauce",
      });
    });

    it("parses 'Canned Tomatoes'", () => {
      expect(parseQuantityFromItem("Canned Tomatoes")).toEqual({
        quantity: 1, unit: "can", name: "Tomatoes",
      });
    });

    it("parses 'Boxed Mac and Cheese'", () => {
      expect(parseQuantityFromItem("Boxed Mac and Cheese")).toEqual({
        quantity: 1, unit: "box", name: "Mac and Cheese",
      });
    });

    it("is case-insensitive", () => {
      expect(parseQuantityFromItem("BAGGED Salad")).toEqual({
        quantity: 1, unit: "bag", name: "Salad",
      });
    });
  });

  describe("Pattern 5: unit prefix without number", () => {
    it("parses 'bottle of chipotle sauce'", () => {
      expect(parseQuantityFromItem("bottle of chipotle sauce")).toEqual({
        quantity: 1, unit: "bottle", name: "chipotle sauce",
      });
    });

    it("parses 'bag of rice'", () => {
      expect(parseQuantityFromItem("bag of rice")).toEqual({
        quantity: 1, unit: "bag", name: "rice",
      });
    });

    it("parses unit without 'of'", () => {
      expect(parseQuantityFromItem("jar salsa")).toEqual({
        quantity: 1, unit: "jar", name: "salsa",
      });
    });
  });

  describe("fallback: no quantity", () => {
    it("defaults to quantity 1 with no unit", () => {
      expect(parseQuantityFromItem("apples")).toEqual({
        quantity: 1, unit: "", name: "apples",
      });
    });

    it("trims whitespace", () => {
      expect(parseQuantityFromItem("  bananas  ")).toEqual({
        quantity: 1, unit: "", name: "bananas",
      });
    });
  });

  describe("edge cases: quantity bounds", () => {
    it("clamps extremely large leading quantities to 99999", () => {
      const result = parseQuantityFromItem("9999999 apples");
      expect(result.quantity).toBe(99999);
      expect(result.name).toBe("apples");
    });

    it("clamps extremely large trailing x quantities", () => {
      const result = parseQuantityFromItem("eggs x9999999");
      expect(result.quantity).toBe(99999);
    });

    it("clamps extremely large parenthesized quantities", () => {
      const result = parseQuantityFromItem("eggs (9999999)");
      expect(result.quantity).toBe(99999);
    });

    it("handles empty string input", () => {
      const result = parseQuantityFromItem("");
      expect(result).toEqual({ quantity: 1, unit: "", name: "" });
    });

    it("handles whitespace-only input", () => {
      const result = parseQuantityFromItem("   ");
      expect(result).toEqual({ quantity: 1, unit: "", name: "" });
    });

    it("handles zero quantity by defaulting to 1", () => {
      const result = parseQuantityFromItem("0 apples");
      expect(result.quantity).toBe(1);
      expect(result.name).toBe("apples");
    });
  });
});
