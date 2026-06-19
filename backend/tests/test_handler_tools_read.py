# backend/tests/test_handler_tools_read.py
import pytest
import agent.handler_tools  # noqa: F401 — triggers registration
from agent.tools import TOOL_REGISTRY


@pytest.mark.asyncio
async def test_read_pantry_calls_handler(monkeypatch):
    seen = {}
    async def fake_handle(user_id, sub_intent, entities):
        seen["args"] = (user_id, sub_intent, entities)
        return {"items": [{"name": "eggs", "quantity": 12}]}
    monkeypatch.setattr("agent.handler_tools.handle_pantry_query", fake_handle)

    td = TOOL_REGISTRY["read_pantry"]
    res = await td.fn("u1", {"filter": "low_stock"}, "what's running low?")
    assert seen["args"][0] == "u1"
    assert seen["args"][1] == "low_stock"
    assert res.data["items"][0]["name"] == "eggs"
    assert td.policy == "none"


def test_read_tools_registered():
    for name in ["read_pantry", "read_expenses", "read_budgets",
                 "read_shopping_list", "check_reminder", "recall_meal"]:
        assert name in TOOL_REGISTRY
