import pytest
from fastapi.testclient import TestClient

import main  # FastAPI app
from agent.results import AgentResult, Action

app = main.app


@pytest.fixture
def client(monkeypatch):
    # Bypass auth dependency.
    from auth import get_current_user_dependency
    app.dependency_overrides[get_current_user_dependency] = lambda: {"id": "u1"}
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_chat_returns_agent_fields_and_legacy(client, monkeypatch):
    async def fake_run(user_id, message, history=None, group_id=None):
        return AgentResult(reply="Added milk.",
                           actions=[Action(type="shopping_add", summary="Added milk", data={})])
    monkeypatch.setattr("routes.chat.run_agent", fake_run)

    r = client.post("/api/chat", json={"message": "add milk"})
    assert r.status_code == 200
    body = r.json()
    assert body["reply"] == "Added milk."
    assert body["response_text"] == "Added milk."   # legacy mirror
    assert body["actions"][0]["type"] == "shopping_add"
    assert body["intent"] == "agent"


def test_chat_falls_back_to_classifier_on_agent_error(client, monkeypatch):
    async def boom(user_id, message, history=None, group_id=None):
        raise RuntimeError("groq down")
    monkeypatch.setattr("routes.chat.run_agent", boom)
    # Make the classifier path deterministic.
    monkeypatch.setattr("routes.chat.detect_intent", lambda m: {"intent": "general", "sub_intent": None, "entities": {}})
    monkeypatch.setattr("routes.chat.generate_response", lambda *a, **k: "Hi! How can I help?")

    r = client.post("/api/chat", json={"message": "hello"})
    assert r.status_code == 200
    body = r.json()
    assert body["response_text"] == "Hi! How can I help?"
    assert body["intent"] == "general"


def test_chat_confirm_executes_pending(client, monkeypatch):
    async def fake_exec(user_id, pending, ids, group_id=None):
        from agent.results import AgentResult, Action
        return AgentResult(reply="Deleted it.",
                           actions=[Action(type="expense_deleted", summary="Deleted", data={})])
    monkeypatch.setattr("routes.chat.execute_pending", fake_exec)

    r = client.post("/api/chat/confirm", json={
        "ids": ["p1"],
        "pending": [{"id": "p1", "tool": "delete_expense", "args": {}, "summary": "Delete?"}],
    })
    assert r.status_code == 200
    assert r.json()["reply"] == "Deleted it."
