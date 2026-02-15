# ============================================================================
# CHAT ROUTES - Thin router for conversational voice assistant
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request

from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import ChatRequest, ChatResponse
from handlers import (
    detect_intent,
    handle_pantry_query,
    handle_pantry_add,
    handle_pantry_remove,
    handle_cooking_deduct,
    handle_expense_query,
    handle_store_trip,
    handle_mark_subscription,
    handle_suggestion,
    handle_meal_suggestion,
    handle_reminder_check,
    handle_meal_plan_week,
    handle_budget_meal,
    handle_shopping_complete,
    handle_shopping_list_add,
    handle_budget_set,
    handle_share_list,
    generate_response,
)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(
    request: Request,
    chat_request: ChatRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """
    Unified chat endpoint for the conversational voice assistant.
    Detects intent and routes to appropriate handler.
    """
    message = chat_request.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    # Step 1: Detect intent
    intent_result = detect_intent(message)
    intent = intent_result.get("intent", "general")
    sub_intent = intent_result.get("sub_intent")
    entities = intent_result.get("entities", {})

    # Step 2: Handle based on intent
    user_id = current_user["id"]
    data = {}

    if intent == "expense_input":
        return ChatResponse(
            intent=intent,
            sub_intent=sub_intent,
            response_text="",
            data={"route_to_expense": True, "original_message": message}
        )

    elif intent == "pantry_query":
        data = await handle_pantry_query(user_id, sub_intent, entities)

    elif intent == "pantry_add":
        data = await handle_pantry_add(user_id, entities, message)

    elif intent == "pantry_remove":
        data = await handle_pantry_remove(user_id, entities, message)

    elif intent == "cooking_deduct":
        data = await handle_cooking_deduct(user_id, entities, message)

    elif intent == "expense_query":
        data = await handle_expense_query(user_id, sub_intent, entities)

    elif intent == "store_trip":
        data = await handle_store_trip(user_id, entities, message)

    elif intent == "mark_subscription":
        data = await handle_mark_subscription(user_id, entities)

    elif intent == "suggestion":
        data = await handle_suggestion(user_id, sub_intent, entities)

    elif intent == "meal_suggestion":
        data = await handle_meal_suggestion(user_id, sub_intent, entities, message)

    elif intent == "reminder_check":
        data = await handle_reminder_check(user_id, entities, message)

    elif intent == "meal_plan_week":
        data = await handle_meal_plan_week(user_id, entities)

    elif intent == "budget_meal":
        data = await handle_budget_meal(user_id, entities, message)

    elif intent == "shopping_complete":
        data = await handle_shopping_complete(user_id, entities, message)

    elif intent == "shopping_list_add":
        data = await handle_shopping_list_add(user_id, entities, message)

    elif intent == "budget_set":
        data = await handle_budget_set(user_id, entities, message)

    elif intent == "share_list":
        data = await handle_share_list(user_id, entities, message)

    # Step 3: Generate response
    response_text = generate_response(intent, sub_intent, data, entities)

    return ChatResponse(
        intent=intent,
        sub_intent=sub_intent,
        response_text=response_text,
        data=data
    )
