"""Tests for group_id-scoped pantry writes (Task A2):
  - PantryItemCreate accepts optional group_id (defaults None).
  - POST /pantry stamps group_id onto the inserted row (personal → None, group → id).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient

from schemas import PantryItemCreate
import main

app = main.app


# --- Schema-level -----------------------------------------------------------

def test_pantry_create_accepts_group_id():
    assert PantryItemCreate(name="Milk", group_id=42).group_id == 42


def test_pantry_create_group_id_defaults_none():
    assert PantryItemCreate(name="Milk").group_id is None


# --- Route-level: group_id lands on the inserted row ------------------------

class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    """Minimal supabase query-builder stub. Filters are chainable no-ops;
    select-chains resolve to empty (no existing item → no merge); insert records
    the row and echoes it back with an id."""
    def __init__(self, store):
        self.store = store
        self._result = _Resp([])

    def select(self, *a, **k):
        return self

    def eq(self, *a):
        return self

    def is_(self, *a):
        return self

    def ilike(self, *a):
        return self

    def limit(self, *a):
        return self

    def insert(self, row):
        self.store["inserts"].append(row)
        self._result = _Resp([{**row, "id": 123}])
        return self

    def execute(self):
        return self._result


class _FakeSupabase:
    def __init__(self):
        self.store = {"inserts": []}

    def table(self, name):
        return _Query(self.store)


@pytest.fixture
def client():
    from auth import get_current_user_dependency
    app.dependency_overrides[get_current_user_dependency] = lambda: {"id": "user-1"}
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_sets_group_id_on_row(client, monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr("routes.pantry.supabase", fake)
    monkeypatch.setattr("routes.pantry.verify_pantry_access", lambda uid, gid: None)
    monkeypatch.setattr("routes.pantry.predict_expiration", lambda *a, **k: None)

    r = client.post("/api/pantry", json={"name": "Milk", "group_id": 42})
    assert r.status_code == 200
    assert fake.store["inserts"][-1]["group_id"] == 42


def test_create_personal_group_id_none(client, monkeypatch):
    fake = _FakeSupabase()
    monkeypatch.setattr("routes.pantry.supabase", fake)
    monkeypatch.setattr("routes.pantry.verify_pantry_access", lambda uid, gid: None)
    monkeypatch.setattr("routes.pantry.predict_expiration", lambda *a, **k: None)

    r = client.post("/api/pantry", json={"name": "Milk"})
    assert r.status_code == 200
    assert fake.store["inserts"][-1]["group_id"] is None
