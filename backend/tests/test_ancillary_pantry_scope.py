"""Tests for group-aware ancillaries (Task A5):
  - shopping-list/match-pantry scopes the pantry read by the supplied group_id.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

import main

app = main.app


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Chainable no-op query builder; select-chains resolve to the data seeded
    per table name."""
    def __init__(self, name, tables):
        self.name = name
        self.tables = tables

    def select(self, *a, **k):
        return self

    def eq(self, *a):
        return self

    def is_(self, *a):
        return self

    def execute(self):
        return _Result(self.tables.get(self.name, []))


class _FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return _Query(name, self.tables)


@pytest.fixture
def client():
    from auth import get_current_user_dependency
    app.dependency_overrides[get_current_user_dependency] = lambda: {"id": "user-1"}
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_match_pantry_scopes_by_group_id(client, monkeypatch):
    import routes.shopping_list as sl
    captured = {}

    # Non-empty shopping list so we reach the pantry read; empty pantry so we
    # return before any LLM call.
    fake = _FakeSupabase({"shopping_list": [{"id": 1, "name": "milk"}], "pantry_items": []})
    monkeypatch.setattr(sl, "supabase", fake)
    monkeypatch.setattr(sl, "verify_pantry_access", lambda uid, gid: None)

    def fake_scope(query, user_id, group_id):
        captured["user_id"] = user_id
        captured["group_id"] = group_id
        return query
    monkeypatch.setattr(sl, "scope_pantry_query", fake_scope)

    r = client.post("/api/shopping-list/match-pantry?group_id=42")
    assert r.status_code == 200
    assert captured["group_id"] == 42
    assert captured["user_id"] == "user-1"


def test_match_pantry_personal_when_no_group(client, monkeypatch):
    import routes.shopping_list as sl
    captured = {}
    fake = _FakeSupabase({"shopping_list": [{"id": 1, "name": "milk"}], "pantry_items": []})
    monkeypatch.setattr(sl, "supabase", fake)
    monkeypatch.setattr(sl, "verify_pantry_access", lambda uid, gid: None)

    def fake_scope(query, user_id, group_id):
        captured["group_id"] = group_id
        return query
    monkeypatch.setattr(sl, "scope_pantry_query", fake_scope)

    r = client.post("/api/shopping-list/match-pantry")
    assert r.status_code == 200
    assert captured["group_id"] is None
