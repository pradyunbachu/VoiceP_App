# backend/tests/test_log_expense_tool.py
import pytest
import agent.handler_tools  # noqa: F401
from agent.tools import TOOL_REGISTRY, requires_confirmation


@pytest.mark.asyncio
async def test_log_expense_persists_and_returns_action(monkeypatch):
    captured = {}
    def fake_persist(user_id, *, store, amount, items="", category="Other", date=None,
                     is_recurring=False, recurring_interval=None, recurring_unit=None):
        captured.update(dict(user_id=user_id, store=store, amount=amount))
        return {"id": 7, "store": store, "amount": amount, "items": items,
                "category": category, "date": date or "2026-06-19"}
    monkeypatch.setattr("agent.handler_tools.persist_expense", fake_persist)

    td = TOOL_REGISTRY["log_expense"]
    res = await td.fn("u1", {"store": "Costco", "amount": 42.5, "items": "milk, eggs"}, "spent 42.50 at costco")
    assert captured["store"] == "Costco"
    assert res.action_type == "expense_logged"
    assert res.data["id"] == 7


@pytest.mark.asyncio
async def test_log_expense_passes_recurring_interval_and_unit(monkeypatch):
    captured = {}
    def fake_persist(user_id, *, store, amount, items="", category="Other", date=None,
                     is_recurring=False, recurring_interval=None, recurring_unit=None):
        captured.update(dict(is_recurring=is_recurring, recurring_interval=recurring_interval,
                             recurring_unit=recurring_unit))
        return {"id": 8, "store": store, "amount": amount, "items": items,
                "category": category, "date": date or "2026-06-19"}
    monkeypatch.setattr("agent.handler_tools.persist_expense", fake_persist)

    td = TOOL_REGISTRY["log_expense"]
    await td.fn("u1", {"store": "Netflix", "amount": 15, "recurring": True,
                       "recurring_interval": 1, "recurring_unit": "months"}, "I pay $15 monthly for Netflix")
    assert captured["is_recurring"] is True
    assert captured["recurring_interval"] == 1
    assert captured["recurring_unit"] == "months"


def test_log_expense_threshold_policy():
    td = TOOL_REGISTRY["log_expense"]
    assert td.policy == "threshold"
    assert requires_confirmation(td, {"amount": 250}) is True
    assert requires_confirmation(td, {"amount": 30}) is False
