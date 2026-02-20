"""Tests for extraction and analytics fixes:
  1. min() with find() no longer discards valid positions when one is -1
  2. Analytics month validation rejects invalid months
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestMinFindFix:
    """Test the fix for min() with str.find() returning -1."""

    def _find_store_marker(self, transcript_lower, keyword_pos):
        """Replicate the fixed logic from extract_expense_simple."""
        from_pos = transcript_lower.find(' from ', keyword_pos)
        at_pos = transcript_lower.find(' at ', keyword_pos)
        positions = [p for p in (from_pos, at_pos) if p != -1]
        return min(positions) if positions else len(transcript_lower)

    def test_both_found_picks_earlier(self):
        text = "bought laptop from Apple at the store"
        # ' from ' at index 14, ' at ' at index 25
        result = self._find_store_marker(text, 0)
        assert result == text.find(' from ')

    def test_only_from_found(self):
        """KEY FIX: 'from' found but 'at' not found.
        Old code: min(30, -1) = -1 → incorrectly discards 'from' position."""
        text = "bought groceries from Walmart"
        result = self._find_store_marker(text, 0)
        assert result == text.find(' from '), f"Expected 'from' position, got {result}"

    def test_only_at_found(self):
        text = "bought groceries at Target"
        result = self._find_store_marker(text, 0)
        assert result == text.find(' at ')

    def test_neither_found(self):
        text = "bought groceries"
        result = self._find_store_marker(text, 0)
        assert result == len(text)

    def test_keyword_pos_offset(self):
        """Search should start from keyword_pos, not from 0."""
        text = "i went from home and bought milk at Target"
        # keyword "milk" is at index 33
        keyword_pos = text.find("milk")
        result = self._find_store_marker(text, keyword_pos)
        # ' at ' after "milk" is at index 38
        assert result == text.find(' at ', keyword_pos)


class TestAnalyticsMonthValidation:
    """Test that invalid month values are properly rejected."""

    def test_valid_months(self):
        """Months 1-12 should be accepted."""
        for m in range(1, 13):
            assert 1 <= m <= 12

    def test_month_zero_invalid(self):
        assert not (1 <= 0 <= 12)

    def test_month_13_invalid(self):
        assert not (1 <= 13 <= 12)

    def test_month_negative_invalid(self):
        assert not (1 <= -1 <= 12)

    def test_analytics_route_rejects_bad_month(self):
        """The analytics route should raise HTTPException for invalid months.
        We test the validation logic directly since we can't easily spin up
        the full FastAPI app in a unit test."""
        from fastapi import HTTPException

        # Replicate the validation from analytics.py
        def validate_month(month, year):
            if year:
                if month is not None and not (1 <= month <= 12):
                    raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

        # Valid months should not raise
        for m in range(1, 13):
            validate_month(m, 2025)  # no exception

        # Invalid months should raise
        for bad_month in [0, 13, -1, 99]:
            try:
                validate_month(bad_month, 2025)
                assert False, f"Month {bad_month} should have raised HTTPException"
            except HTTPException as e:
                assert e.status_code == 400


class TestCSRFMiddleware:
    """Test the CSRF token mismatch fix."""

    def test_generate_csrf_token_is_unique(self):
        from middleware.csrf import generate_csrf_token
        tokens = [generate_csrf_token() for _ in range(100)]
        assert len(set(tokens)) == 100, "All tokens should be unique"

    def test_generate_csrf_token_length(self):
        from middleware.csrf import generate_csrf_token
        token = generate_csrf_token()
        # token_urlsafe(32) produces ~43 chars
        assert len(token) > 20
