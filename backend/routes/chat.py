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
    handle_expense_query,
    handle_suggestion,
    handle_meal_suggestion,
    handle_shopping_complete,
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

    elif intent == "expense_query":
        data = await handle_expense_query(user_id, sub_intent, entities)

    elif intent == "suggestion":
        data = await handle_suggestion(user_id, sub_intent, entities)

    elif intent == "meal_suggestion":
        data = await handle_meal_suggestion(user_id, sub_intent, entities)

    elif intent == "shopping_complete":
        data = await handle_shopping_complete(user_id, entities, message)

    # Step 3: Generate response
    response_text = generate_response(intent, sub_intent, data, entities)

    return ChatResponse(
        intent=intent,
        sub_intent=sub_intent,
        response_text=response_text,
        data=data
    )
