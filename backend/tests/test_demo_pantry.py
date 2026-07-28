"""Tests for the demo pantry as a real group (Task A3):
  - ensure_demo_group creates + seeds the group once, and is idempotent.
  - demo reset wipes the demo group's items and re-seeds them.
Demo items carry group_id (not a notes flag), so they never leak into the
personal GET /pantry (group_id IS NULL).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    """Stateful, in-memory supabase-table stub supporting the small subset of
    query patterns ensure_demo_group / reset use."""
    def __init__(self, db, name):
        self.db = db
        self.name = name
        self._filters = []
        self._mode = None
        self._payload = None

    def select(self, *a, **k):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._payload = payload
        return self

    def delete(self):
        self._mode = "delete"
        return self

    def eq(self, k, v):
        self._filters.append((k, v))
        return self

    def _match(self, row):
        return all(row.get(k) == v for k, v in self._filters)

    def execute(self):
        rows = self.db["tables"].setdefault(self.name, [])
        if self._mode == "select":
            return _Result([dict(r) for r in rows if self._match(r)])
        if self._mode == "insert":
            payload = self._payload
            items = payload if isinstance(payload, list) else [payload]
            out = []
            for it in items:
                r = dict(it)
                if "id" not in r:
                    self.db["counter"] += 1
                    r["id"] = self.db["counter"]
                rows.append(r)
                out.append(dict(r))
            return _Result(out)
        if self._mode == "delete":
            kept = [r for r in rows if not self._match(r)]
            removed = [r for r in rows if self._match(r)]
            self.db["tables"][self.name] = kept
            return _Result(removed)
        return _Result([])


class _FakeSupabase:
    def __init__(self):
        self.db = {"tables": {}, "counter": 0}

    def table(self, name):
        return _Table(self.db, name)


@pytest.fixture(autouse=True)
def _no_predict(monkeypatch):
    monkeypatch.setattr("routes.pantry.predict_expiration", lambda *a, **k: None)


def test_ensure_demo_group_creates_once(monkeypatch):
    import routes.pantry as pantry_mod
    fake = _FakeSupabase()
    monkeypatch.setattr(pantry_mod, "supabase", fake)

    gid = pantry_mod.ensure_demo_group("user-1")
    groups = fake.db["tables"]["pantry_groups"]
    assert len(groups) == 1
    assert groups[0]["name"] == pantry_mod.DEMO_GROUP_NAME
    assert groups[0]["id"] == gid
    # Items seeded and stamped with the group id
    items = fake.db["tables"]["pantry_items"]
    assert len(items) > 0
    assert all(i["group_id"] == gid for i in items)
    assert all(i["user_id"] == "user-1" for i in items)
    seeded_count = len(items)

    # Idempotent: second call returns the same id, does not re-create/re-seed
    gid2 = pantry_mod.ensure_demo_group("user-1")
    assert gid2 == gid
    assert len(fake.db["tables"]["pantry_groups"]) == 1
    assert len(fake.db["tables"]["pantry_items"]) == seeded_count


def test_demo_reset_wipes_and_reseeds(monkeypatch):
    import routes.pantry as pantry_mod
    fake = _FakeSupabase()
    monkeypatch.setattr(pantry_mod, "supabase", fake)

    gid = pantry_mod.ensure_demo_group("user-1")
    original_count = len(fake.db["tables"]["pantry_items"])

    # Simulate the user editing the demo pantry: add a stray item, remove one.
    fake.db["tables"]["pantry_items"].append(
        {"id": 9999, "user_id": "user-1", "group_id": gid, "name": "Leftover Pizza"}
    )
    assert len(fake.db["tables"]["pantry_items"]) == original_count + 1

    items = pantry_mod._reset_demo_group("user-1")
    # All demo-group items are the freshly seeded set (stray item gone)
    remaining = fake.db["tables"]["pantry_items"]
    assert len(remaining) == original_count
    assert all(i["group_id"] == gid for i in remaining)
    assert not any(i["name"] == "Leftover Pizza" for i in remaining)
    assert len(items) == original_count
