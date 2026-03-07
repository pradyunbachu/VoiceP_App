"""Receipt OCR parsing via Groq Vision API.

Accepts a base64-encoded receipt image, sends it to Groq's multimodal
model (Llama 4 Scout 17B), and extracts structured expense data:
store name, consolidated item list, total amount, date, and category.

  parse_receipt_with_vision — Main entry point. Strips data-URL prefix,
      calls the Vision API, and validates the JSON response.
  validate_receipt_data     — Normalizes store/items/amount/date/category
      and rejects invalid entries (e.g. amount <= 0).
  normalize_date            — Converts a variety of date formats (US, EU,
      named months) to YYYY-MM-DD.
"""

# ============================================================================
# RECEIPT PARSING SERVICE
# ============================================================================

import re
import json
from datetime import datetime
from typing import Optional
from config import groq_client
import logging

logger = logging.getLogger(__name__)

VISION_RECEIPT_PROMPT = """You are a receipt parser. Look at this receipt image and extract the expense information.

OUTPUT: A single JSON object (no markdown, no explanation, just valid JSON) with:
{
  "store": "Store name (from receipt header)",
  "items": "Comma-separated item names (product names only, no prices or quantities)",
  "amount": total_amount_as_number,
  "date": "YYYY-MM-DD (from receipt, or null if not visible)",
  "category": "Category from: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other"
}

RULES:
- Store name is usually at top in larger text or stylized font
- IMPORTANT: Consolidate line items into logical products or menu items. Do NOT list every individual component, modifier, topping, or add-on separately. For example:
  - Subway receipt with "Italian Herbs & Cheese, Turkey, Lettuce, Tomato, Mayo" → "Turkey Sub"
  - Starbucks receipt with "Iced, Oat Milk, Vanilla, Latte" → "Iced Vanilla Oat Milk Latte"
  - Chipotle receipt with "Burrito, Chicken, Rice, Beans, Salsa, Guac" → "Chicken Burrito"
  - Pizza receipt with "Large, Pepperoni, Extra Cheese, Mushrooms" → "Large Pepperoni Pizza"
  - If there are separate standalone items (drinks, sides, desserts), list those as their own items
- Use the TOTAL amount (not subtotal, not individual item prices)
- If multiple totals, use the final/grand total
- Extract date if visible (various formats)
- Infer category from store name and items
- Items should be product names only, no quantities or prices
- If store name unclear, use "Unknown Store"
- Amount must be a number (no $ sign, no commas)"""


def parse_receipt_with_vision(image_base64: str) -> Optional[dict]:
    """
    Parse receipt image using Groq Vision API.
    Returns a dict with store, items, amount, date, category or None on failure.
    """
    if not groq_client:
        logger.warning("Groq client not initialized")
        return None

    try:
        # Strip data URL prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        logger.info("Sending image to Groq Vision API (size: %d chars)", len(image_base64))

        response = groq_client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": VISION_RECEIPT_PROMPT
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.1,
            max_tokens=500,
            timeout=30.0  # 30 second timeout
        )

        logger.info("Groq Vision API response received")

        result_text = response.choices[0].message.content.strip()

        # Remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = re.sub(r'^```(?:json)?\s*', '', result_text)
            result_text = re.sub(r'\s*```$', '', result_text)

        parsed = json.loads(result_text)

        if not isinstance(parsed, dict):
            return None

        return validate_receipt_data(parsed)

    except json.JSONDecodeError as e:
        logger.error("JSON parsing error: %s", e)
        logger.debug("Raw response: %s", result_text)
        return None
    except TimeoutError:
        logger.error("Groq API request timed out after 30 seconds")
        return None
    except Exception as e:
        logger.error("Groq vision receipt parsing error: %s: %s", type(e).__name__, e)
        return None


def validate_receipt_data(data: dict) -> Optional[dict]:
    """Validate and normalize parsed receipt data."""
    try:
        store = str(data.get("store", "Unknown Store")).strip() or "Unknown Store"

        items = str(data.get("items", "")).strip() or "Receipt items"
        items = re.sub(r'\s+', ' ', items)

        amount = data.get("amount")
        if amount is None:
            return None
        if isinstance(amount, str):
            amount = amount.replace("$", "").replace(",", "").strip()
        amount = float(amount)
        if amount <= 0:
            return None

        date = data.get("date")
        if date and date != "null":
            date = normalize_date(str(date))
        else:
            date = None

        valid_categories = [
            "Electronics", "Groceries", "Clothing", "Transportation",
            "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"
        ]
        category = str(data.get("category", "Other")).strip()
        if category not in valid_categories:
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
        logger.error("Receipt validation error: %s", e)
        return None


def normalize_date(date_str: str) -> Optional[str]:
    """Normalize various date formats to YYYY-MM-DD."""
    if not date_str:
        return None

    date_str = date_str.strip()

    formats = [
        "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%d/%m/%y",
        "%m-%d-%Y", "%m-%d-%y", "%d-%m-%Y", "%d-%m-%y",
        "%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str, fmt)
            return parsed.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None
