"""Tests for pantry route fixes:
  1. Route ordering: bulk delete before {item_id}
  2. Quantity off-by-one on merge (0 or 1 → 1)
  3. Expiring filter excludes already-expired items
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta


class TestMergeQuantityLogic:
    """Test the fix for quantity off-by-one when merging with depleted items."""

    def _merge_logic(self, existing_qty, add_qty):
        """Replicate the fixed merge logic from _merge_pantry_item."""
        existing_qty_val = existing_qty if existing_qty is not None else 1
        add_qty_val = add_qty if add_qty is not None else 1
        return existing_qty_val + add_qty_val

    def test_normal_merge(self):
        """5 existing + 3 new = 8"""
        assert self._merge_logic(5, 3) == 8

    def test_zero_existing_plus_new(self):
        """KEY FIX: 0 existing + 3 new = 3 (not 4!)
        Old code: (0 or 1) + 3 = 4 because 0 is falsy."""
        assert self._merge_logic(0, 3) == 3

    def test_zero_existing_plus_one(self):
        """0 existing + 1 new = 1 (not 2!)"""
        assert self._merge_logic(0, 1) == 1

    def test_none_existing_defaults_to_1(self):
        """None existing → defaults to 1, so 1 + 3 = 4"""
        assert self._merge_logic(None, 3) == 4

    def test_none_add_defaults_to_1(self):
        """5 existing + None → defaults to 1, so 5 + 1 = 6"""
        assert self._merge_logic(5, None) == 6

    def test_both_none(self):
        """None + None → 1 + 1 = 2"""
        assert self._merge_logic(None, None) == 2

    def test_zero_both(self):
        """0 + 0 = 0"""
        assert self._merge_logic(0, 0) == 0


class TestExpiringFilter:
    """Test that the expiring filter correctly excludes already-expired items."""

    def _apply_filter(self, items, expiring_within_days):
        """Replicate the fixed expiring filter logic from get_pantry_items."""
        today = datetime.now().date()
        future_date = (today + timedelta(days=expiring_within_days)).date() if isinstance(
            today + timedelta(days=expiring_within_days), datetime
        ) else today + timedelta(days=expiring_within_days)
        result = []
        for item in items:
            if item.get("expiration_date"):
                try:
                    exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                    if today <= exp_date <= future_date:
                        result.append(item)
                except (ValueError, TypeError):
                    pass
        return result

    def test_expiring_in_3_days_included(self):
        future = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        items = [{"name": "Milk", "expiration_date": future}]
        result = self._apply_filter(items, 3)
        assert len(result) == 1

    def test_expired_yesterday_excluded(self):
        """KEY FIX: Items that already expired should NOT appear."""
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        items = [{"name": "Old Milk", "expiration_date": yesterday}]
        result = self._apply_filter(items, 7)
        assert len(result) == 0, "Already-expired items should be excluded"

    def test_expired_30_days_ago_excluded(self):
        old = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        items = [{"name": "Very Old Milk", "expiration_date": old}]
        result = self._apply_filter(items, 7)
        assert len(result) == 0

    def test_expiring_today_included(self):
        today = datetime.now().strftime("%Y-%m-%d")
        items = [{"name": "Expires Today", "expiration_date": today}]
        result = self._apply_filter(items, 7)
        assert len(result) == 1

    def test_far_future_excluded(self):
        far = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")
        items = [{"name": "Fresh", "expiration_date": far}]
        result = self._apply_filter(items, 7)
        assert len(result) == 0

    def test_no_expiration_excluded(self):
        items = [{"name": "No Date", "expiration_date": None}]
        result = self._apply_filter(items, 7)
        assert len(result) == 0

    def test_invalid_date_excluded(self):
        items = [{"name": "Bad Date", "expiration_date": "not-a-date"}]
        result = self._apply_filter(items, 7)
        assert len(result) == 0

    def test_mixed_items(self):
        """Only expiring-soon items should pass."""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        far = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")
        items = [
            {"name": "Expiring", "expiration_date": tomorrow},
            {"name": "Expired", "expiration_date": yesterday},
            {"name": "Fresh", "expiration_date": far},
            {"name": "No Date", "expiration_date": None},
        ]
        result = self._apply_filter(items, 3)
        assert len(result) == 1
        assert result[0]["name"] == "Expiring"


class TestRouteOrdering:
    """Test that route ordering is correct (bulk before {item_id}).
    We verify this by importing the router and checking registration order."""

    def test_bulk_delete_before_item_delete(self):
        """The /pantry/bulk route must be registered BEFORE /pantry/{item_id}."""
        from routes.pantry import router
        delete_routes = [
            route.path for route in router.routes
            if hasattr(route, 'methods') and 'DELETE' in route.methods
        ]
        assert "/pantry/bulk" in delete_routes, "Bulk delete route not found"
        assert "/pantry/{item_id}" in delete_routes, "Item delete route not found"
        bulk_idx = delete_routes.index("/pantry/bulk")
        item_idx = delete_routes.index("/pantry/{item_id}")
        assert bulk_idx < item_idx, (
            f"/pantry/bulk (index {bulk_idx}) must come before "
            f"/pantry/{{item_id}} (index {item_idx})"
        )
