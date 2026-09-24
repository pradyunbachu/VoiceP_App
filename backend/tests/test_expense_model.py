"""Exercise extraction when the former Groq model is unavailable."""
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient
from groq import Groq

import main
from auth import get_current_user_dependency
from routes import expense_extraction as route


@pytest.mark.parametrize("retry", [False, True])
def test_extraction_uses_available_model_including_retry(monkeypatch, retry):
    calls = []

    def completion(request):
        payload = json.loads(request.content)
        calls.append(payload)
        if payload["model"] == "llama-3.3-70b-versatile":
            return httpx.Response(404, json={"error": {
                "message": "Model does not exist or you do not have access to it",
                "type": "invalid_request_error", "code": "model_not_found",
            }})
        content = "invalid JSON" if retry and len(calls) == 1 else json.dumps([{
            "store": "Costco", "items": "Milk", "category": "Groceries",
            "amount": 5, "date": "2026-09-23",
        }])
        return httpx.Response(200, json={
            "id": "test", "object": "chat.completion", "created": 0,
            "model": payload["model"], "choices": [{"index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop"}],
        })

    database = MagicMock()
    database.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(data=[{"id": 1}])
    monkeypatch.setattr(route, "supabase", database)
    monkeypatch.setattr(route, "_get_user_store_context", lambda _: "")
    monkeypatch.setattr(route, "_detect_recurring_pattern", lambda *_: None)
    with Groq(api_key="test", http_client=httpx.Client(transport=httpx.MockTransport(completion))) as groq:
        monkeypatch.setattr(route, "groq_client", groq)
        main.app.dependency_overrides[get_current_user_dependency] = lambda: {"id": "test-user"}
        try:
            client = TestClient(main.app)
            # Spoken number words require the model; the regex cannot parse this.
            response = client.post("/api/extract-expense", json={
                "transcript": "I paid five dollars for milk at Costco",
            })
        finally:
            main.app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    assert response.json()["expenses"][0]["amount"] == 5
    assert response.json()["expenses"][0]["items"] == "Milk"
    assert len(calls) == (2 if retry else 1)
