import pytest
from agent.tools import ToolDef, ToolResult, requires_confirmation


def _spec(name):
    return {"type": "function", "function": {"name": name, "description": "x",
            "parameters": {"type": "object", "properties": {}}}}


async def _noop(user_id, args, message):
    return ToolResult(data={}, summary="ok")


def test_policy_none_never_confirms():
    td = ToolDef(name="t", spec=_spec("t"), fn=_noop, policy="none")
    assert requires_confirmation(td, {}) is False


def test_policy_always_confirms():
    td = ToolDef(name="t", spec=_spec("t"), fn=_noop, policy="always")
    assert requires_confirmation(td, {}) is True


def test_policy_threshold_confirms_above_limit():
    td = ToolDef(name="log_expense", spec=_spec("log_expense"), fn=_noop,
                 policy="threshold", threshold_field="amount", threshold=100.0)
    assert requires_confirmation(td, {"amount": 250}) is True
    assert requires_confirmation(td, {"amount": 20}) is False
    assert requires_confirmation(td, {}) is False  # missing -> treat as safe
