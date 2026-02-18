"""Pure expense extraction and validation logic (no network calls).

Used by both the LLM-based and regex-based extraction routes.

  validate_expense       — Normalizes an expense dict from Groq output:
      cleans the items field (strips prices, articles, action words), fixes
      Apple product capitalization, validates category/amount/date, and
      appends a "Recurring" tag to the category when applicable.

  post_process_extraction — Light cleanup pass on a list of extracted expenses.

  extract_expense_simple  — Full regex-based extraction pipeline (no LLM).
      Handles multi-item "$X worth of Y" patterns, "item1 for $X and item2
      for $Y" patterns, and single-item extraction with fuzzy amount parsing.
      Falls back to keyword-based item detection and store-name inference.
"""

# ============================================================================
# EXPENSE EXTRACTION FUNCTIONS
# ============================================================================
import re
from .text_processing import (
    parse_relative_date,
    parse_amount,
    extract_store,
    clean_item_name,
    categorize_item,
    detect_recurring
)

def validate_expense(expense: dict, today_str: str) -> dict:
    """Validate and normalize expense data"""
    # Required fields
    required = ["store", "items", "category", "amount", "date"]
    for field in required:
        if field not in expense:
            raise ValueError(f"Missing required field: {field}")

    # Clean items field
    items = str(expense["items"]).strip()
    if not items:
        raise ValueError("Items field cannot be empty")

    # Remove price information and "worth of" patterns FIRST
    items = re.sub(r'\$\d+(?:\.\d+)?\s+worth\s+of\s+', '', items, flags=re.IGNORECASE).strip()
    items = re.sub(r'\$\d+(?:\.\d+)?\s+', '', items).strip()  # Remove any remaining dollar amounts
    items = re.sub(r'worth\s+of\s+', '', items, flags=re.IGNORECASE).strip()

    # Remove articles carefully - only clear article patterns followed by capitalized words
    items = re.sub(r'^the\s+(?=[A-Z])', '', items, flags=re.IGNORECASE).strip()
    items = re.sub(r'^an\s+(?=[A-Z])', '', items, flags=re.IGNORECASE).strip()
    items = re.sub(r'^a\s+(?=[A-Z])', '', items, flags=re.IGNORECASE).strip()

    # Remove action words
    items = re.sub(r'^(i\s+)?(bought|got|purchased|spent)\s+', '', items, flags=re.IGNORECASE).strip()

    # Remove any remaining price patterns
    items = re.sub(r'\s+\$\d+(?:\.\d+)?', '', items).strip()
    items = re.sub(r'\$\d+(?:\.\d+)?\s+', '', items).strip()

    # Fix Apple product capitalization
    product_fixes = {
        'ipad': 'iPad', 'iphone': 'iPhone', 'macbook': 'MacBook',
        'imac': 'iMac', 'ipod': 'iPod'
    }
    items_lower = items.lower()
    for product_key, product_value in product_fixes.items():
        if items_lower == product_key:
            items = product_value
            break
        elif items_lower.startswith(product_key + ' '):
            remaining = items[len(product_key):].strip()
            items = product_value + (' ' + remaining.title() if remaining else '')
            break
        elif product_key in items_lower:
            items = re.sub(r'\b' + product_key + r'\b', product_value, items, flags=re.IGNORECASE)
            break

    # Capitalize item names properly (handles "6 chocolates" -> "6 Chocolates")
    def capitalize_items(text):
        words = text.split()
        result = []
        small_words = {'of', 'and', 'the', 'a', 'an', 'or', 'for', 'with'}
        for i, word in enumerate(words):
            # Skip numbers and units that should stay lowercase
            if word.isdigit() or word.lower() in ['lbs', 'lb', 'oz', 'kg', 'g', 'ml', 'l']:
                result.append(word)
            # Keep small words lowercase unless first word
            elif word.lower() in small_words and i > 0 and not words[i-1].isdigit():
                result.append(word.lower())
            # Capitalize first letter of other words
            elif word and word[0].islower():
                result.append(word[0].upper() + word[1:] if len(word) > 1 else word.upper())
            else:
                result.append(word)
        return ' '.join(result)

    items = capitalize_items(items)

    # Validate category
    valid_categories = ["Electronics", "Groceries", "Clothing", "Transportation",
                       "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"]
    category = expense.get("category", "Other")
    if category not in valid_categories:
        category = "Other"

    # Handle recurring expenses - add "Recurring" tag to category
    is_recurring = expense.get("is_recurring", False)
    recurring_interval = expense.get("recurring_interval")
    recurring_unit = expense.get("recurring_unit")

    if is_recurring and "Recurring" not in category:
        category = f"{category}, Recurring"

    # Validate amount
    try:
        amount = float(expense["amount"])
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except (ValueError, TypeError):
        raise ValueError(f"Invalid amount: {expense.get('amount')}")

    # Validate date format
    date = expense.get("date", today_str)
    if not re.match(r'\d{4}-\d{2}-\d{2}', str(date)):
        date = today_str

    return {
        "store": str(expense["store"]).strip(),
        "items": items,
        "category": category,
        "amount": amount,
        "date": date,
        "is_recurring": is_recurring,
        "recurring_interval": recurring_interval,
        "recurring_unit": recurring_unit
    }

def post_process_extraction(expenses: list, transcript: str) -> list:
    """Post-process extracted expenses to fix common issues"""
    cleaned = []
    for exp in expenses:
        # Fix items
        items = exp.get("items", "").strip()
        # Remove common prefixes
        items = re.sub(r'^(i\s+)?(bought|got|purchased|bought an|bought a|bought the)\s+', '', items, flags=re.IGNORECASE)
        # Remove articles
        items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
        # Capitalize properly
        if items:
            items = items[0].upper() + items[1:] if len(items) > 1 else items.upper()

        exp["items"] = items
        cleaned.append(exp)

    return cleaned

def extract_expense_simple(transcript: str):
    """Simple regex-based expense extraction as fallback when Groq is unavailable
    Returns a list of expense dicts if multiple items detected, otherwise a single dict"""
    transcript_lower = transcript.lower()

    # Extract store first (needed for all patterns)
    store = extract_store(transcript)
    date = parse_relative_date(transcript)

    # Detect if expense is recurring
    recurring_info = detect_recurring(transcript)

    # First, try to detect "$X worth of item" pattern (handles any number of items)
    # Pattern: "$17 worth of ice cream, $4 worth of strawberries, and $32 worth of chocolate"
    # Also handles "$X of item" without "worth"
    worth_of_pattern = r'\$(\d+(?:\.\d+)?)\s+(?:worth\s+)?(?:of\s+)?([a-zA-Z][a-zA-Z\s]*?)(?:,|\s+and\s+|\s+at\s+|\s+from\s+|\s+today|$)'
    worth_of_matches = re.findall(worth_of_pattern, transcript, re.IGNORECASE)

    if len(worth_of_matches) >= 2:
        # Found multiple items with "$X worth of item" pattern
        # Combine them into ONE expense with summed amount and comma-separated items
        all_items = []
        total_amount = 0.0

        for amount_str, item in worth_of_matches:
            item = item.strip()
            # Skip if item is empty or just whitespace
            if not item or item.lower() in ['and', 'at', 'from', 'the', 'a', 'an']:
                continue

            amount = parse_amount(amount_str)
            cleaned_item = clean_item_name(item, store)

            all_items.append(cleaned_item)
            total_amount += amount

        if all_items:
            # Combine all items into comma-separated string
            combined_items = ", ".join(all_items)
            # Use the category of the first item (or could detect most common)
            category = categorize_item(all_items[0], store)

            return {
                "store": store,
                "items": combined_items,
                "category": category,
                "amount": total_amount,
                "date": date,
                **recurring_info
            }

    # Try pattern: "item1 for $X and item2 for $Y" or "bought item1 for $X and item2 for $Y"
    multi_item_pattern = r'(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)\s+and\s+(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)'
    multi_match = re.search(multi_item_pattern, transcript_lower, re.IGNORECASE)

    if multi_match:
        # Found multiple items with individual prices - combine into ONE expense
        item1 = multi_match.group(1).strip()
        amount1_str = multi_match.group(2)
        item2 = multi_match.group(3).strip()
        amount2_str = multi_match.group(4)

        # Parse amounts
        amount1 = parse_amount(amount1_str)
        amount2 = parse_amount(amount2_str)

        # Clean up items (pass store name to remove it from item names)
        item1 = clean_item_name(item1, store)
        item2 = clean_item_name(item2, store)

        # Combine items and sum amounts
        combined_items = f"{item1}, {item2}"
        total_amount = amount1 + amount2
        category = categorize_item(item1, store)

        return {
            "store": store,
            "items": combined_items,
            "category": category,
            "amount": total_amount,
            "date": date,
            **recurring_info
        }

    # If no multi-item pattern, extract as single expense
    # Extract amount (look for $XX.XX or XX dollars)
    amount = None
    amount_patterns = [
        r'\$(\d+\.?\d*)',  # $45.50
        r'(\d+\.?\d*)\s*dollars?',  # 45.50 dollars
        r'for\s+(\d+\.?\d*)',  # for 45.50 or for 2350 (will be handled specially)
        r'(\d+\.?\d*)\s*bucks?',  # 45.50 bucks
        r'(\d+)\s*cent',  # 14 cent -> 0.14
        r'(\d+)\s*cents',  # 14 cents -> 0.14
        r'(\d+):(\d+)\s*(\d+)',  # 4:35 15 (misheard $45.50)
        r'(\d+)\s+(\d+)',  # 14 50 (could be $14.50)
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, transcript_lower)
        if match:
            try:
                if 'cent' in pattern:  # Handle cents
                    cents = float(match.group(1))
                    amount = cents / 100.0  # Convert cents to dollars
                    break
                elif ':' in pattern:  # Handle time-like format (4:35 15)
                    # Try to interpret as dollars: 4:35 15 -> 45.50 or 45.15
                    parts = match.groups()
                    if len(parts) == 3:
                        # Could be 4:35 15 -> 45.50 or 4:35 15 -> 45.15
                        # Take first two digits and last two as cents
                        amount = float(f"{parts[0]}{parts[1]}.{parts[2]}")
                    else:
                        amount = float(match.group(1))
                    break
                elif len(match.groups()) == 2:  # Handle "14 50" -> $14.50
                    # Check if second number is 2 digits (likely cents)
                    num1 = float(match.group(1))
                    num2 = float(match.group(2))
                    if num2 < 100:  # Likely cents
                        amount = num1 + (num2 / 100.0)
                    else:
                        amount = num1
                    break
                elif r'for\s+' in pattern:  # Handle "for 2350" -> $23.50
                    num_str = match.group(1)
                    # If it's a whole number (no decimal), check if it should be split
                    if '.' not in num_str:
                        num = int(num_str)
                        num_digits = len(num_str)
                        # If 3-5 digits and reasonable amount, likely dollars.cents format
                        # e.g., 2350 -> 23.50, 350 -> 3.50, 1234 -> 12.34
                        if 3 <= num_digits <= 5 and num < 100000:
                            # Split last 2 digits as cents
                            dollars = num // 100
                            cents = num % 100
                            amount = dollars + (cents / 100.0)
                        else:
                            amount = float(num)
                    else:
                        amount = float(num_str)
                    break
                else:
                    amount = float(match.group(1))
                    break
            except:
                pass

    # Extract store (look for "at [Store]" or "from [Store]")
    store = "Unknown Store"
    store_patterns = [
        r'at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',  # at Walmart, at Target
        r'from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',  # from Walmart
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+for',  # Walmart for
    ]
    for pattern in store_patterns:
        match = re.search(pattern, transcript)
        if match:
            store = match.group(1)
            break

    # Extract items - improved logic to avoid store names
    items = ""

    # First, identify the store name to exclude it from items
    store_lower = store.lower() if store != "Unknown Store" else ""

    # Pattern 1: Items after dash (e.g., "groceries - milk, bread, eggs")
    items_match = re.search(r'[-–—]\s*(.+?)(?:\s+for|\s+at|\s+from|\s+\$|$)', transcript, re.IGNORECASE)
    if items_match:
        items = items_match.group(1).strip()
        # Clean up: remove trailing store names or amounts
        items = re.sub(r'\s+(?:at|from|for)\s+.*$', '', items, flags=re.IGNORECASE)
        items = re.sub(r'\s+\$?\d+.*$', '', items)  # Remove trailing amounts

    # Pattern 2: Items before "at" or "from" (e.g., "bought laptop MacBook from Apple")
    if not items:
        # Look for "bought [item] from [store]" or "bought [item] at [store]"
        before_store = re.search(r'(?:bought|got|purchased|brought)\s+(?:(?:a|an|the|some)\s+)?(.+?)\s+(?:at|from)\s+', transcript, re.IGNORECASE)
        if before_store:
            text = before_store.group(1).strip()
            # Remove articles at the start
            text = re.sub(r'^\s*(a|an|the|some)\s+', '', text, flags=re.IGNORECASE)
            # Remove trailing "for" or amounts
            text = re.sub(r'\s+for\s+.*$', '', text, flags=re.IGNORECASE)
            text = re.sub(r'\s+\$?\d+.*$', '', text)
            # Remove the store name if it appears in the items
            if store_lower:
                text = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', text, flags=re.IGNORECASE)
            text = text.strip()
            if text and len(text) > 2:  # Make sure we have actual content
                items = text.strip()

    # Pattern 3: Items after "for" but before store (e.g., "spent $1000 for laptop at Apple")
    if not items:
        after_for = re.search(r'for\s+\$?\d+.*?\s+(.+?)(?:\s+at|\s+from|$)', transcript, re.IGNORECASE)
        if not after_for:
            after_for = re.search(r'for\s+(.+?)(?:\s+at|\s+from|\s+\$|$)', transcript, re.IGNORECASE)
        if after_for:
            text = after_for.group(1).strip()
            # Remove store names and amounts
            text = re.sub(r'\s+(?:at|from)\s+.*$', '', text, flags=re.IGNORECASE)
            text = re.sub(r'\s+\$?\d+.*$', '', text)
            # Remove the store name if it appears
            if store_lower:
                text = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', text, flags=re.IGNORECASE)
            text = text.strip()
            if text and len(text) > 2:
                items = text.strip()

    # Pattern 4: Extract item words that are NOT the store name
    if not items:
        # Common item keywords
        item_keywords = ['laptop', 'computer', 'macbook', 'iphone', 'ipad', 'phone', 'tablet',
                        'groceries', 'food', 'milk', 'bread', 'eggs', 'coffee', 'gas', 'gasoline',
                        'banana', 'bananas', 'book', 'books', 'shirt', 'shirts', 'shoes', 'pants', 'jacket']

        # Find item keywords in transcript
        found_items = []
        for keyword in item_keywords:
            if keyword in transcript_lower:
                # Make sure it's not part of the store name
                if store_lower and keyword in store_lower:
                    continue
                # Check if keyword appears before "from" or "at"
                keyword_pos = transcript_lower.find(keyword)
                store_marker_pos = min(
                    transcript_lower.find(' from ', keyword_pos),
                    transcript_lower.find(' at ', keyword_pos)
                )
                if store_marker_pos == -1:
                    store_marker_pos = len(transcript_lower)
                # If keyword is before store marker, it's likely an item
                if keyword_pos < store_marker_pos:
                    found_items.append(keyword)

        if found_items:
            # Take the first meaningful item (prefer longer/more specific ones)
            items = max(found_items, key=len).title()

    # Final cleanup: remove store name if it somehow got in
    if items and store_lower:
        items_clean = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', items, flags=re.IGNORECASE)
        items_clean = ' '.join(items_clean.split())  # Normalize whitespace
        if items_clean and len(items_clean) > 2:
            items = items_clean.strip()

    # Clean up items: remove extra whitespace, capitalize properly
    if items:
        items = ' '.join(items.split())  # Normalize whitespace
        # Don't capitalize if it's already a proper noun (like "MacBook")
        if items.lower() not in ['apple', 'google', 'microsoft', 'amazon', 'walmart', 'target', 'macbook', 'iphone', 'ipad']:
            items = items.title()

    # Extract categories based on items and store (can have multiple categories)
    categories = []
    transcript_lower = transcript.lower()
    items_lower = items.lower() if items else ""

    # Category mapping based on keywords
    category_keywords = {
        "Electronics": ["laptop", "computer", "macbook", "iphone", "ipad", "phone", "tablet", "tv", "television", "headphones", "speaker", "camera", "gaming", "console", "nintendo", "playstation", "xbox", "electronic", "device"],
        "Groceries": ["groceries", "milk", "bread", "eggs", "food", "banana", "bananas", "apple", "apples", "vegetables", "fruit", "fruits", "meat", "chicken", "beef", "pork", "fish", "dairy", "cheese", "yogurt", "produce"],
        "Clothing": ["shirt", "shirts", "pants", "jacket", "shoes", "sneakers", "dress", "jeans", "sweater", "hoodie", "clothes", "clothing", "apparel"],
        "Transportation": ["gas", "gasoline", "fuel", "uber", "lyft", "taxi", "bus", "train", "flight", "airline", "parking"],
        "Dining": ["restaurant", "cafe", "coffee", "lunch", "dinner", "breakfast", "pizza", "burger", "fast food", "takeout"],
        "Entertainment": ["movie", "cinema", "netflix", "spotify", "game", "games", "book", "books", "magazine", "subscription"],
        "Health": ["pharmacy", "medicine", "prescription", "vitamin", "supplement", "gym", "fitness", "doctor", "hospital"],
        "Home": ["furniture", "bed", "chair", "table", "sofa", "couch", "lamp", "decor", "kitchen", "appliance", "refrigerator", "washer", "dryer", "rent", "rental", "apartment", "house", "mortgage", "housing"],
        "Utilities": ["electric", "electricity", "water", "internet", "phone bill", "cable", "utility"],
        "Other": []
    }

    # Check for category matches - can match multiple categories
    matched_categories = set()
    for cat, keywords in category_keywords.items():
        if cat == "Other":
            continue  # Skip "Other" for now
        for keyword in keywords:
            if keyword in transcript_lower or keyword in items_lower:
                matched_categories.add(cat)
                break

    # If categories found, use them; otherwise try to infer from store
    if matched_categories:
        categories = sorted(list(matched_categories))  # Sort for consistency
    else:
        store_lower = store.lower() if store != "Unknown Store" else ""
        if any(word in store_lower for word in ["walmart", "target", "kroger", "safeway", "whole foods", "trader joe"]):
            categories = ["Groceries"]
        elif any(word in store_lower for word in ["apple", "best buy", "microcenter", "fry's"]):
            categories = ["Electronics"]
        elif any(word in store_lower for word in ["nike", "adidas", "h&m", "zara", "old navy"]):
            categories = ["Clothing"]
        elif any(word in store_lower for word in ["shell", "chevron", "bp", "exxon", "mobil"]):
            categories = ["Transportation"]
        else:
            categories = ["Other"]

    # Join multiple categories with comma
    category = ", ".join(categories) if categories else "Other"

    # Parse relative date from transcript (yesterday, tomorrow, etc.)
    date = parse_relative_date(transcript)

    return {
        "store": store,
        "items": items if items else "Various items",
        "category": category,
        "amount": amount,
        "date": date,
        **recurring_info
    }
