"""Low-level text processing helpers for expense extraction.

Shared by both the LLM-based and regex-based extraction pipelines.

  parse_relative_date — Resolves "yesterday", "3 days ago", "last week", etc.
                        to a YYYY-MM-DD string. Defaults to today.
  parse_amount        — Converts an amount string to float, with special
                        handling for 4-5 digit numbers (2350 → 23.50).
  extract_store       — Extracts a store name from "at Walmart" / "from Target"
                        patterns using capitalization heuristics.
  clean_item_name     — Strips articles, action words, store names, and
                        prepositions, then capitalizes (with Apple-product
                        special cases like iPad, MacBook).
  categorize_item     — Maps an item to a spending category via keyword lookup,
                        falling back to store-name heuristics.
  detect_recurring    — Scans for recurring keywords ("monthly", "every 2
                        weeks", "subscription") and returns interval/unit.
"""

# ============================================================================
# TEXT PROCESSING HELPER FUNCTIONS
# ============================================================================
from datetime import datetime, timedelta
import re

def parse_relative_date(transcript: str) -> str:
    """Parse relative date terms from transcript and return YYYY-MM-DD format"""
    transcript_lower = transcript.lower()
    today = datetime.now()

    # Check for relative date terms
    if re.search(r'\byesterday\b', transcript_lower):
        date = today - timedelta(days=1)
    elif re.search(r'\btomorrow\b', transcript_lower):
        date = today + timedelta(days=1)
    elif re.search(r'\btoday\b', transcript_lower):
        date = today
    elif re.search(r'\blast\s+week\b', transcript_lower):
        date = today - timedelta(weeks=1)
    elif re.search(r'\blast\s+month\b', transcript_lower):
        date = today - timedelta(days=30)
    elif re.search(r'\b(\d+)\s+days?\s+ago\b', transcript_lower):
        match = re.search(r'\b(\d+)\s+days?\s+ago\b', transcript_lower)
        if match:
            days_ago = int(match.group(1))
            date = today - timedelta(days=days_ago)
        else:
            date = today
    elif re.search(r'\bin\s+(\d+)\s+days?\b', transcript_lower):
        match = re.search(r'\bin\s+(\d+)\s+days?\b', transcript_lower)
        if match:
            days_ahead = int(match.group(1))
            date = today + timedelta(days=days_ahead)
        else:
            date = today
    else:
        # Default to today if no relative date found
        date = today

    return date.strftime("%Y-%m-%d")

def parse_amount(amount_str: str) -> float:
    """Parse amount string to float, handling special cases
    Only applies dollars.cents logic to 4-5 digit numbers (e.g., 2350 -> 23.50)
    Numbers like 700, 800 are clearly whole dollars, not 7.00 or 8.00"""
    try:
        if '.' not in amount_str:
            num = int(amount_str)
            num_digits = len(amount_str)
            # Only apply dollars.cents logic to 4-5 digit numbers
            # 3-digit numbers like 700, 800 are clearly whole dollars
            if 4 <= num_digits <= 5 and num < 100000:
                dollars = num // 100
                cents = num % 100
                return dollars + (cents / 100.0)
            else:
                return float(num)
        else:
            return float(amount_str)
    except:
        return 0.0

def extract_store(transcript: str) -> str:
    """Extract store name from transcript"""
    store = "Unknown Store"
    store_patterns = [
        r'at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+for',
    ]
    for pattern in store_patterns:
        match = re.search(pattern, transcript)
        if match:
            store = match.group(1)
            break
    return store

def clean_item_name(item: str, store: str = "") -> str:
    """Clean up item name - remove common words and store names"""
    # Remove common prefixes and articles (including "N" which is a common LLM mistake for "an")
    item = re.sub(r'\b(i|I|got|bought|purchased|the|a|an|n|some)\b', '', item, flags=re.IGNORECASE)

    # Also remove leading "N " specifically (common Groq mistake: "an iPad" -> "N iPad")
    item = re.sub(r'^n\s+', '', item, flags=re.IGNORECASE)

    # Remove store name if it appears in the item
    if store and store != "Unknown Store":
        store_lower = store.lower()
        item = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', item, flags=re.IGNORECASE)

    # Remove "from [store]" pattern first
    item = re.sub(r'\bfrom\s+\w+\b', '', item, flags=re.IGNORECASE)

    # Remove "at [store]" pattern
    item = re.sub(r'\bat\s+\w+\b', '', item, flags=re.IGNORECASE)

    # Clean up extra spaces before removing standalone words
    item = re.sub(r'\s+', ' ', item)
    item = item.strip()

    # Remove standalone "from" and "at" words
    item = re.sub(r'\bfrom\b', '', item, flags=re.IGNORECASE)
    item = re.sub(r'\bat\b', '', item, flags=re.IGNORECASE)

    # Clean up extra spaces
    item = re.sub(r'\s+', ' ', item)
    item = item.strip()

    # If empty after cleaning, return default
    if not item:
        return "Various items"

    # Capitalize properly - handle special cases like "iPad", "iPhone", "MacBook"
    item_lower = item.lower()
    special_cases = {
        'ipad': 'iPad',
        'iphone': 'iPhone',
        'macbook': 'MacBook',
        'imac': 'iMac',
        'ipod': 'iPod'
    }

    if item_lower in special_cases:
        return special_cases[item_lower]

    # For regular items, capitalize first letter of each word
    words = item.split()
    cleaned_words = []
    for word in words:
        word_lower = word.lower()
        if word_lower in special_cases:
            cleaned_words.append(special_cases[word_lower])
        elif word_lower in ['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'n']:
            # Skip these words entirely if they're standalone (including 'n' which is a common LLM mistake for 'an')
            continue
        else:
            cleaned_words.append(word.capitalize())

    if cleaned_words:
        item = ' '.join(cleaned_words)
        # Always capitalize first letter
        if item:
            item = item[0].upper() + item[1:] if len(item) > 1 else item.upper()
    else:
        item = "Various items"

    return item

# Item-keyword → category. Order matters: a specific item (e.g. "laptop")
# should win over a store-based guess. "water" is intentionally NOT a Utilities
# keyword — as a purchased item it's bottled water (groceries), and letting it
# read as Utilities mis-tagged grocery baskets.
_CATEGORY_KEYWORDS = {
    "Electronics": ["laptop", "computer", "macbook", "iphone", "ipad", "phone", "tablet", "tv", "headphone", "charger", "monitor"],
    "Groceries": [
        "groceries", "grocery", "milk", "bread", "egg", "food", "banana", "candy", "apple",
        "chip", "croissant", "cauliflower", "mint", "cheeto", "potato", "snack", "produce",
        "vegetable", "fruit", "cereal", "yogurt", "cheese", "chicken", "rice", "pasta",
        "juice", "soda", "cookie", "chocolate", "strawberr", "pineapple", "lettuce", "tomato",
        "onion", "carrot", "broccoli", "meat", "seafood", "butter", "sauce", "water bottle",
    ],
    "Clothing": ["shirt", "pants", "jacket", "shoes", "dress", "socks", "hoodie"],
    "Transportation": ["gas", "gasoline", "fuel", "uber", "lyft", "parking"],
    "Dining": ["restaurant", "cafe", "coffee", "lunch", "dinner", "takeout"],
    "Entertainment": ["movie", "game", "book", "concert"],
    "Health": ["pharmacy", "medicine", "vitamin", "prescription"],
    "Home": ["furniture", "bed", "chair", "rent", "rental", "apartment", "house", "mortgage", "housing"],
    "Utilities": ["electric", "internet", "water bill", "wifi"],
}

# Store-name → category (fallback when no item keyword matches). Tokens are
# specific enough to avoid false positives (e.g. "sam's club", not "sam").
_GROCERY_STORES = [
    "walmart", "target", "kroger", "costco", "sam's club", "sams club", "trader joe",
    "whole foods", "safeway", "aldi", "publix", "wegmans", "h-e-b", "sprouts", "ralphs",
    "vons", "albertsons", "food lion", "meijer", "winco", "shoprite", "stop & shop",
    "grocery", "supermarket",
]
_ELECTRONICS_STORES = ["apple store", "best buy", "microcenter", "micro center"]


def _keyword_category(item: str) -> str | None:
    """Return the category implied by a single item's keywords, or None."""
    item_lower = item.lower()
    for cat, keywords in _CATEGORY_KEYWORDS.items():
        if any(kw in item_lower for kw in keywords):
            return cat
    return None


def _store_category(store: str) -> str | None:
    """Return the category implied by the store name, or None."""
    if not store or store == "Unknown Store":
        return None
    s = store.lower()
    if any(w in s for w in _GROCERY_STORES):
        return "Groceries"
    if any(w in s for w in _ELECTRONICS_STORES):
        return "Electronics"
    return None


def categorize_item(item: str, store: str) -> str:
    """Categorize a single item (keyword first, then store, else Other)."""
    return _keyword_category(item) or _store_category(store) or "Other"


def categorize_items(items: str, store: str) -> str:
    """Categorize an expense from its comma-separated items + store.

    A specific non-grocery item (laptop, gas, …) wins immediately. Otherwise,
    if any item reads as groceries — or the store is a grocery store — it's
    Groceries. Falls back to the store category, then "Other"."""
    grocery_seen = False
    for raw in (items or "").split(","):
        part = raw.strip()
        if not part:
            continue
        cat = _keyword_category(part)
        if cat == "Groceries":
            grocery_seen = True
        elif cat:  # a specific non-grocery category — trust it
            return cat
    if grocery_seen:
        return "Groceries"
    return _store_category(store) or "Other"

def detect_recurring(transcript: str) -> dict:
    """Detect if expense is recurring and extract interval/unit"""
    transcript_lower = transcript.lower()

    # Default: not recurring
    result = {
        "is_recurring": False,
        "recurring_interval": None,
        "recurring_unit": None
    }

    # Check for recurring patterns
    recurring_patterns = [
        # "every X weeks/months/days/years"
        (r'every\s+(\d+)\s+(day|week|month|year)s?', lambda m: (int(m.group(1)), m.group(2) + "s")),
        # "biweekly" or "bi-weekly"
        (r'bi[-\s]?weekly', lambda m: (2, "weeks")),
        # "bimonthly" or "bi-monthly"
        (r'bi[-\s]?monthly', lambda m: (2, "months")),
        # "quarterly"
        (r'quarterly', lambda m: (3, "months")),
        # "weekly"
        (r'\bweekly\b', lambda m: (1, "weeks")),
        # "monthly"
        (r'\bmonthly\b', lambda m: (1, "months")),
        # "yearly" or "annually"
        (r'\b(yearly|annually)\b', lambda m: (1, "years")),
        # "daily"
        (r'\bdaily\b', lambda m: (1, "days")),
        # "every week/month/year/day"
        (r'every\s+(week|month|year|day)\b', lambda m: (1, m.group(1) + "s")),
        # "recurring" keyword (default to monthly if no other info)
        (r'\brecurring\b', lambda m: (1, "months")),
        # "subscription" keyword (default to monthly)
        (r'\bsubscription\b', lambda m: (1, "months")),
    ]

    for pattern, extractor in recurring_patterns:
        match = re.search(pattern, transcript_lower)
        if match:
            interval, unit = extractor(match)
            result["is_recurring"] = True
            result["recurring_interval"] = interval
            result["recurring_unit"] = unit
            break

    return result
