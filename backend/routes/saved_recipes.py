"""Saved/favorite recipes CRUD.

  POST   /saved-recipes       — Save a recipe to the user's collection.
  GET    /saved-recipes       — List all saved recipes for the user.
  DELETE /saved-recipes/{id}  — Remove a saved recipe.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter

import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class SaveRecipeRequest(BaseModel):
    name: str = Field(max_length=300)
    description: Optional[str] = Field(default=None, max_length=1000)
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    ingredients: Optional[list] = None
    instructions: Optional[list] = None
    nutrition: Optional[dict] = None


@router.post("/saved-recipes")
@limiter.limit("30/minute")
async def save_recipe(
    request: Request,
    body: SaveRecipeRequest,
    current_user: dict = Depends(get_current_user_dependency),
):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Prevent duplicates by name
    existing = (
        supabase.table("saved_recipes")
        .select("id")
        .eq("user_id", user_id)
        .eq("name", body.name)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Recipe already saved")

    response = supabase.table("saved_recipes").insert({
        "user_id": user_id,
        "name": body.name,
        "description": body.description,
        "servings": body.servings,
        "prep_minutes": body.prep_minutes,
        "cook_minutes": body.cook_minutes,
        "ingredients": body.ingredients or [],
        "instructions": body.instructions or [],
        "nutrition": body.nutrition,
        "saved_at": datetime.now().isoformat(),
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to save recipe")

    return response.data[0]


@router.get("/saved-recipes")
@limiter.limit("60/minute")
async def list_saved_recipes(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = (
        supabase.table("saved_recipes")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("saved_at", desc=True)
        .execute()
    )

    return {"recipes": response.data or [], "count": len(response.data or [])}


@router.delete("/saved-recipes/{recipe_id}")
@limiter.limit("30/minute")
async def delete_saved_recipe(
    request: Request,
    recipe_id: int,
    current_user: dict = Depends(get_current_user_dependency),
):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = (
        supabase.table("saved_recipes")
        .delete()
        .eq("id", recipe_id)
        .eq("user_id", current_user["id"])
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Saved recipe not found")

    return {"message": "Recipe removed from saved"}
