"""Tests for the group_id-column pantry scoping helpers (Task A1):
  - verify_pantry_access: no-op for personal (None), 403 for non-members.
  - scope_pantry_query: personal → user_id + group_id IS NULL; group → group_id.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import HTTPException
from routes import pantry_sharing


class _Q:
    """Records the filters applied to a supabase-style query builder."""
    def __init__(self):
        self.calls = []

    def eq(self, k, v):
        self.calls.append(("eq", k, v))
        return self

    def is_(self, k, v):
        self.calls.append(("is_", k, v))
        return self


def test_access_noop_for_personal():
    # Must not raise for the personal pantry (group_id is None).
    pantry_sharing.verify_pantry_access("user-1", None)


def test_access_noop_for_member(monkeypatch):
    monkeypatch.setattr(pantry_sharing, "verify_pantry_group_membership", lambda u, g: True)
    pantry_sharing.verify_pantry_access("user-1", 42)  # must not raise


def test_access_403_for_non_member(monkeypatch):
    monkeypatch.setattr(pantry_sharing, "verify_pantry_group_membership", lambda u, g: False)
    with pytest.raises(HTTPException) as exc:
        pantry_sharing.verify_pantry_access("user-1", 42)
    assert exc.value.status_code == 403


def test_scope_personal_filters_null_group():
    q = _Q()
    result = pantry_sharing.scope_pantry_query(q, "user-1", None)
    assert result is q
    assert ("eq", "user_id", "user-1") in q.calls
    assert ("is_", "group_id", "null") in q.calls


def test_scope_group_filters_group_id():
    q = _Q()
    result = pantry_sharing.scope_pantry_query(q, "user-1", 42)
    assert result is q
    assert ("eq", "group_id", 42) in q.calls
    # A group scope must NOT constrain by the caller's user_id.
    assert ("eq", "user_id", "user-1") not in q.calls
