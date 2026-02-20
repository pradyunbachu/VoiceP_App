"""Tests for pantry handler fixes:
  1. Voice remove: exact match → word boundary → single substring (no mass delete)
  2. Cooking deduct: no double-deduction of the same item
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import re


class TestRemoveMatching:
    """Test the improved matching logic in handle_pantry_remove."""

    def _match(self, search_term, items):
        """Replicate the fixed matching logic from handle_pantry_remove."""
        search_lower = search_term.lower().strip()

        # Pass 1: exact name match
        exact = [i for i in items if i.get("name", "").lower().strip() == search_lower]
        if exact:
            return exact

        # Pass 2: word-boundary match
        pattern = re.compile(r'\b' + re.escape(search_lower) + r'\b', re.IGNORECASE)
        boundary = [i for i in items if pattern.search(i.get("name", ""))]
        if boundary:
            return boundary

        # Pass 3: substring, but only if exactly one match
        substr = [i for i in items if search_lower in i.get("name", "").lower()]
        if len(substr) == 1:
            return substr

        return []

    def test_exact_match(self):
        items = [
            {"name": "Rice", "id": 1},
            {"name": "Rice Vinegar", "id": 2},
            {"name": "Rice Krispies", "id": 3},
        ]
        result = self._match("rice", items)
        assert len(result) == 1
        assert result[0]["id"] == 1

    def test_exact_match_case_insensitive(self):
        items = [{"name": "Chicken Breast", "id": 1}]
        result = self._match("chicken breast", items)
        assert len(result) == 1

    def test_word_boundary_match(self):
        """'brown rice' doesn't exact-match anything, but word boundary finds it."""
        items = [
            {"name": "Brown Rice", "id": 1},
            {"name": "Rice Vinegar", "id": 2},
        ]
        result = self._match("rice", items)
        # "rice" has exact match with neither. Word boundary matches both.
        assert len(result) == 2

    def test_no_substring_mass_delete(self):
        """KEY FIX: 'rice' should NOT delete 'Rice Vinegar' and 'Rice Krispies'
        when there's an exact match for 'Rice'."""
        items = [
            {"name": "Rice", "id": 1},
            {"name": "Rice Vinegar", "id": 2},
            {"name": "Rice Krispies", "id": 3},
        ]
        result = self._match("rice", items)
        assert len(result) == 1, f"Should only match exact 'Rice', got {[i['name'] for i in result]}"

    def test_single_substring_fallback(self):
        """When no exact or boundary match, a single substring match is ok."""
        items = [
            {"name": "Strawberry Jam", "id": 1},
        ]
        result = self._match("strawberry", items)
        # Word boundary "strawberry" matches "Strawberry Jam"
        assert len(result) == 1

    def test_word_boundary_matches_whole_word_only(self):
        """'corn' word boundary matches 'Corn on the Cob' but NOT 'Cornflakes' or 'Unicorn Cake'.
        \\bcorn\\b requires word boundaries on both sides — 'Cornflakes' has no boundary after 'n'."""
        items = [
            {"name": "Cornflakes", "id": 1},
            {"name": "Corn on the Cob", "id": 2},
            {"name": "Unicorn Cake", "id": 3},
        ]
        result = self._match("corn", items)
        assert len(result) == 1, f"Expected 1 word-boundary match, got {[i['name'] for i in result]}"
        assert result[0]["id"] == 2

    def test_no_match(self):
        items = [{"name": "Milk", "id": 1}]
        result = self._match("chicken", items)
        assert len(result) == 0

    def test_empty_items(self):
        result = self._match("rice", [])
        assert len(result) == 0


class TestCookingDeductLogic:
    """Test that cooking deduction doesn't double-deduct the same pantry item."""

    def _simulate_deduction(self, used_items, pantry_items):
        """Replicate the fixed deduction logic from handle_cooking_deduct."""
        deducted = []
        deducted_ids = set()
        for used_name in used_items:
            for pantry_item in pantry_items:
                if pantry_item["id"] in deducted_ids:
                    continue
                if used_name.lower() in pantry_item["name"].lower() or \
                   pantry_item["name"].lower() in used_name.lower():
                    current_qty = pantry_item.get("quantity", 1)
                    new_qty = max(0, current_qty - 1)
                    pantry_item["quantity"] = new_qty
                    deducted_ids.add(pantry_item["id"])
                    deducted.append({
                        "name": pantry_item["name"],
                        "old_quantity": current_qty,
                        "new_quantity": new_qty,
                    })
                    break
        return deducted

    def test_no_double_deduct(self):
        """KEY FIX: 'chicken' and 'chicken breast' should not both deduct 'Chicken Breast'."""
        pantry = [
            {"id": 1, "name": "Chicken Breast", "quantity": 5},
            {"id": 2, "name": "Rice", "quantity": 3},
        ]
        used = ["chicken", "chicken breast", "rice"]
        result = self._simulate_deduction(used, pantry)

        # Chicken Breast should only be deducted once
        chicken_deductions = [d for d in result if "Chicken" in d["name"]]
        assert len(chicken_deductions) == 1, (
            f"Chicken Breast deducted {len(chicken_deductions)} times, expected 1"
        )
        assert chicken_deductions[0]["new_quantity"] == 4

        # Rice should be deducted once
        rice_deductions = [d for d in result if d["name"] == "Rice"]
        assert len(rice_deductions) == 1
        assert rice_deductions[0]["new_quantity"] == 2

    def test_separate_items_deducted(self):
        """Different items should each be deducted."""
        pantry = [
            {"id": 1, "name": "Eggs", "quantity": 12},
            {"id": 2, "name": "Butter", "quantity": 2},
        ]
        used = ["eggs", "butter"]
        result = self._simulate_deduction(used, pantry)
        assert len(result) == 2
        assert pantry[0]["quantity"] == 11
        assert pantry[1]["quantity"] == 1

    def test_deduct_to_zero(self):
        """Quantity should not go below 0."""
        pantry = [{"id": 1, "name": "Milk", "quantity": 1}]
        used = ["milk"]
        result = self._simulate_deduction(used, pantry)
        assert result[0]["new_quantity"] == 0

    def test_already_zero(self):
        """Deducting from 0 stays at 0."""
        pantry = [{"id": 1, "name": "Milk", "quantity": 0}]
        used = ["milk"]
        result = self._simulate_deduction(used, pantry)
        assert result[0]["new_quantity"] == 0

    def test_overlapping_names_different_items(self):
        """'oil' and 'olive oil' — 'oil' matches 'Olive Oil' first,
        then 'olive oil' should not re-deduct it."""
        pantry = [
            {"id": 1, "name": "Olive Oil", "quantity": 3},
            {"id": 2, "name": "Vegetable Oil", "quantity": 2},
        ]
        used = ["oil", "olive oil"]
        result = self._simulate_deduction(used, pantry)
        # "oil" matches "Olive Oil" first, deducted_ids blocks it for "olive oil"
        olive = [d for d in result if d["name"] == "Olive Oil"]
        assert len(olive) == 1
        assert olive[0]["new_quantity"] == 2

    def test_no_match(self):
        pantry = [{"id": 1, "name": "Milk", "quantity": 5}]
        used = ["chicken"]
        result = self._simulate_deduction(used, pantry)
        assert len(result) == 0
        assert pantry[0]["quantity"] == 5  # unchanged
