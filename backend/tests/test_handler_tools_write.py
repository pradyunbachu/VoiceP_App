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


def test_safe_write_tools_registered_and_policy_none():
    for name in ["add_pantry_items", "remove_pantry_items", "add_to_shopping_list",
                 "remove_from_shopping_list", "suggest_meals", "meal_plan_week",
                 "budget_meal", "suggest_shopping", "set_budget", "mark_recurring", "cook_deduct"]:
        assert name in TOOL_REGISTRY, name
        assert TOOL_REGISTRY[name].policy == "none"
