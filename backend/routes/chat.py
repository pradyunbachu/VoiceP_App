"""Chat router — entry point for the Voxy voice agent.

Primary path: an LLM tool-calling agent (agent.runner.run_agent) that can take
multiple actions, answer questions, and reason over the user's data.
Fallback path: the legacy single-intent classifier (kept for resilience).
"""
import logging

from fastapi import APIRouter, HTTPException, Depends, Request

from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import ChatRequest, ChatResponse, ChatConfirmRequest

import agent  # noqa: F401 — import side-effect registers all tools
from agent.runner import run_agent, execute_pending

# Fallback (legacy classifier) — imported lazily-safe at module load.
from handlers import detect_intent, generate_response
from handlers import (
    handle_pantry_query, handle_pantry_add, handle_pantry_remove, handle_cooking_deduct,
    handle_expense_query, handle_expense_delete, handle_store_trip, handle_mark_subscription,
    handle_suggestion, handle_meal_suggestion, handle_reminder_check, handle_meal_plan_week,
    handle_budget_meal, handle_recall_past_meal, handle_shopping_complete,
    handle_shopping_list_add, handle_shopping_list_remove, handle_shopping_clear,
    handle_budget_query, handle_budget_set, handle_share_list,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _result_to_response(result) -> ChatResponse:
    return ChatResponse(
        intent=result.intent,
        sub_intent=result.sub_intent,
        response_text=result.reply,           # legacy mirror
        reply=result.reply,
        actions=[a.model_dump() for a in result.actions],
        pending=[p.model_dump() for p in result.pending],
        data={"actions": [a.model_dump() for a in result.actions],
              "pending": [p.model_dump() for p in result.pending]},
    )


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(request: Request, chat_request: ChatRequest,
               current_user: dict = Depends(get_current_user_dependency)):
    message = chat_request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Empty message")
    user_id = current_user["id"]

    try:
        result = await run_agent(user_id, message, chat_request.history)
        return _result_to_response(result)
    except Exception:
        logger.exception("Agent failed; falling back to classifier")
        return await _classifier_fallback(user_id, message)


@router.post("/chat/confirm", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat_confirm(request: Request, confirm_request: ChatConfirmRequest,
                       current_user: dict = Depends(get_current_user_dependency)):
    user_id = current_user["id"]
    result = await execute_pending(user_id, confirm_request.pending, confirm_request.ids)
    return _result_to_response(result)


async def _classifier_fallback(user_id, message) -> ChatResponse:
    """Legacy single-intent path — unchanged behavior, used only on agent failure."""
    intent_result = detect_intent(message)
    intent = intent_result.get("intent", "general")
    sub_intent = intent_result.get("sub_intent")
    entities = intent_result.get("entities", {})
    data = {}

    if intent == "expense_input":
        return ChatResponse(intent=intent, sub_intent=sub_intent, response_text="",
                            reply="", data={"route_to_expense": True, "original_message": message},
                            actions=[], pending=[])

    dispatch = {
        "pantry_query": lambda: handle_pantry_query(user_id, sub_intent, entities),
        "pantry_add": lambda: handle_pantry_add(user_id, entities, message),
        "pantry_remove": lambda: handle_pantry_remove(user_id, entities, message),
        "cooking_deduct": lambda: handle_cooking_deduct(user_id, entities, message),
        "expense_query": lambda: handle_expense_query(user_id, sub_intent, entities),
        "store_trip": lambda: handle_store_trip(user_id, entities, message),
        "mark_subscription": lambda: handle_mark_subscription(user_id, entities),
        "expense_delete": lambda: handle_expense_delete(user_id, entities, message),
        "budget_query": lambda: handle_budget_query(user_id, sub_intent, entities),
        "suggestion": lambda: handle_suggestion(user_id, sub_intent, entities),
        "meal_suggestion": lambda: handle_meal_suggestion(user_id, sub_intent, entities, message),
        "reminder_check": lambda: handle_reminder_check(user_id, entities, message),
        "meal_plan_week": lambda: handle_meal_plan_week(user_id, entities),
        "budget_meal": lambda: handle_budget_meal(user_id, entities, message),
        "recall_past_meal": lambda: handle_recall_past_meal(user_id, sub_intent, entities, message),
        "shopping_complete": lambda: handle_shopping_complete(user_id, entities, message),
        "shopping_list_add": lambda: handle_shopping_list_add(user_id, entities, message),
        "shopping_list_remove": lambda: handle_shopping_list_remove(user_id, entities, message),
        "shopping_clear": lambda: handle_shopping_clear(user_id),
        "budget_set": lambda: handle_budget_set(user_id, entities, message),
        "share_list": lambda: handle_share_list(user_id, entities, message),
    }
    if intent in dispatch:
        data = await dispatch[intent]()

    response_text = generate_response(intent, sub_intent, data, entities)
    return ChatResponse(intent=intent, sub_intent=sub_intent,
                        response_text=response_text, reply=response_text, data=data,
                        actions=[], pending=[])
