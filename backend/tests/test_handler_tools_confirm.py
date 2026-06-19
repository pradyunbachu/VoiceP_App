# backend/tests/test_handler_tools_confirm.py
import pytest
import agent.handler_tools  # noqa: F401
from agent.tools import TOOL_REGISTRY


def test_confirm_tools_registered_with_always_policy():
    for name in ["delete_expense", "clear_shopping_list", "share_list"]:
        assert name in TOOL_REGISTRY, name
        assert TOOL_REGISTRY[name].policy == "always"


@pytest.mark.asyncio
async def test_clear_shopping_list_calls_handler(monkeypatch):
    called = {"n": 0}
    async def fake_clear(user_id):
        called["n"] += 1
        return {"cleared": True}
    monkeypatch.setattr("agent.handler_tools.handle_shopping_clear", fake_clear)
    td = TOOL_REGISTRY["clear_shopping_list"]
    res = await td.fn("u1", {}, "")
    assert called["n"] == 1
    assert res.action_type == "shopping_cleared"
