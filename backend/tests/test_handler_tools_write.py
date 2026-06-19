# backend/tests/test_handler_tools_write.py
import pytest
import agent.handler_tools  # noqa: F401
from agent.tools import TOOL_REGISTRY


@pytest.mark.asyncio
async def test_add_to_shopping_list_passes_items(monkeypatch):
    seen = {}
    async def fake_add(user_id, entities, message):
        seen["entities"] = entities
        return {"added": entities.get("shopping_items")}
    monkeypatch.setattr("agent.handler_tools.handle_shopping_list_add", fake_add)

    td = TOOL_REGISTRY["add_to_shopping_list"]
    res = await td.fn("u1", {"items": ["milk", "eggs"]}, "add milk and eggs")
    assert seen["entities"]["shopping_items"] == ["milk", "eggs"]
    assert res.action_type == "shopping_add"


@pytest.mark.asyncio
async def test_remove_pantry_items_calls_handler_once_per_string(monkeypatch):
    calls = []
    async def fake_remove(user_id, entities, message):
        calls.append(entities["item_name"])
        return {"removed_count": 1, "item_name": entities["item_name"]}
    monkeypatch.setattr("agent.handler_tools.handle_pantry_remove", fake_remove)

    td = TOOL_REGISTRY["remove_pantry_items"]
    res = await td.fn("u1", {"items": ["chicken", "rice"]}, "remove chicken and rice")

    assert len(calls) == 2, f"Expected 2 handler calls, got {len(calls)}"
    assert calls[0] == "chicken", f"First call item_name should be 'chicken', got {calls[0]!r}"
    assert calls[1] == "rice", f"Second call item_name should be 'rice', got {calls[1]!r}"
    assert all(isinstance(c, str) for c in calls), "Each item_name passed to handler must be a string"
    assert res.action_type == "pantry_remove"


def test_safe_write_tools_registered_and_policy_none():
    for name in ["add_pantry_items", "remove_pantry_items", "add_to_shopping_list",
                 "remove_from_shopping_list", "suggest_meals", "meal_plan_week",
                 "budget_meal", "suggest_shopping", "set_budget", "mark_recurring", "cook_deduct"]:
        assert name in TOOL_REGISTRY, name
        assert TOOL_REGISTRY[name].policy == "none"
