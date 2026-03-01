export const PANTRY_CATEGORIES = [
  "Dairy",
  "Produce",
  "Meat & Seafood",
  "Bakery",
  "Frozen",
  "Canned Goods",
  "Snacks",
  "Beverages",
  "Condiments",
  "Grains & Pasta",
  "Other",
] as const;

export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];

export default PANTRY_CATEGORIES;
