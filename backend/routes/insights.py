# ============================================================================
# INSIGHTS ROUTES - AI-Powered Spending Analysis
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
from typing import Optional, Tuple
import json

from config import supabase, groq_client
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import InsightsRequest, InsightsResponse
from cache import api_cache, make_cache_key

router = APIRouter()

# ============================================================================
# AI INSIGHTS GENERATION
# ============================================================================

INSIGHTS_SYSTEM_PROMPT = """You are a personal finance analyst assistant. Analyze the user's spending data and provide actionable insights.

Return your analysis as a JSON object with this exact structure:
{
  "headline": "One sentence summary of their spending pattern",
  "key_findings": [
    {"type": "positive|warning|neutral", "title": "Short title", "description": "Detailed finding"}
  ],
  "recommendations": [
    {"priority": "high|medium|low", "category": "category name", "suggestion": "Actionable advice", "potential_savings": "$X or percentage"}
  ],
  "spending_personality": "A fun one-liner about their spending style"
}

Guidelines:
- Be specific and actionable
- Highlight both positive patterns and areas for improvement
- Provide 2-4 key findings and 2-3 recommendations
- Use the budget data to identify overspending
- Consider spending trends (increases/decreases)
- Keep the tone helpful and encouraging, not judgmental
- The spending_personality should be light-hearted

Respond ONLY with valid JSON, no markdown or additional text."""


def generate_ai_insights(spending_data: dict) -> Optional[dict]:
    """Generate AI-powered insights using Groq."""
    if not groq_client:
        return None

    try:
        user_prompt = f"""Analyze this spending data and provide insights:

SUMMARY:
- Total spent: ${spending_data['total_spent']:.2f}
- Number of transactions: {spending_data['transaction_count']}
- Daily average: ${spending_data['daily_average']:.2f}
- Period: {spending_data['period_days']} days

PERIOD-OVER-PERIOD CHANGES:
- Total spending change: {spending_data['spending_change']:+.1f}%
- Transaction count change: {spending_data['transaction_change']:+.1f}%
- Daily average change: {spending_data['daily_avg_change']:+.1f}%

TOP CATEGORIES (by spend):
{json.dumps(spending_data['top_categories'], indent=2)}

TOP STORES (by spend):
{json.dumps(spending_data['top_stores'], indent=2)}

BUDGET STATUS:
{json.dumps(spending_data['budget_status'], indent=2) if spending_data['budget_status'] else 'No budgets set'}

SPENDING PATTERNS:
- Highest spending day: {spending_data.get('highest_day', 'N/A')}
- Lowest spending day: {spending_data.get('lowest_day', 'N/A')}
"""

        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": INSIGHTS_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )

        content = response.choices[0].message.content.strip()

        # Remove markdown code blocks if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        return json.loads(content)
    except Exception as e:
        print(f"AI insights generation error: {e}")
        return None


# ============================================================================
# DATA AGGREGATION HELPERS
# ============================================================================

def get_date_range(time_period: str) -> Tuple[datetime, datetime, int]:
    """Get date range based on time period selection."""
    today = datetime.now().date()

    if time_period == "last_7_days":
        days = 7
    elif time_period == "last_90_days":
        days = 90
    else:  # last_30_days (default)
        days = 30

    start_date = today - timedelta(days=days - 1)
    return start_date, today, days


def calculate_category_trends(current_expenses: list, previous_expenses: list) -> dict:
    """Calculate spending by category with period-over-period changes."""
    current_by_cat = {}
    previous_by_cat = {}

    for exp in current_expenses:
        categories_str = exp.get("category") or "Other"
        amount = float(exp.get("amount") or 0)
        for cat in [c.strip() for c in categories_str.split(",")]:
            if cat:
                current_by_cat[cat] = current_by_cat.get(cat, 0) + amount

    for exp in previous_expenses:
        categories_str = exp.get("category") or "Other"
        amount = float(exp.get("amount") or 0)
        for cat in [c.strip() for c in categories_str.split(",")]:
            if cat:
                previous_by_cat[cat] = previous_by_cat.get(cat, 0) + amount

    return current_by_cat, previous_by_cat


def calculate_store_trends(current_expenses: list, previous_expenses: list) -> dict:
    """Calculate spending by store with visit frequency."""
    current_by_store = {}
    previous_by_store = {}

    for exp in current_expenses:
        store = exp.get("store", "Unknown")
        amount = float(exp.get("amount") or 0)
        if store not in current_by_store:
            current_by_store[store] = {"amount": 0, "visits": 0}
        current_by_store[store]["amount"] += amount
        current_by_store[store]["visits"] += 1

    for exp in previous_expenses:
        store = exp.get("store", "Unknown")
        amount = float(exp.get("amount") or 0)
        if store not in previous_by_store:
            previous_by_store[store] = {"amount": 0, "visits": 0}
        previous_by_store[store]["amount"] += amount
        previous_by_store[store]["visits"] += 1

    return current_by_store, previous_by_store


# ============================================================================
# MAIN INSIGHTS ENDPOINT
# ============================================================================

@router.post("/insights")
@limiter.limit("10/minute")
async def get_insights(
    request: Request,
    insights_request: InsightsRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """
    Generate AI-powered spending insights for the selected time period.
    Aggregates data, calculates trends, and uses Groq for personalized analysis.
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    time_period = insights_request.time_period

    cache_key = make_cache_key(user_id, "insights", time_period=time_period)
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    # Calculate date ranges
    start_date, end_date, period_days = get_date_range(time_period)
    prev_start = start_date - timedelta(days=period_days)
    prev_end = start_date - timedelta(days=1)

    # Fetch current period expenses
    current_response = supabase.table("expenses").select("*")\
        .eq("user_id", user_id)\
        .gte("date", start_date.strftime("%Y-%m-%d"))\
        .lte("date", end_date.strftime("%Y-%m-%d"))\
        .execute()
    current_expenses = current_response.data or []

    # Fetch previous period expenses for comparison
    prev_response = supabase.table("expenses").select("*")\
        .eq("user_id", user_id)\
        .gte("date", prev_start.strftime("%Y-%m-%d"))\
        .lte("date", prev_end.strftime("%Y-%m-%d"))\
        .execute()
    previous_expenses = prev_response.data or []

    # Calculate summary stats
    current_total = sum(float(e.get("amount") or 0) for e in current_expenses)
    previous_total = sum(float(e.get("amount") or 0) for e in previous_expenses)

    current_count = len(current_expenses)
    previous_count = len(previous_expenses)

    current_daily_avg = current_total / period_days if period_days > 0 else 0
    previous_daily_avg = previous_total / period_days if period_days > 0 else 0

    # Calculate period-over-period changes
    spending_change = ((current_total - previous_total) / previous_total * 100) if previous_total > 0 else 0
    transaction_change = ((current_count - previous_count) / previous_count * 100) if previous_count > 0 else 0
    daily_avg_change = ((current_daily_avg - previous_daily_avg) / previous_daily_avg * 100) if previous_daily_avg > 0 else 0

    # Calculate category breakdown with trends
    current_by_cat, previous_by_cat = calculate_category_trends(current_expenses, previous_expenses)

    top_categories = []
    for cat, amount in sorted(current_by_cat.items(), key=lambda x: x[1], reverse=True)[:6]:
        prev_amount = previous_by_cat.get(cat, 0)
        change = ((amount - prev_amount) / prev_amount * 100) if prev_amount > 0 else (100 if amount > 0 else 0)
        percentage = (amount / current_total * 100) if current_total > 0 else 0
        top_categories.append({
            "category": cat,
            "amount": round(amount, 2),
            "percentage": round(percentage, 1),
            "change": round(change, 1),
            "previous_amount": round(prev_amount, 2)
        })

    # Calculate store breakdown with trends
    current_by_store, previous_by_store = calculate_store_trends(current_expenses, previous_expenses)

    top_stores = []
    for store, data in sorted(current_by_store.items(), key=lambda x: x[1]["amount"], reverse=True)[:5]:
        prev_data = previous_by_store.get(store, {"amount": 0, "visits": 0})
        change = ((data["amount"] - prev_data["amount"]) / prev_data["amount"] * 100) if prev_data["amount"] > 0 else (100 if data["amount"] > 0 else 0)
        top_stores.append({
            "store": store,
            "amount": round(data["amount"], 2),
            "visits": data["visits"],
            "change": round(change, 1),
            "previous_visits": prev_data["visits"]
        })

    # Get spending by day of week
    spending_by_day = {}
    for exp in current_expenses:
        try:
            exp_date = datetime.strptime(exp["date"], "%Y-%m-%d")
            day_name = exp_date.strftime("%A")
            amount = float(exp.get("amount") or 0)
            spending_by_day[day_name] = spending_by_day.get(day_name, 0) + amount
        except:
            pass

    highest_day = max(spending_by_day.items(), key=lambda x: x[1])[0] if spending_by_day else "N/A"
    lowest_day = min(spending_by_day.items(), key=lambda x: x[1])[0] if spending_by_day else "N/A"

    # Fetch budget status for current month
    today = datetime.now()
    budget_response = supabase.table("budgets").select("*")\
        .eq("user_id", user_id)\
        .eq("month", today.month)\
        .eq("year", today.year)\
        .execute()
    budgets = budget_response.data or []

    budget_status = []
    for budget in budgets:
        category = budget.get("category", "").strip()
        budget_amount = float(budget.get("amount") or 0)
        actual_spending = current_by_cat.get(category, 0)
        remaining = budget_amount - actual_spending
        percentage_used = (actual_spending / budget_amount * 100) if budget_amount > 0 else 0

        budget_status.append({
            "category": category,
            "budget": round(budget_amount, 2),
            "spent": round(actual_spending, 2),
            "remaining": round(remaining, 2),
            "percentage_used": round(percentage_used, 1),
            "status": "over" if remaining < 0 else ("warning" if percentage_used >= 75 else "ok")
        })

    # Prepare data for AI analysis
    ai_data = {
        "total_spent": current_total,
        "transaction_count": current_count,
        "daily_average": current_daily_avg,
        "period_days": period_days,
        "spending_change": spending_change,
        "transaction_change": transaction_change,
        "daily_avg_change": daily_avg_change,
        "top_categories": top_categories,
        "top_stores": top_stores,
        "budget_status": budget_status,
        "highest_day": highest_day,
        "lowest_day": lowest_day
    }

    # Generate AI insights
    ai_insights = generate_ai_insights(ai_data)

    # Build response as dict for caching
    result = {
        "period": {
            "name": time_period,
            "days": period_days,
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d")
        },
        "summary": {
            "total_spent": round(current_total, 2),
            "transaction_count": current_count,
            "daily_average": round(current_daily_avg, 2),
            "unique_stores": len(current_by_store),
            "unique_categories": len(current_by_cat)
        },
        "comparisons": {
            "spending_change": round(spending_change, 1),
            "transaction_change": round(transaction_change, 1),
            "daily_avg_change": round(daily_avg_change, 1),
            "previous_total": round(previous_total, 2),
            "previous_count": previous_count
        },
        "top_categories": top_categories,
        "top_stores": top_stores,
        "budget_status": budget_status if budget_status else None,
        "ai_insights": ai_insights,
        "generated_at": datetime.now().isoformat()
    }
    api_cache.set(cache_key, result, ttl=300)
    return result
