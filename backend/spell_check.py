"""Auto spell-check for pantry item names.

Uses the shelf_life.json dictionary (1500+ canonical food names) and
grocery_categories.json keywords as a reference to correct OCR typos
from receipt scanning (e.g. "Chcken Breast" -> "Chicken Breast").

Algorithm:
  Phase 0 — Receipt abbreviation expansion ("Bnls" -> "Boneless", strip junk)
  Phase A — Full-name match against the dictionary (cutoff 0.85)
  Phase B — Word-by-word correction for unrecognised words (cutoff 0.80)
  Phase C — Common name expansion for single-word shorthand names
"""

import json
import os
import re
from difflib import get_close_matches

# ---------------------------------------------------------------------------
# Load dictionaries once at import time
# ---------------------------------------------------------------------------
_data_dir = os.path.join(os.path.dirname(__file__), "data")

with open(os.path.join(_data_dir, "shelf_life.json"), "r") as _f:
    _shelf_data = json.load(_f)

with open(os.path.join(_data_dir, "grocery_categories.json"), "r") as _f:
    _cat_data = json.load(_f)

# Full item names from shelf_life.json (lowercased keys)
_FULL_NAMES: list[str] = list(_shelf_data["items"].keys())

# Build a set of individual words from all dictionary entries + category keywords
_WORD_SET: set[str] = set()
for name in _FULL_NAMES:
    for word in name.split():
        if len(word) >= 3:  # skip tiny words like "a", "of"
            _WORD_SET.add(word.lower())

# Add category item keywords
for cat_items in _cat_data.get("items", {}).values():
    for item in cat_items:
        for word in item.lower().split():
            if len(word) >= 3:
                _WORD_SET.add(word)

_WORD_LIST: list[str] = list(_WORD_SET)

# ---------------------------------------------------------------------------
# Phase 0 — Receipt abbreviation expansion
# ---------------------------------------------------------------------------
# Common abbreviations printed on grocery receipts that OCR reads faithfully.
# Keys are lowercase. Applied word-by-word before any fuzzy matching.
_RECEIPT_ABBREVS: dict[str, str] = {
    "bnls": "boneless",
    "bnlss": "boneless",
    "sklss": "skinless",
    "sknls": "skinless",
    "skn": "skin",
    "brst": "breast",
    "chkn": "chicken",
    "trky": "turkey",
    "bf": "beef",
    "grnd": "ground",
    "org": "organic",
    "orgn": "organic",
    "whl": "whole",
    "wht": "white",
    "grn": "green",
    "ylw": "yellow",
    "rd": "red",
    "frz": "frozen",
    "frzn": "frozen",
    "frsh": "fresh",
    "slc": "sliced",
    "slcd": "sliced",
    "shr": "shredded",
    "shrd": "shredded",
    "crm": "cream",
    "crmy": "creamy",
    "choc": "chocolate",
    "van": "vanilla",
    "strwbry": "strawberry",
    "blubrry": "blueberry",
    "rspbry": "raspberry",
    "jce": "juice",
    "brd": "bread",
    "chs": "cheese",
    "chse": "cheese",
    "ygrt": "yogurt",
    "yog": "yogurt",
    "veg": "vegetable",
    "vegs": "vegetables",
    "frt": "fruit",
    "hmstyl": "homestyle",
    "natl": "natural",
    "prem": "premium",
    "sel": "select",
    "orig": "original",
    "saus": "sausage",
    "saug": "sausage",
    "peppr": "pepper",
    "tomt": "tomato",
    "lett": "lettuce",
    "mushr": "mushroom",
    "ptato": "potato",
    "ptat": "potato",
    "onio": "onion",
    "grlc": "garlic",
    "cinn": "cinnamon",
    "mayo": "mayonnaise",
    "mstrd": "mustard",
    "ctchp": "ketchup",
    "kchp": "ketchup",
    "bttr": "butter",
    "mrgr": "margarine",
    "hny": "honey",
    "pnt": "peanut",
    "alm": "almond",
    "wlnt": "walnut",
    "swthr": "sweetheart",
    "lrg": "large",
    "sml": "small",
    "med": "medium",
    "ct": "count",
    "pk": "pack",
    "pkg": "package",
    "btl": "bottle",
    "cntr": "container",
}

# Patterns to strip from receipt names (leading fractions, item codes, etc.)
# Matches: "/4 ", "1/4 ", "#2 " but NOT "2 Milk" (plain number could be quantity)
_JUNK_PREFIX_RE = re.compile(r'^(?:[/#]\d+|\d+/\d+)\s+')
_MULTI_SPACE_RE = re.compile(r'\s{2,}')


def _expand_receipt_abbrevs(name: str) -> str:
    """Expand receipt abbreviations and clean up OCR junk in item names."""
    # Strip leading junk like "/4", "1/4", "#2"
    cleaned = _JUNK_PREFIX_RE.sub('', name).strip()
    if not cleaned:
        cleaned = name.strip()

    # Expand abbreviations word by word
    words = cleaned.split()
    expanded = []
    for word in words:
        lower = word.lower().rstrip('.,;:')
        if lower in _RECEIPT_ABBREVS:
            replacement = _RECEIPT_ABBREVS[lower]
            expanded.append(_match_word_case(word, replacement))
        else:
            expanded.append(word)

    result = " ".join(expanded)
    result = _MULTI_SPACE_RE.sub(' ', result).strip()
    return result


# ---------------------------------------------------------------------------
# Phase C — Common OCR shorthand expansions
# ---------------------------------------------------------------------------
COMMON_EXPANSIONS: dict[str, str] = {
    "rotisserie": "rotisserie chicken",
    "romaine": "romaine lettuce",
    "russet": "russet potato",
    "sourdough": "sourdough bread",
    "jasmine": "jasmine rice",
    "basmati": "basmati rice",
    "sriracha": "sriracha sauce",
    "colby": "colby jack cheese",
    "provolone": "provolone cheese",
    "mozzarella": "mozzarella cheese",
    "parmesan": "parmesan cheese",
    "cheddar": "cheddar cheese",
    "muenster": "muenster cheese",
    "gouda": "gouda cheese",
    "brie": "brie cheese",
    "prosciutto": "prosciutto ham",
    "linguine": "linguine pasta",
    "penne": "penne pasta",
    "rigatoni": "rigatoni pasta",
    "fettuccine": "fettuccine pasta",
    "spaghetti": "spaghetti pasta",
    "tilapia": "tilapia fish",
    "habanero": "habanero pepper",
    "jalapeno": "jalapeno pepper",
    "serrano": "serrano pepper",
    "poblano": "poblano pepper",
}


def correct_item_name(name: str) -> dict:
    """Spell-check a pantry item name against the food dictionary.

    Returns {"name": str, "corrected": bool, "original": str}.
    """
    original = name.strip()
    if not original:
        return {"name": original, "corrected": False, "original": original}

    # --- Phase 0: Expand receipt abbreviations & clean OCR junk ---
    working = _expand_receipt_abbrevs(original)

    lower = working.lower()

    # --- Phase A: Full-name match ---
    # If the name already exists in the dictionary, skip correction
    if lower in _shelf_data["items"]:
        corrected_name = _apply_expansion(working)
        changed = corrected_name.lower() != original.lower()
        return {"name": corrected_name, "corrected": changed, "original": original}

    full_matches = get_close_matches(lower, _FULL_NAMES, n=1, cutoff=0.85)
    if full_matches:
        corrected = _match_case(working, full_matches[0])
        corrected = _apply_expansion(corrected)
        return {"name": corrected, "corrected": True, "original": original}

    # --- Phase B: Word-by-word correction ---
    words = working.split()
    corrected_words = []
    for word in words:
        word_lower = word.lower()
        if len(word_lower) < 3 or word_lower in _WORD_SET:
            corrected_words.append(word)
            continue
        matches = get_close_matches(word_lower, _WORD_LIST, n=1, cutoff=0.80)
        if matches:
            corrected_words.append(_match_word_case(word, matches[0]))
        else:
            corrected_words.append(word)

    result = " ".join(corrected_words)
    result = _apply_expansion(result)

    changed = result.lower() != original.lower()
    return {"name": result, "corrected": changed, "original": original}


def _apply_expansion(name: str) -> str:
    """Expand single-word shorthand names to their full form."""
    lower = name.lower().strip()
    if lower in COMMON_EXPANSIONS:
        return _match_case(name, COMMON_EXPANSIONS[lower])
    return name


def _match_case(original: str, replacement: str) -> str:
    """Apply the casing style of `original` to `replacement`.

    - ALL CAPS -> ALL CAPS
    - Title Case -> Title Case
    - otherwise -> Title Case (most natural for pantry names)
    """
    if original.isupper():
        return replacement.upper()
    return replacement.title()


def _match_word_case(original_word: str, replacement_word: str) -> str:
    """Preserve single-word casing: uppercase -> upper, title -> title, else title."""
    if original_word.isupper():
        return replacement_word.upper()
    if original_word[0].isupper():
        return replacement_word.capitalize()
    return replacement_word
