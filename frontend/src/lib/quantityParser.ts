export interface ParsedQuantity {
  quantity: number;
  unit: string;
  name: string;
}

// Unit words that can appear as prefixes (with or without a leading number).
const UNIT_WORDS =
  "lbs?|oz|kg|g|gallons?|gal|liters?|bags?|boxes?|cans?|bottles?|packs?|" +
  "cartons?|jars?|pieces?|pcs?|dozen|bunch(?:es)?|loaf|loaves|slices?|" +
  "cups?|pints?|quarts?|tubs?|rolls?|sticks?|bars?|containers?";

// Adjective forms the LLM sometimes uses: "Bottled X", "Canned X", "Boxed X"
const ADJECTIVE_UNIT_RE =
  /^(bottled|canned|boxed|bagged|jarred|sliced|packed)\s+(.+)$/i;
const ADJECTIVE_TO_UNIT: Record<string, string> = {
  bottled: "bottle", canned: "can", boxed: "box", bagged: "bag",
  jarred: "jar", sliced: "slice", packed: "pack",
};

const MAX_QUANTITY = 99999;

// Clamp parsed quantity to a reasonable range
const clampQty = (qty: number): number =>
  Number.isFinite(qty) && qty > 0 ? Math.min(qty, MAX_QUANTITY) : 1;

// Extract quantity, unit, and name from a single item string.
// Supports patterns like "6 chocolates", "2 lbs chicken", "eggs x12",
// "eggs (12)", "bottle of chipotle sauce", "Bottled Chipotle Sauce".
export const parseQuantityFromItem = (itemStr: string): ParsedQuantity => {
  const trimmed = itemStr.trim();
  if (!trimmed) return { quantity: 1, unit: "", name: "" };

  // Pattern 1: leading number -- "6 chocolates", "2 lbs chicken"
  const leadingNumMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  if (leadingNumMatch) {
    const qty = clampQty(parseFloat(leadingNumMatch[1]));
    const rest = leadingNumMatch[2].trim();

    // Check for unit words between quantity and name
    const unitMatch = rest.match(
      new RegExp(`^(${UNIT_WORDS})\\s+(?:of\\s+)?(.+)$`, "i")
    );
    if (unitMatch) {
      return { quantity: qty, unit: unitMatch[1], name: unitMatch[2] };
    }
    return { quantity: qty, unit: "", name: rest };
  }

  // Pattern 2: trailing "x" multiplier -- "chocolates x6"
  const trailingXMatch = trimmed.match(/^(.+?)\s*x\s*(\d+(?:\.\d+)?)$/i);
  if (trailingXMatch) {
    return {
      quantity: clampQty(parseFloat(trailingXMatch[2])),
      unit: "",
      name: trailingXMatch[1].trim(),
    };
  }

  // Pattern 3: parenthesized quantity -- "chocolates (6)"
  const parenMatch = trimmed.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\)$/);
  if (parenMatch) {
    return {
      quantity: clampQty(parseFloat(parenMatch[2])),
      unit: "",
      name: parenMatch[1].trim(),
    };
  }

  // Pattern 4: adjective form -- "Bottled Chipotle Sauce" -> unit=bottle, name="Chipotle Sauce"
  const adjMatch = trimmed.match(ADJECTIVE_UNIT_RE);
  if (adjMatch) {
    const unit = ADJECTIVE_TO_UNIT[adjMatch[1].toLowerCase()] || adjMatch[1].toLowerCase();
    return { quantity: 1, unit, name: adjMatch[2].trim() };
  }

  // Pattern 5: unit prefix without number -- "bottle of chipotle sauce", "bag of rice"
  const unitPrefixMatch = trimmed.match(
    new RegExp(`^(${UNIT_WORDS})\\s+(?:of\\s+)?(.+)$`, "i")
  );
  if (unitPrefixMatch) {
    return { quantity: 1, unit: unitPrefixMatch[1], name: unitPrefixMatch[2].trim() };
  }

  // No quantity found -- default to 1
  return { quantity: 1, unit: "", name: trimmed };
};
