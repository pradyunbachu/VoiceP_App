"""Tests for expense auto-categorization.

Root cause (from a real bug): the chat agent's `log_expense` tool didn't tell
the LLM which categories exist, and defaulted an omitted category to "Other".
A Costco grocery run therefore saved as "Other". These tests pin:
  1. the deterministic categorizer recognizes grocery stores + items, and
  2. the log_expense tool advertises the category enum and derives a category
     (not "Other") when the LLM omits one.
"""
import pytest
import agent.handler_tools  # noqa: F401  (registers tools into TOOL_REGISTRY)
from agent.tools import TOOL_REGISTRY
from services.text_processing import categorize_item, categorize_items


# --- deterministic categorizer -------------------------------------------
def test_grocery_store_maps_to_groceries():
    # Costco is a grocery/warehouse store — was previously "Other".
    assert categorize_item("chips", "Costco") == "Groceries"


def test_categorize_items_costco_basket():
    assert categorize_items("chips, croissants, water, mint, cauliflower", "Costco") == "Groceries"


def test_categorize_items_target_basket():
    assert categorize_items("Cheetos, Candy, Apples, Potatoes", "Target") == "Groceries"


def test_item_keyword_beats_store():
    # A laptop at a grocery store is still Electronics.
    assert categorize_items("laptop", "Costco") == "Electronics"


def test_unknown_store_and_items_falls_back_to_other():
    assert categorize_items("mystery gadget", "Some Random Shop") == "Other"


# --- log_expense tool advertises categories to the LLM -------------------
def test_log_expense_spec_category_has_enum_and_description():
    props = TOOL_REGISTRY["log_expense"].spec["function"]["parameters"]["properties"]
    cat = props["category"]
    assert "enum" in cat and "Groceries" in cat["enum"]
    assert cat.get("description"), "category needs a description so the LLM classifies"


# --- defense in depth: omitted category is derived, not dumped to Other ---
@pytest.mark.asyncio
async def test_log_expense_derives_category_when_omitted(monkeypatch):
    captured = {}

    def fake_persist(user_id, **kw):
        captured.update(kw)
        return {"store": kw.get("store"), "amount": kw.get("amount")}

    monkeypatch.setattr("agent.handler_tools.persist_expense", fake_persist)
    td = TOOL_REGISTRY["log_expense"]
    await td.fn("u1", {"store": "Costco", "amount": 51,
                       "items": "chips, croissants, water, mint, cauliflower"}, "log it")
    assert captured["category"] == "Groceries"


@pytest.mark.asyncio
async def test_log_expense_respects_explicit_category(monkeypatch):
    captured = {}

    def fake_persist(user_id, **kw):
        captured.update(kw)
        return {}

    monkeypatch.setattr("agent.handler_tools.persist_expense", fake_persist)
    td = TOOL_REGISTRY["log_expense"]
    await td.fn("u1", {"store": "Costco", "amount": 51, "items": "chips",
                       "category": "Dining"}, "x")
    assert captured["category"] == "Dining"
