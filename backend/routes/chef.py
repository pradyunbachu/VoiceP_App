"""Chef suggestions route.

POST /chef/suggestions — Given a list of specific ingredients selected by the
     user, generates 3 recipe suggestions using Groq (Llama 3.3 70B).
     No caching (ingredient set varies each time).
"""

# ============================================================================
# CHEF ROUTES - AI-Powered Recipe Suggestions from Selected Ingredients
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
import json

from config import groq_client
from auth import get_current_user_dependency
from rate_limit import limiter

import logging
logger = logging.getLogger(__name__)

router = APIRouter()


class ChefSuggestionsRequest(BaseModel):
    ingredients: list[str]
    preference: str = ""


def generate_chef_suggestions(ingredients: list[str], preference: str = ""):
    """Call Groq for 3 recipe suggestions using the given ingredients."""
    if not groq_client:
        return None

    ingredient_list = ", ".join(ingredients)

    preference_block = ""
    if preference:
        preference_block = f"\nUser preference: {preference}\nTailor your suggestions to match this preference.\n"

    prompt = f"""The user has selected these specific ingredients to cook with: {ingredient_list}

Suggest exactly 3 recipes that primarily use these ingredients.
{preference_block}
Return ONLY a JSON object with this structure:
{{"meals": [{{"name": "Recipe Name", "description": "One sentence about the dish", "time_minutes": 25, "ingredients_used": ["chicken", "rice"], "ingredients_needed": ["salt", "oil"]}}]}}

Rules:
- ingredients_used: items from the user's selection that each recipe uses
- ingredients_needed: any additional common ingredients not in the user's list
- Keep recipes practical and achievable
- Vary the recipes (different cuisines or cooking methods)"""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful recipe assistant. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        return json.loads(content)
    except Exception as e:
        logger.error("Chef suggestions generation error: %s", e)
        return None


@router.post("/chef/suggestions")
@limiter.limit("10/minute")
async def get_chef_suggestions(
    body: ChefSuggestionsRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Generate recipe suggestions from user-selected ingredients."""
    if not groq_client:
        raise HTTPException(status_code=500, detail="AI service not configured")

    if not body.ingredients:
        raise HTTPException(status_code=400, detail="At least one ingredient is required")

    result = generate_chef_suggestions(body.ingredients, body.preference)

    if not result:
        raise HTTPException(status_code=500, detail="Failed to generate suggestions")

    return result
