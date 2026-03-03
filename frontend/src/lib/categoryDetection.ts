import type { PantryCategory } from "../constants/pantryCategories";

const singularize = (w: string): string => {
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) return w.slice(0, -1);
  return w;
};

// Ordered list of category rules. For multi-word product names the LAST
// matching word usually tells you what the product actually IS ("Garlic &
// Cheese Breadsticks" is Bakery, not Dairy), so we run two passes:
//   1. Check only the last 1-2 words of the name against all rules.
//   2. If nothing matched, check the full name (original behaviour).
const CATEGORY_RULES: Array<[PantryCategory, RegExp]> = [
  ["Dairy",          /\b(milk|cheese|yogurt|butter|cream|egg|cottage|sour cream|whipping cream|half and half|creamer)\b/],
  ["Produce",        /\b(apple|banana|orange|grape|strawberry|blueberry|raspberry|blackberry|lemon|lime|mango|pineapple|watermelon|cantaloupe|peach|pear|plum|cherry|kiwi|avocado|tomato|potato|onion|garlic|carrot|celery|lettuce|spinach|kale|broccoli|cauliflower|pepper|cucumber|zucchini|zuchini|zuchinni|squash|corn|bean|pea|mushroom|cabbage|asparagus|artichoke|beet|radish|turnip|eggplant|ginger|cilantro|parsley|basil|mint|fruit|vegetable|veggie|salad|greens|sprout|brussel|brussels|mandarin|tangerine|clementine|nectarine|pomegranate|papaya|coconut|cranberry|melon|fig)\b/],
  ["Meat & Seafood", /\b(chicken|beef|pork|steak|ground|turkey|lamb|bacon|sausage|ham|meat|fish|salmon|tuna|shrimp|crab|lobster|scallop|clam|mussel|oyster|seafood|tilapia|cod|halibut|rangoon)\b/],
  ["Bakery",         /\b(bread|breadstick|bagel|muffin|croissant|donut|doughnut|roll|bun|cake|pie|pastry|cookie|brownie|cupcake|baguette|tortilla|pita|naan|wrap)\b/],
  ["Frozen",         /\b(frozen|ice cream|popsicle|pizza|waffle|fries|nugget|burrito|dinner|meal)\b/],
  ["Canned Goods",   /\b(canned|can of|soup|broth|stock|bean|tomato|corn|tuna|sardine|spam|chili)\b/],
  ["Snacks",         /\b(chip|crisp|pretzel|popcorn|cracker|cookie|candy|chocolate|gummy|snack|nut|almond|cashew|peanut|walnut|pistachio|trail mix|granola bar|protein bar|jerky|bar)\b/],
  ["Beverages",      /\b(water|juice|soda|pop|cola|coffee|tea|beer|wine|alcohol|drink|beverage|smoothie|shake|lemonade|energy drink|sports drink|kombucha)\b/],
  ["Condiments",     /\b(ketchup|mustard|mayo|mayonnaise|sauce|marinara|dressing|vinegar|oil|olive oil|soy sauce|hot sauce|salsa|relish|pickle|jam|jelly|honey|syrup|peanut butter|nutella|spread)\b/],
  ["Grains & Pasta", /\b(pasta|spaghetti|noodle|rice|quinoa|oat|oatmeal|cereal|flour|bread crumb|couscous|barley|grain|macaroni|penne|fettuccine|linguine|ramen)\b/],
];

const matchCategory = (text: string): PantryCategory | null => {
  const norm = text.split(/\s+/).map(singularize).join(' ');
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text) || pattern.test(norm)) return category;
  }
  return null;
};

// Multi-word items where the full phrase determines the category and
// individual words would mislead (e.g. "peanut butter" → Condiments,
// not Dairy via "butter").
const COMPOUND_OVERRIDES: Array<[string, PantryCategory]> = [
  ["peanut butter", "Condiments"],
  ["almond butter", "Condiments"],
  ["cashew butter", "Condiments"],
  ["sunflower butter", "Condiments"],
  ["apple butter", "Condiments"],
  ["cocoa butter", "Condiments"],
  ["cookie butter", "Condiments"],
  ["ice cream", "Frozen"],
  ["cream cheese", "Dairy"],
  ["sour cream", "Dairy"],
  ["cottage cheese", "Dairy"],
  ["string cheese", "Dairy"],
];

export const detectCategory = (itemName: string): PantryCategory => {
  const name = itemName.toLowerCase().trim();
  const words = name.split(/[\s&,]+/).filter(Boolean);

  // Pass 0: compound overrides — check before anything else
  for (const [phrase, category] of COMPOUND_OVERRIDES) {
    if (name.includes(phrase)) return category;
  }

  // Pass 1: check only the tail of the name (last 1-3 words).
  // "Garlic & Cheese Breadsticks" → check "breadsticks", then "cheese breadsticks"
  // This lets the product-type word at the end win over flavoring words.
  for (let tailLen = 1; tailLen <= Math.min(3, words.length - 1); tailLen++) {
    const tail = words.slice(-tailLen).join(' ');
    const result = matchCategory(tail);
    if (result) return result;
  }

  // Pass 2: full name (original behaviour for single-word names or no tail match)
  return matchCategory(name) ?? "Other";
};

const NON_PANTRY_PATTERN =
  /\b(air freshener|bleach|windex|lysol|sponge|dish soap|laundry detergent|fabric softener|dryer sheet|cleaning spray|disinfectant|disinfecting wipe|mop|broom|duster|all purpose cleaner|glass cleaner|floor cleaner|scrub brush|paper towel|trash bag|garbage bag|napkin|paper plate|plastic cup|styrofoam|shampoo|conditioner|body wash|soap bar|bar soap|toothpaste|toothbrush|deodorant|lotion|razor|floss|mouthwash|tampon|pad|toilet paper|tissue|cotton ball|cotton swab|q-tip|sunscreen|hand soap|dog food|cat food|cat litter|pet treat|pet food|diaper|baby wipe|formula|batteries|battery|light bulb|candle|matches)\b/;

export const isPantryItem = (itemName: string): boolean => {
  const name = itemName.toLowerCase().trim();
  const normalizedName = name.split(/\s+/).map(singularize).join(' ');
  return !NON_PANTRY_PATTERN.test(name) && !NON_PANTRY_PATTERN.test(normalizedName);
};
