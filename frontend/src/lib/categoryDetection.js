const singularize = (w) => {
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 2) return w.slice(0, -1);
  return w;
};

export const detectCategory = (itemName) => {
  let name = itemName.toLowerCase().trim();

  // Normalize plural forms PER WORD so "grapes green" -> "grape green"
  const normalizedName = name.split(/\s+/).map(singularize).join(' ');

  // Helper to check if name matches (tries both original and normalized)
  const matches = (pattern) => {
    return pattern.test(name) || pattern.test(normalizedName);
  };

  // Dairy
  if (
    matches(
      /\b(milk|cheese|yogurt|butter|cream|egg|cottage|sour cream|whipping cream|half and half|creamer)\b/
    )
  ) {
    return "Dairy";
  }

  // Produce (fruits and vegetables)
  if (
    matches(
      /\b(apple|banana|orange|grape|strawberr|blueberr|raspberr|lemon|lime|mango|pineapple|watermelon|cantaloupe|peach|pear|plum|cherry|kiwi|avocado|tomato|potato|onion|garlic|carrot|celery|lettuce|spinach|kale|broccoli|cauliflower|pepper|cucumber|zucchini|zuchini|zuchinni|squash|corn|bean|pea|mushroom|cabbage|asparagus|artichoke|beet|radish|turnip|eggplant|ginger|cilantro|parsley|basil|mint|fruit|vegetable|veggie|salad|greens|sprout|brussel|brussels)\b/
    )
  ) {
    return "Produce";
  }

  // Meat & Seafood
  if (
    matches(
      /\b(chicken|beef|pork|steak|ground|turkey|lamb|bacon|sausage|ham|meat|fish|salmon|tuna|shrimp|crab|lobster|scallop|clam|mussel|oyster|seafood|tilapia|cod|halibut|rangoon)\b/
    )
  ) {
    return "Meat & Seafood";
  }

  // Bakery
  if (
    matches(
      /\b(bread|bagel|muffin|croissant|donut|doughnut|roll|bun|cake|pie|pastry|cookie|brownie|cupcake|baguette|tortilla|pita|naan|wrap)\b/
    )
  ) {
    return "Bakery";
  }

  // Frozen
  if (
    matches(
      /\b(frozen|ice cream|popsicle|pizza|waffle|fries|nugget|burrito|dinner|meal)\b/
    )
  ) {
    return "Frozen";
  }

  // Canned Goods
  if (
    matches(
      /\b(canned|can of|soup|broth|stock|bean|tomato|corn|tuna|sardine|spam|chili)\b/
    )
  ) {
    return "Canned Goods";
  }

  // Snacks
  if (
    matches(
      /\b(chip|crisp|pretzel|popcorn|cracker|cookie|candy|chocolate|gummy|snack|nut|almond|cashew|peanut|walnut|pistachio|trail mix|granola bar|protein bar|jerky)\b/
    )
  ) {
    return "Snacks";
  }

  // Beverages
  if (
    matches(
      /\b(water|juice|soda|pop|cola|coffee|tea|beer|wine|alcohol|drink|beverage|smoothie|shake|lemonade|energy drink|sports drink|kombucha)\b/
    )
  ) {
    return "Beverages";
  }

  // Condiments
  if (
    matches(
      /\b(ketchup|mustard|mayo|mayonnaise|sauce|dressing|vinegar|oil|olive oil|soy sauce|hot sauce|salsa|relish|pickle|jam|jelly|honey|syrup|peanut butter|nutella|spread)\b/
    )
  ) {
    return "Condiments";
  }

  // Grains & Pasta
  if (
    matches(
      /\b(pasta|spaghetti|noodle|rice|quinoa|oat|oatmeal|cereal|flour|bread crumb|couscous|barley|grain|macaroni|penne|fettuccine|linguine|ramen)\b/
    )
  ) {
    return "Grains & Pasta";
  }

  return "Other";
};

const NON_PANTRY_PATTERN =
  /\b(air freshener|bleach|windex|lysol|sponge|dish soap|laundry detergent|fabric softener|dryer sheet|cleaning spray|disinfectant|disinfecting wipe|mop|broom|duster|all purpose cleaner|glass cleaner|floor cleaner|scrub brush|paper towel|trash bag|garbage bag|napkin|paper plate|plastic cup|styrofoam|shampoo|conditioner|body wash|soap bar|bar soap|toothpaste|toothbrush|deodorant|lotion|razor|floss|mouthwash|tampon|pad|toilet paper|tissue|cotton ball|cotton swab|q-tip|sunscreen|hand soap|dog food|cat food|cat litter|pet treat|pet food|diaper|baby wipe|formula|batteries|battery|light bulb|candle|matches)\b/;

export const isPantryItem = (itemName) => {
  const name = itemName.toLowerCase().trim();
  const normalizedName = name.split(/\s+/).map(singularize).join(' ');
  return !NON_PANTRY_PATTERN.test(name) && !NON_PANTRY_PATTERN.test(normalizedName);
};
