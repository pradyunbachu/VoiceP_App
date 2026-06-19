# backend/tests/test_agent_confirmation.py
import json
import pytest

from agent.tools import ToolDef, ToolResult
from agent.runner import run_agent, execute_pending
from tests.test_agent_runner import FakeGroq, _Resp, _Msg, _ToolCall, _spec


@pytest.fixture
def delete_reg():
    state = {"deleted": False}
    async def delete_expense(user_id, args, message):
        state["deleted"] = True
        return ToolResult(data={"ref": args.get("ref")}, summary="Deleted expense", action_type="expense_deleted")
    local = {"delete_expense": ToolDef(
        name="delete_expense", spec=_spec("delete_expense", {"ref": {"type": "string"}}),
        fn=delete_expense, policy="always")}
    return local, [t.spec for t in local.values()], state


@pytest.mark.asyncio
async def test_destructive_tool_proposes_not_executes(delete_reg):
    local, specs, state = delete_reg
    client = FakeGroq([
        _Resp(_Msg(tool_calls=[_ToolCall("c1", "delete_expense", {"ref": "last"})])),
        _Resp(_Msg(content="Want me to delete your last expense?")),
    ])
    result = await run_agent("u1", "delete my last expense", client=client,
                             tool_registry=local, tool_specs=specs)
    assert state["deleted"] is False                 # NOT executed yet
    assert len(result.pending) == 1
    assert result.pending[0].tool == "delete_expense"


@pytest.mark.asyncio
async def test_execute_pending_runs_the_action(delete_reg):
    local, _, state = delete_reg
    pending = [{"id": "p1", "tool": "delete_expense", "args": {"ref": "last"}, "summary": "Delete?"}]
    result = await execute_pending("u1", pending, ["p1"], tool_registry=local)
    assert state["deleted"] is True
    assert result.actions[0].type == "expense_deleted"
