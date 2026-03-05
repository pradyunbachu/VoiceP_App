import type { PantryItem } from "../types";

const daysFromNow = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

const today = (): string => new Date().toISOString().split("T")[0];

export const DEMO_PANTRY_ITEMS: PantryItem[] = [
  { id: -1, name: "Bananas", quantity: 2, unit: "", category: "Produce", expiration_date: daysFromNow(1), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -2, name: "Spinach", quantity: 1, unit: "bag", category: "Produce", expiration_date: daysFromNow(2), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -3, name: "Carrots", quantity: 6, unit: "", category: "Produce", expiration_date: daysFromNow(14), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -4, name: "Bell Peppers", quantity: 3, unit: "", category: "Produce", expiration_date: daysFromNow(7), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -5, name: "Onions", quantity: 4, unit: "", category: "Produce", expiration_date: daysFromNow(30), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -6, name: "Tomatoes", quantity: 3, unit: "", category: "Produce", expiration_date: daysFromNow(3), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -7, name: "Milk", quantity: 1, unit: "gal", category: "Dairy", expiration_date: daysFromNow(7), purchase_date: today(), stock_status: "low", notes: "Demo item" },
  { id: -8, name: "Eggs", quantity: 12, unit: "", category: "Dairy", expiration_date: daysFromNow(21), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -9, name: "Greek Yogurt", quantity: 2, unit: "", category: "Dairy", expiration_date: daysFromNow(10), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -10, name: "Cheddar Cheese", quantity: 1, unit: "block", category: "Dairy", expiration_date: daysFromNow(30), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -11, name: "Chicken Breast", quantity: 2, unit: "lbs", category: "Meat & Seafood", expiration_date: daysFromNow(2), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -12, name: "Ground Beef", quantity: 1, unit: "lb", category: "Meat & Seafood", expiration_date: daysFromNow(2), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -13, name: "Rice", quantity: 2, unit: "lbs", category: "Grains & Pasta", expiration_date: null, purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -14, name: "Pasta", quantity: 1, unit: "box", category: "Grains & Pasta", expiration_date: null, purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -15, name: "Bread", quantity: 1, unit: "loaf", category: "Grains & Pasta", expiration_date: daysFromNow(3), purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -16, name: "Olive Oil", quantity: 1, unit: "bottle", category: "Condiments", expiration_date: null, purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -17, name: "Soy Sauce", quantity: 1, unit: "bottle", category: "Condiments", expiration_date: null, purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -18, name: "Frozen Broccoli", quantity: 1, unit: "bag", category: "Frozen", expiration_date: null, purchase_date: today(), stock_status: "full", notes: "Demo item" },
  { id: -19, name: "Granola Bars", quantity: 6, unit: "", category: "Snacks", expiration_date: null, purchase_date: today(), stock_status: "full", notes: "Demo item" },
];
