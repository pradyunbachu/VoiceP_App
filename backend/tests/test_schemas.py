"""Tests for Pydantic schema validation edge cases:
  1. Negative/zero quantity rejected
  2. Invalid date formats rejected
  3. Invalid stock_status rejected
  4. Valid inputs pass through
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from pydantic import ValidationError
from schemas import PantryItemCreate, PantryItemUpdate, ShoppingListItemCreate


class TestPantryItemCreateValidation:
    """Validate PantryItemCreate schema constraints."""

    def test_valid_item(self):
        item = PantryItemCreate(name="Milk", quantity=2, stock_status="full")
        assert item.name == "Milk"
        assert item.quantity == 2
        assert item.stock_status == "full"

    def test_defaults(self):
        item = PantryItemCreate(name="Eggs")
        assert item.quantity == 1
        assert item.category == "Other"
        assert item.stock_status == "full"

    def test_zero_quantity_allowed(self):
        """Quantity of 0 is valid (marks out_of_stock)."""
        item = PantryItemCreate(name="Milk", quantity=0)
        assert item.quantity == 0

    def test_negative_quantity_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            PantryItemCreate(name="Milk", quantity=-1)
        assert "greater than or equal to 0" in str(exc_info.value).lower() or "ge" in str(exc_info.value).lower()

    def test_valid_date_format(self):
        item = PantryItemCreate(
            name="Milk",
            expiration_date="2026-12-31",
            purchase_date="2026-01-15",
        )
        assert item.expiration_date == "2026-12-31"
        assert item.purchase_date == "2026-01-15"

    def test_invalid_expiration_date_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemCreate(name="Milk", expiration_date="not-a-date")

    def test_invalid_date_format_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemCreate(name="Milk", expiration_date="12/31/2026")

    def test_invalid_purchase_date_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemCreate(name="Milk", purchase_date="January 1 2026")

    def test_null_dates_allowed(self):
        item = PantryItemCreate(name="Milk", expiration_date=None, purchase_date=None)
        assert item.expiration_date is None
        assert item.purchase_date is None

    def test_valid_stock_statuses(self):
        for status in ("full", "low", "out_of_stock"):
            item = PantryItemCreate(name="Milk", stock_status=status)
            assert item.stock_status == status

    def test_invalid_stock_status_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemCreate(name="Milk", stock_status="plenty")

    def test_name_too_long_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemCreate(name="A" * 201)


class TestPantryItemUpdateValidation:
    """Validate PantryItemUpdate schema constraints."""

    def test_partial_update(self):
        update = PantryItemUpdate(name="Oat Milk")
        assert update.name == "Oat Milk"
        assert update.quantity is None

    def test_negative_quantity_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemUpdate(quantity=-5)

    def test_invalid_expiration_date_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemUpdate(expiration_date="tomorrow")

    def test_invalid_stock_status_rejected(self):
        with pytest.raises(ValidationError):
            PantryItemUpdate(stock_status="expired")

    def test_valid_update(self):
        update = PantryItemUpdate(
            quantity=3,
            stock_status="low",
            expiration_date="2026-06-15",
        )
        assert update.quantity == 3
        assert update.stock_status == "low"
        assert update.expiration_date == "2026-06-15"


class TestShoppingListItemCreateValidation:
    """Validate ShoppingListItemCreate quantity constraint."""

    def test_negative_quantity_rejected(self):
        with pytest.raises(ValidationError):
            ShoppingListItemCreate(name="Milk", quantity=-1)

    def test_valid_quantity(self):
        item = ShoppingListItemCreate(name="Milk", quantity=3)
        assert item.quantity == 3

    def test_zero_quantity_allowed(self):
        item = ShoppingListItemCreate(name="Milk", quantity=0)
        assert item.quantity == 0
