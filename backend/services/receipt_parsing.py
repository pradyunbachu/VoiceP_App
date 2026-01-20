# ============================================================================
# RECEIPT PARSING SERVICE
# ============================================================================
# Uses Groq LLM to parse OCR text from receipts and extract expense data.
# ============================================================================

import re
import json
from datetime import datetime
from typing import Optional
from config import groq_client

RECEIPT_PARSING_PROMPT = """Extract expense data from this receipt OCR text.

OUTPUT: A single JSON object (no markdown, no explanation, just valid JSON) with:
{
  "store": "Store name (from receipt header)",
  "items": "Comma-separated item names (product names only, no prices)",
  "amount": total_amount_as_number,
  "date": "YYYY-MM-DD (from receipt, or null if not visible)",
  "category": "Category from: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other"
}

RULES:
- Store name is usually at top in larger text or all caps
- Use the TOTAL amount (not subtotal, not individual item prices)
- If multiple totals, use the final/grand total
- Extract date if visible (various formats like MM/DD/YY, DD-MM-YYYY, etc.)
- Infer category from store name and items purchased
- Items should be product names only, no quantities or prices
- If store name unclear, use "Unknown Store"
- Amount must be a number (no $ sign, no commas)

OCR TEXT:
"""

def parse_receipt_with_groq(ocr_text: str) -> Optional[dict]:
    """
    Parse receipt OCR text using Groq LLM.
    Returns a dict with store, items, amount, date, category or None on failure.
    """
    if not groq_client:
        return None

    if not ocr_text or len(ocr_text.strip()) < 10:
        return None

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "You are a receipt parser. Extract expense information from OCR text and return ONLY valid JSON. No markdown, no explanation, just the JSON object."
                },
                {
                    "role": "user",
                    "content": RECEIPT_PARSING_PROMPT + ocr_text
                }
            ],
            temperature=0.1,
            max_tokens=500
        )

        result_text = response.choices[0].message.content.strip()

        # Try to extract JSON from the response
        # Handle case where response might be wrapped in markdown code blocks
        if result_text.startswith("```"):
            # Remove markdown code blocks
            result_text = re.sub(r'^```(?:json)?\s*', '', result_text)
            result_text = re.sub(r'\s*```$', '', result_text)

        # Parse the JSON
        parsed = json.loads(result_text)

        # Validate required fields
        if not isinstance(parsed, dict):
            return None

        # Normalize and validate the result
        return validate_receipt_data(parsed)

    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        print(f"Raw response: {result_text}")
        return None
    except Exception as e:
        print(f"Groq receipt parsing error: {e}")
        return None


def validate_receipt_data(data: dict) -> Optional[dict]:
    """
    Validate and normalize parsed receipt data.
    """
    try:
        # Store - required
        store = str(data.get("store", "Unknown Store")).strip()
        if not store:
            store = "Unknown Store"

        # Items - required
        items = str(data.get("items", "")).strip()
        if not items:
            items = "Receipt items"
        # Clean up items
        items = re.sub(r'\s+', ' ', items)  # Normalize whitespace

        # Amount - required and must be positive
        amount = data.get("amount")
        if amount is None:
            return None
        try:
            # Handle string amounts with $ or commas
            if isinstance(amount, str):
                amount = amount.replace("$", "").replace(",", "").strip()
            amount = float(amount)
            if amount <= 0:
                return None
        except (ValueError, TypeError):
            return None

        # Date - optional, normalize to YYYY-MM-DD
        date = data.get("date")
        if date and date != "null":
            date = normalize_date(str(date))
        else:
            date = None

        # Category - validate against allowed list
        valid_categories = [
            "Electronics", "Groceries", "Clothing", "Transportation",
            "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"
        ]
        category = str(data.get("category", "Other")).strip()
        if category not in valid_categories:
            # Try to match partial
            category_lower = category.lower()
            matched = False
            for valid_cat in valid_categories:
                if valid_cat.lower() in category_lower or category_lower in valid_cat.lower():
                    category = valid_cat
                    matched = True
                    break
            if not matched:
                category = "Other"

        return {
            "store": store,
            "items": items,
            "amount": round(amount, 2),
            "date": date,
            "category": category
        }

    except Exception as e:
        print(f"Receipt validation error: {e}")
        return None


def normalize_date(date_str: str) -> Optional[str]:
    """
    Normalize various date formats to YYYY-MM-DD.
    """
    if not date_str:
        return None

    date_str = date_str.strip()

    # Common date formats to try
    formats = [
        "%Y-%m-%d",      # 2024-01-15
        "%m/%d/%Y",      # 01/15/2024
        "%m/%d/%y",      # 01/15/24
        "%d/%m/%Y",      # 15/01/2024
        "%d/%m/%y",      # 15/01/24
        "%m-%d-%Y",      # 01-15-2024
        "%m-%d-%y",      # 01-15-24
        "%d-%m-%Y",      # 15-01-2024
        "%d-%m-%y",      # 15-01-24
        "%B %d, %Y",     # January 15, 2024
        "%b %d, %Y",     # Jan 15, 2024
        "%d %B %Y",      # 15 January 2024
        "%d %b %Y",      # 15 Jan 2024
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None


def fallback_receipt_parsing(ocr_text: str) -> Optional[dict]:
    """
    Fallback regex-based receipt parsing when Groq is unavailable.
    """
    if not ocr_text or len(ocr_text.strip()) < 10:
        return None

    ocr_lower = ocr_text.lower()

    # Try to extract store name (usually at top, often in caps)
    store = "Unknown Store"
    lines = ocr_text.strip().split('\n')
    for line in lines[:5]:  # Check first 5 lines
        line = line.strip()
        if len(line) > 2 and len(line) < 50:
            # Skip lines that look like addresses or phone numbers
            if re.search(r'\d{3}[-.]?\d{3}[-.]?\d{4}', line):  # Phone
                continue
            if re.search(r'\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd)', line, re.I):  # Address
                continue
            # Use first reasonable line as store name
            store = line.strip()
            break

    # Try to extract total amount
    amount = None
    total_patterns = [
        r'(?:total|grand\s*total|amount\s*due|balance\s*due)[:\s]*\$?(\d+\.?\d*)',
        r'\$(\d+\.\d{2})\s*$',  # Amount at end of line
        r'total[:\s]*(\d+\.\d{2})',
    ]

    for pattern in total_patterns:
        matches = re.findall(pattern, ocr_lower)
        if matches:
            try:
                # Take the last match (usually the final total)
                amount = float(matches[-1])
                if amount > 0:
                    break
            except ValueError:
                continue

    if amount is None:
        return None

    # Try to extract date
    date = None
    date_patterns = [
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'(\d{4}[/-]\d{1,2}[/-]\d{1,2})',
    ]
    for pattern in date_patterns:
        match = re.search(pattern, ocr_text)
        if match:
            date = normalize_date(match.group(1))
            if date:
                break

    # Extract item names (lines that look like products)
    items = []
    for line in lines:
        line = line.strip()
        # Skip short lines, totals, and numeric-only lines
        if len(line) < 3:
            continue
        if re.search(r'^(sub)?total|tax|change|cash|credit|debit|balance', line, re.I):
            continue
        if re.match(r'^[\d\s.$,]+$', line):  # Only numbers/prices
            continue
        # Looks like a product line
        if re.match(r'^[A-Za-z]', line):
            # Remove price from end
            item = re.sub(r'\s*\$?\d+\.?\d*\s*$', '', line).strip()
            if item and len(item) > 2:
                items.append(item)

    items_str = ", ".join(items[:10]) if items else "Receipt items"  # Limit to 10 items

    # Infer category from store/items
    category = infer_category(store, items_str)

    return {
        "store": store[:100],  # Limit length
        "items": items_str[:500],  # Limit length
        "amount": round(amount, 2),
        "date": date,
        "category": category
    }


def infer_category(store: str, items: str) -> str:
    """
    Infer expense category from store name and items.
    """
    text = (store + " " + items).lower()

    category_keywords = {
        "Groceries": ["walmart", "target", "kroger", "safeway", "whole foods", "trader joe",
                     "grocery", "supermarket", "food", "produce", "dairy", "meat", "vegetable"],
        "Dining": ["restaurant", "cafe", "coffee", "starbucks", "mcdonald", "burger", "pizza",
                  "chipotle", "subway", "wendy", "taco", "diner", "grill", "kitchen"],
        "Electronics": ["best buy", "apple", "amazon", "micro center", "electronics", "computer",
                       "phone", "laptop", "tablet", "tv", "gaming"],
        "Clothing": ["nike", "adidas", "h&m", "zara", "gap", "old navy", "clothing", "apparel",
                    "shoes", "shirt", "pants", "dress"],
        "Transportation": ["shell", "chevron", "exxon", "mobil", "bp", "gas", "fuel", "uber", "lyft"],
        "Health": ["cvs", "walgreens", "pharmacy", "medicine", "drug", "vitamin", "supplement"],
        "Entertainment": ["cinema", "theater", "movie", "netflix", "spotify", "game", "ticket"],
        "Home": ["home depot", "lowe's", "ikea", "furniture", "hardware", "bed bath"],
        "Utilities": ["electric", "water", "gas bill", "internet", "phone bill", "utility"],
    }

    for category, keywords in category_keywords.items():
        for keyword in keywords:
            if keyword in text:
                return category

    return "Other"
