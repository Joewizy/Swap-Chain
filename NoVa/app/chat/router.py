"""
Chat API router.

Provides the main chat endpoint and conversation history retrieval.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.agent.chat import chat, get_session_history
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
async def send_message(request: ChatRequest):
    """
    Send a message to the NoVa AI chatbot.

    The agent will:
    1. Understand the message (general chat or transaction intent)
    2. For general chat: respond helpfully
    3. For transaction intents (swap/transfer/sell):
       - Extract required data
       - Ask clarifying questions if needed
       - Queue the transaction after user confirmation
    """
    result = await chat(
        user_id=request.user_id,
        message=request.message,
        session_id=request.session_id,
    )
    return ChatResponse(**result)


@router.get("/history/{session_id}")
async def get_chat_history(session_id: str):
    """
    Retrieve the conversation history for a given session.

    Useful for re-rendering a chat on the frontend after page reload.
    """
    history = get_session_history(session_id)
    return {
        "session_id": session_id,
        "message_count": len(history),
        "messages": history,
    }
