# backend/tests/test_agent_runner.py
import json
import pytest

from agent.tools import ToolDef, ToolResult, TOOL_REGISTRY, register
from agent.runner import run_agent, execute_pending


# ---- Fake Groq plumbing -------------------------------------------------
class _FuncCall:
    def __init__(self, name, args): self.name = name; self.arguments = json.dumps(args)
class _ToolCall:
    def __init__(self, cid, name, args): self.id = cid; self.type = "function"; self.function = _FuncCall(name, args)
class _Msg:
    def __init__(self, content=None, tool_calls=None): self.content = content; self.tool_calls = tool_calls
class _Choice:
    def __init__(self, msg): self.message = msg
class _Resp:
    def __init__(self, msg): self.choices = [_Choice(msg)]

class FakeGroq:
    """Returns scripted responses in order."""
    def __init__(self, scripted): self._scripted = list(scripted); self.calls = []
    class _Chat:
        def __init__(self, outer): self._outer = outer
        class _Comp:
            def __init__(self, outer): self._outer = outer
            def create(self, **kwargs):
                self._outer.calls.append(kwargs)
                return self._outer._scripted.pop(0)
        @property
        def completions(self): return FakeGroq._Chat._Comp(self._outer)
    @property
    def chat(self): return FakeGroq._Chat(self)


def _spec(name, props=None):
    return {"type": "function", "function": {"name": name, "description": "x",
            "parameters": {"type": "object", "properties": props or {}}}}


@pytest.fixture
def reg(monkeypatch):
    """Isolated registry with one safe write tool that records calls."""
    captured = {}
    async def add_items(user_id, args, message):
        captured["user_id"] = user_id
        captured["items"] = args.get("items")
        return ToolResult(data={"added": args.get("items")}, summary="Added items", action_type="shopping_add")
    local = {"add_to_shopping_list": ToolDef(
        name="add_to_shopping_list", spec=_spec("add_to_shopping_list",
        {"items": {"type": "array", "items": {"type": "string"}}}),
        fn=add_items, policy="none")}
    return local, [t.spec for t in local.values()], captured


@pytest.mark.asyncio
async def test_runner_executes_tool_then_replies(reg):
    local, specs, captured = reg
    client = FakeGroq([
        _Resp(_Msg(tool_calls=[_ToolCall("c1", "add_to_shopping_list", {"items": ["milk"]})])),
        _Resp(_Msg(content="Added milk to your list.")),
    ])
    result = await run_agent("u1", "add milk", client=client, tool_registry=local, tool_specs=specs)
    assert captured["user_id"] == "u1"
    assert captured["items"] == ["milk"]
    assert result.reply == "Added milk to your list."
    assert result.actions[0].type == "shopping_add"
    assert result.pending == []


@pytest.mark.asyncio
async def test_runner_plain_answer_no_tools(reg):
    local, specs, _ = reg
    client = FakeGroq([_Resp(_Msg(content="A cup of butter is 16 tbsp."))])
    result = await run_agent("u1", "how many tbsp in a cup of butter?",
                             client=client, tool_registry=local, tool_specs=specs)
    assert result.reply == "A cup of butter is 16 tbsp."
    assert result.actions == []


@pytest.mark.asyncio
async def test_execute_pending_one_failing_tool_does_not_crash(reg):
    """If one pending tool raises, the call must not crash and a second pending
    tool in the same batch must still execute and appear in result.actions.

    Both tools use policy='always' so they pass the confirm-gate guard in
    execute_pending (policy='none' tools are skipped there by design).
    """
    local, _, _ = reg

    async def boom(user_id, args, msg):
        raise RuntimeError("simulated tool failure")

    local["bad_tool"] = ToolDef(
        name="bad_tool",
        spec=_spec("bad_tool"),
        fn=boom,
        policy="always",
    )
    # Override add_to_shopping_list to require confirmation so it runs in execute_pending
    async def add_items(user_id, args, message):
        return ToolResult(data={"added": args.get("items")}, summary="Added items", action_type="shopping_add")
    local["add_to_shopping_list"] = ToolDef(
        name="add_to_shopping_list",
        spec=_spec("add_to_shopping_list", {"items": {"type": "array", "items": {"type": "string"}}}),
        fn=add_items,
        policy="always",
    )

    pending = [
        {"id": "p1", "tool": "bad_tool", "args": {}, "summary": "Do the bad thing"},
        {"id": "p2", "tool": "add_to_shopping_list", "args": {"items": ["eggs"]}, "summary": "Add eggs"},
    ]

    # Must not raise
    result = await execute_pending("u1", pending, ["p1", "p2"], tool_registry=local)

    # The successful action must be present
    assert any(a.type == "shopping_add" for a in result.actions), \
        "successful action must appear in result.actions even when a prior tool failed"


@pytest.mark.asyncio
async def test_runner_iteration_cap(reg):
    local, specs, _ = reg
    # Always returns a tool call -> would loop forever without the cap.
    looping = [_Resp(_Msg(tool_calls=[_ToolCall(f"c{i}", "add_to_shopping_list", {"items": ["x"]})])) for i in range(10)]
    client = FakeGroq(looping)
    result = await run_agent("u1", "spam", client=client, tool_registry=local, tool_specs=specs, max_iters=3)
    # 3 iterations consumed; returns a graceful fallback reply, no crash.
    assert isinstance(result.reply, str) and result.reply
    assert len(client.calls) == 3


# --- Resilience: retry on Groq tool_use_failed + null-arg coercion -----------

class _FlakyGroq:
    """Yields scripted items in order; an Exception item is raised on that call."""
    def __init__(self, script): self._script = list(script); self.calls = 0
    @property
    def chat(self): return self
    @property
    def completions(self): return self
    def create(self, **kwargs):
        self.calls += 1
        item = self._script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@pytest.mark.asyncio
async def test_runner_retries_on_tool_use_failed(reg):
    local, specs, captured = reg
    err = Exception("Error code: 400 - {'error': {'code': 'tool_use_failed'}}")
    client = _FlakyGroq([
        err,  # first create() fails -> _create_completion retries
        _Resp(_Msg(tool_calls=[_ToolCall("c1", "add_to_shopping_list", {"items": ["milk"]})])),
        _Resp(_Msg(content="Added milk.")),
    ])
    result = await run_agent("u1", "add milk", client=client, tool_registry=local, tool_specs=specs)
    assert result.reply == "Added milk."
    assert captured["items"] == ["milk"]
    assert client.calls == 3  # 1 failed + retry(tool turn) + final reply


@pytest.mark.asyncio
async def test_runner_non_tool_error_is_not_retried(reg):
    local, specs, _ = reg
    boom = Exception("some other 500 error")
    client = _FlakyGroq([boom])
    with pytest.raises(Exception, match="some other 500 error"):
        await run_agent("u1", "hi", client=client, tool_registry=local, tool_specs=specs)
    assert client.calls == 1  # non-tool errors propagate immediately (-> caller's fallback)


@pytest.mark.asyncio
async def test_runner_coerces_null_tool_args_to_dict(reg):
    local, specs, captured = reg
    # _ToolCall json.dumps(None) -> "null"; run_agent must coerce to {} so the
    # tool's args.get(...) does not crash on None.
    client = FakeGroq([
        _Resp(_Msg(tool_calls=[_ToolCall("c1", "add_to_shopping_list", None)])),
        _Resp(_Msg(content="ok")),
    ])
    result = await run_agent("u1", "add stuff", client=client, tool_registry=local, tool_specs=specs)
    assert result.reply == "ok"
    assert captured["user_id"] == "u1"   # tool ran without crashing
    assert captured["items"] is None     # args coerced to {}, .get returns None
