"""One-time converter: USDA FoodKeeper JSON -> merged shelf_life.json.

Parses the USDA FoodKeeper dataset (downloaded from data.gov via Wayback
Machine) and merges shelf life data into the existing hand-curated
shelf_life.json. Existing entries are preserved as overrides.

Shelf life field priority (per item):
  1. DOP_Refrigerate_Max  — most common for perishables
  2. DOP_Pantry_Max       — shelf-stable items with no fridge entry
  3. Refrigerate_After_Opening_Max — fallback
  4. Pantry_Max           — last resort

Metric conversion: Days=1, Weeks=7, Months=30

Run:  python3 backend/data/convert_foodkeeper.py
"""

import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(SCRIPT_DIR, "foodkeeper.json")
SHELF_LIFE_PATH = os.path.join(SCRIPT_DIR, "shelf_life.json")

METRIC_MULTIPLIERS = {
    "Days": 1,
    "Weeks": 7,
    "Months": 30,
}

# Fields to try, in priority order: (max_field, metric_field)
FIELD_PRIORITY = [
    ("DOP_Refrigerate_Max", "DOP_Refrigerate_Metric"),
    ("DOP_Pantry_Max", "DOP_Pantry_Metric"),
    ("Refrigerate_After_Opening_Max", "Refrigerate_After_Opening_Metric"),
    ("Pantry_Max", "Pantry_Metric"),
]

# --- Blocklists for filtering out bad entries ---

# Words too short or generic to be standalone keys — they cause false
# substring matches in shelf_life.py's `if key in lower_name` logic.
BLOCKED_STANDALONE = {
    # Packaging types
    "bag", "bags", "bar", "bars", "bottle", "bottles", "box", "boxes", "boxe",
    "can", "cans", "carton", "cartons", "jar", "jars", "pack", "packs",
    "package", "packages", "packet", "packets", "pouch", "pouchs", "tub", "tubs",
    "aerosol can", "aerosol cans", "air pack", "air packs",
    "aseptic packaging", "retort", "retorts",
    # Non-food words
    "label", "labels", "seal", "seals", "usda", "usdas", "brand", "brands",
    "product", "products", "supplement", "supplements", "animal", "animals",
    "domestic", "domestics", "stable", "stables", "shelf", "shelfs",
    "ensure", "ensures", "boost", "boosts",
    # Colors / adjectives that substring-match too broadly
    "red", "reds", "blue", "blues", "green", "greens", "black", "blacks",
    "white", "whites", "brown", "browns", "light", "lights",
    "hot", "hots", "cold", "colds", "dry", "drys", "raw", "raws",
    "fresh", "freshs", "hard", "hards", "soft", "softs",
    "young", "youngs", "small", "smalls", "large", "larges", "flat", "flats",
    "low", "lows", "high", "highs", "home", "homes",
    # Cooking methods / states
    "baked", "bakeds", "boiled", "boileds", "cooked", "cookeds",
    "dried", "drieds", "chopped", "choppeds", "roasted", "roasteds",
    "sliced", "sliceds", "shredded", "shreddeds", "salted", "salteds",
    "smoked", "smokeds", "stuffed", "stuffeds", "frozen", "frozens",
    "bottled", "bottleds", "boxed", "boxeds", "canned", "canneds",
    "jarred", "jarreds", "packaged", "packageds", "instant", "instants",
    # Dangerously short words causing false substring matches
    "py", "cut", "cuts", "cod", "cods", "cat", "cats",
    "pan", "pans", "bun", "buns", "sea", "seas", "ice", "ices",
    "oil", "oils", "nut", "nuts", "pie", "pies", "cob", "cobs",
    "oat", "oats", "nog", "nogs", "rye", "ryes", "dip", "dips",
    "leg", "legs", "bone", "bones", "rock", "rocks",
    "eat", "eats", "fat", "fats", "mix", "mixs",
    "ham", "hams",  # conflicts with hand-curated "ham" = 5
    "egg", "eggs",  # hand-curated "egg" = 28
    "jam", "jams",
    "sun", "suns", "date", "dates", "feed", "feeds",
    "store", "stores", "crown", "crowns", "grain", "grains",
    # Cooking instructions (not food items)
    "cook-before-eating", "cook before eating",
    "before-eating", "keep refrigerated",
    "ready to feed",
    # Processing methods / abbreviations
    "re hydrated", "tsp", "tsps", "uht", "uhts",
    # Generic food terms too broad for substring matching
    "food", "foods", "drink", "drinks", "meal", "meals", "dish", "dishes",
    "dishe", "good", "goods", "soup", "soups", "leaf", "leafs",
    "live", "lives", "formula",
}

# Minimum length for any entry
MIN_KEY_LENGTH = 4


def _to_days(value, metric_str: str) -> int | None:
    """Convert a numeric value + metric string to days."""
    if value is None or metric_str is None:
        return None
    try:
        value = int(float(value))
    except (ValueError, TypeError):
        return None
    multiplier = METRIC_MULTIPLIERS.get(metric_str)
    if multiplier is None:
        return None
    return value * multiplier


def _get_field(row: dict, field_name: str):
    """Get a field value from the JSON row format (list of single-key dicts)."""
    for cell in row:
        if field_name in cell:
            return cell[field_name]
    return None


def _extract_shelf_life(row: dict) -> int | None:
    """Extract shelf life in days from a product row using the priority chain."""
    for max_field, metric_field in FIELD_PRIORITY:
        max_val = _get_field(row, max_field)
        metric_val = _get_field(row, metric_field)
        if max_val is not None and metric_val is not None:
            days = _to_days(max_val, str(metric_val))
            if days is not None:
                return days
    return None


def _is_valid_entry(name: str) -> bool:
    """Return True if a name is a valid shelf-life entry."""
    if len(name) < MIN_KEY_LENGTH:
        return False
    if name in BLOCKED_STANDALONE:
        return False
    # Reject long phrases with appended "s" (nonsensical pluralization)
    if " " in name and name.endswith("s") and len(name) > 40:
        return False
    # Reject entries with "etc." or parenthetical junk
    if "etc." in name or name.endswith(")s"):
        return False
    return True


def _generate_names(name: str, subtitle, keywords) -> list[str]:
    """Generate all lowercased name variants for an item."""
    names = set()

    clean_name = (name or "").strip().lower()
    if not clean_name:
        return []

    names.add(clean_name)

    # "subtitle name" combo when subtitle is short and useful
    if subtitle:
        clean_sub = str(subtitle).strip().lower()
        if clean_sub and len(clean_sub) < 30 and "such as" not in clean_sub:
            names.add(f"{clean_sub} {clean_name}")

    # Keywords — each comma-separated keyword becomes an entry
    if keywords:
        for kw in str(keywords).split(","):
            kw = kw.strip().lower()
            if kw and len(kw) >= MIN_KEY_LENGTH:
                names.add(kw)

    # Generate plural/singular variants (single words only, skip past participles)
    NO_PLURALIZE_SUFFIXES = ("ed", "ing", "al", "ful", "ous", "ive", "able", "ible")
    expanded = set()
    for n in names:
        if " " in n or "," in n:
            continue
        # Don't pluralize past participles or adjectives
        if any(n.endswith(sfx) for sfx in NO_PLURALIZE_SUFFIXES):
            continue
        if n.endswith("s") and len(n) > 4 and not n.endswith("ss"):
            expanded.add(n[:-1])
        elif not n.endswith("s") and not n.endswith("h") and not n.endswith("x"):
            expanded.add(n + "s")
        if n.endswith("ies") and len(n) > 5:
            expanded.add(n[:-3] + "y")
        elif n.endswith("y") and not n.endswith("ey") and len(n) > 4:
            expanded.add(n[:-1] + "ies")
    names.update(expanded)

    return [n for n in names if _is_valid_entry(n)]


def convert():
    """Parse the FoodKeeper JSON and merge into shelf_life.json."""
    with open(SHELF_LIFE_PATH, "r") as f:
        shelf_data = json.load(f)

    existing_items = shelf_data["items"]

    with open(JSON_PATH, "r") as f:
        fk_data = json.load(f)

    # Find the Product sheet
    product_sheet = None
    for sheet in fk_data["sheets"]:
        if sheet["name"] == "Product":
            product_sheet = sheet["data"]
            break

    if not product_sheet:
        print("ERROR: No 'Product' sheet found in FoodKeeper JSON")
        return

    usda_items: dict[str, int] = {}
    skipped = 0

    for row in product_sheet:
        name = _get_field(row, "Name")
        if not name:
            skipped += 1
            continue

        name = str(name).strip()
        days = _extract_shelf_life(row)
        if days is None:
            skipped += 1
            continue

        subtitle = _get_field(row, "Name_subtitle")
        keywords = _get_field(row, "Keywords")
        all_names = _generate_names(name, subtitle, keywords)

        for item_name in all_names:
            if item_name not in usda_items:
                usda_items[item_name] = days

    # Merge: USDA entries fill gaps, existing hand-curated entries win
    merged = dict(usda_items)
    merged.update(existing_items)

    shelf_data["items"] = dict(sorted(merged.items()))

    with open(SHELF_LIFE_PATH, "w") as f:
        json.dump(shelf_data, f, indent=2)
        f.write("\n")

    print(f"USDA items extracted: {len(usda_items)}")
    print(f"Rows skipped (no usable shelf life): {skipped}")
    print(f"Hand-curated overrides kept: {len(existing_items)}")
    print(f"Final merged item count: {len(shelf_data['items'])}")

    # Spot checks for correctness
    items = shelf_data["items"]
    print("\nSpot checks (verifying no false substring matches):")
    checks = [
        ("butter", 30, "hand-curated"),
        ("ground beef", 2, "hand-curated"),
        ("chicken", 2, "hand-curated"),
        ("tofu", None, "USDA ~7 days"),
        ("hummus", None, "USDA ~90 days"),
        ("ketchup", None, "USDA ~180 days"),
    ]
    for item, expected, note in checks:
        val = items.get(item, "NOT IN DB")
        status = ""
        if expected is not None:
            status = " OK" if val == expected else " MISMATCH"
        print(f"  {item}: {val}{status} — {note}")

    # Verify dangerous keys are NOT present
    print("\nBlocked key verification (should all be ABSENT):")
    dangerous = ["nut", "ice", "sea", "eat", "oat", "cat", "food", "drink",
                  "meal", "white", "black", "red", "frozen", "bag", "can"]
    for key in dangerous:
        present = key in items
        print(f"  '{key}': {'PRESENT (BAD!)' if present else 'absent (good)'}")


if __name__ == "__main__":
    convert()
