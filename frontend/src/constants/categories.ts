export const CATEGORIES = [
  "Electronics",
  "Groceries",
  "Clothing",
  "Transportation",
  "Dining",
  "Entertainment",
  "Health",
  "Home",
  "Utilities",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export default CATEGORIES;
