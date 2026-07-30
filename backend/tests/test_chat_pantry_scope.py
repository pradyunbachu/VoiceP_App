"""Tests for pantry-aware voice/chat (Task A4):
  - chat request models accept optional group_id.
  - pantry handler writes stamp group_id and reads scope by it.
  - run_agent threads group_id down to group_id-aware tool fns (and leaves
    legacy 3-arg tool fns untouched).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import pytest

from schemas import ChatRequest, ChatConfirmRequest
from agent.tools import ToolDef, ToolResult
from agent.runner import run_agent


# --- Schema -----------------------------------------------------------------

def test_chat_request_accepts_group_id():
    req = ChatRequest(message="add milk", history=[], group_id=42)
    assert req.group_id == 42


def test_chat_request_group_id_defaults_none():
    assert ChatRequest(message="add milk").group_id is None


def test_chat_confirm_accepts_group_id():
    req = ChatConfirmRequest(ids=["p1"], pending=[{"id": "p1"}], group_id=42)
    assert req.group_id == 42


# --- Handler write scoping --------------------------------------------------

class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store):
        self.store = store

    def select(self, *a, **k):
        return self

    def eq(self, *a):
        return self

    def is_(self, *a):
        return self

    def insert(self, row):
        self.store["inserts"].append(row)
        return _Result([{**row, "id": 1}])

    def execute(self):
        return _Result([])


class _FakeSupabase:
    def __init__(self):
        self.store = {"inserts": []}

    def table(self, name):
        return _Query(self.store)


@pytest.mark.asyncio
async def test_pantry_add_stamps_group_id(monkeypatch):
    import handlers.pantry_handler as ph
    fake = _FakeSupabase()
    monkeypatch.setattr(ph, "supabase", fake)

    await ph.handle_pantry_add("user-1", {"pantry_items": ["milk"]}, "add milk", group_id=42)
    assert fake.store["inserts"], "expected an insert"
    assert fake.store["inserts"][-1]["group_id"] == 42


# --- Agent threading --------------------------------------------------------

class _FuncCall:
    def __init__(self, name, args):
        self.name = name
        self.arguments = json.dumps(args)


class _ToolCall:
    def __init__(self, cid, name, args):
        self.id = cid
        self.type = "function"
        self.function = _FuncCall(name, args)


class _Msg:
    def __init__(self, content=None, tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls


class _Choice:
    def __init__(self, msg):
        self.message = msg


class _Resp:
    def __init__(self, msg):
        self.choices = [_Choice(msg)]


class _FakeGroq:
    def __init__(self, scripted):
        self._scripted = list(scripted)

    class _Chat:
        def __init__(self, outer):
            self._outer = outer

        class _Comp:
            def __init__(self, outer):
                self._outer = outer

            def create(self, **kwargs):
                return self._outer._scripted.pop(0)

        @property
        def completions(self):
            return _FakeGroq._Chat._Comp(self._outer)

    @property
    def chat(self):
        return _FakeGroq._Chat(self)


def _spec(name, props=None):
    return {"type": "function", "function": {"name": name, "description": "x",
            "parameters": {"type": "object", "properties": props or {}}}}


@pytest.mark.asyncio
async def test_run_agent_threads_group_id_to_pantry_tool():
    captured = {}

    async def add_pantry(user_id, args, message, group_id=None):
        captured["group_id"] = group_id
        return ToolResult(data={}, summary="added", action_type="pantry_add")

    local = {"add_pantry_items": ToolDef(
        name="add_pantry_items", spec=_spec("add_pantry_items"),
        fn=add_pantry, policy="none")}
    specs = [t.spec for t in local.values()]
    client = _FakeGroq([
        _Resp(_Msg(tool_calls=[_ToolCall("c1", "add_pantry_items", {})])),
        _Resp(_Msg(content="Done.")),
    ])
    await run_agent("u1", "add milk", client=client, tool_registry=local,
                    tool_specs=specs, group_id=42)
    assert captured["group_id"] == 42


@pytest.mark.asyncio
async def test_run_agent_leaves_legacy_tool_untouched():
    """A 3-arg tool fn must still be callable (no group_id kwarg forced on it)."""
    captured = {}

    async def legacy(user_id, args, message):
        captured["ok"] = True
        return ToolResult(data={}, summary="ok", action_type=None)

    local = {"legacy": ToolDef(name="legacy", spec=_spec("legacy"), fn=legacy, policy="none")}
    specs = [t.spec for t in local.values()]
    client = _FakeGroq([
        _Resp(_Msg(tool_calls=[_ToolCall("c1", "legacy", {})])),
        _Resp(_Msg(content="Done.")),
    ])
    await run_agent("u1", "hi", client=client, tool_registry=local,
                    tool_specs=specs, group_id=42)
    assert captured.get("ok") is True
