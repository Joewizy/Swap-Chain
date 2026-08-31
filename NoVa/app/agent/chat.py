"""
Agent orchestration for the NoVa AI Chatbot.

Creates a LangChain agent backed by Groq (llama-3.3-70b-versatile),
manages per-session conversation history, and routes tool calls.
"""

from __future__ import annotations

import os
import uuid
from typing import Optional

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.system_prompt import SYSTEM_PROMPT
from app.agent.tools import ALL_TOOLS, set_current_user

load_dotenv()

# Initialized on first request to avoid crashing at import when no API key set.

_llm_with_tools = None


def _get_llm():
    """Lazily initialize the Groq LLM with tool bindings."""
    global _llm_with_tools
    if _llm_with_tools is None:
        from langchain_groq import ChatGroq

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY not set. Add it to your .env file."
            )
        llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            api_key=api_key,
        )
        _llm_with_tools = llm.bind_tools(ALL_TOOLS)
    return _llm_with_tools


# ── Conversation Memory ──────────────────────────────────────────────────────
# session_id -> list of LangChain message objects
_sessions: dict[str, list] = {}

# Map tool names to their callable functions
_tool_map = {tool.name: tool for tool in ALL_TOOLS}


def _get_or_create_session(session_id: Optional[str]) -> tuple[str, list]:
    """Return (session_id, message_history), creating if needed."""
    if session_id and session_id in _sessions:
        return session_id, _sessions[session_id]

    sid = session_id or str(uuid.uuid4())
    _sessions[sid] = [SystemMessage(content=SYSTEM_PROMPT)]
    return sid, _sessions[sid]


# ── Main Chat Function ───────────────────────────────────────────────────────

async def chat(
    user_id: str,
    message: str,
    session_id: Optional[str] = None,
) -> dict:
    """
    Process a user message through the agent.

    Args:
        user_id:    Unique user identifier (for balance lookups etc.)
        message:    The user's natural-language message.
        session_id: Optional session ID for conversation continuity.

    Returns:
        dict with keys: response, transaction_queued, transaction, session_id
    """
    # Set user context so tools can access it
    set_current_user(user_id)

    sid, history = _get_or_create_session(session_id)

    # Add the user message
    history.append(HumanMessage(content=message))

    # Track whether a transaction was queued
    transaction_queued = False
    transaction_details = None

    # Agent loop: keep processing until the LLM produces a final text response
    max_iterations = 10  # Safety limit
    for _ in range(max_iterations):
        llm = _get_llm()
        response = await llm.ainvoke(history)
        history.append(response)

        # If no tool calls, this is the final response
        if not response.tool_calls:
            break

        # Process each tool call
        from langchain_core.messages import ToolMessage

        for tool_call in response.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]

            if tool_name in _tool_map:
                # Execute the tool
                result = _tool_map[tool_name].invoke(tool_args)

                # Check if a transaction was queued
                if "queued successfully" in str(result):
                    transaction_queued = True
                    transaction_details = {
                        "intent": tool_name.replace("queue_", "").replace(
                            "_transaction", ""
                        ),
                        **tool_args,
                    }

                # Add tool result to history
                history.append(
                    ToolMessage(
                        content=str(result),
                        tool_call_id=tool_call["id"],
                    )
                )
            else:
                # Unknown tool — shouldn't happen, but be safe
                history.append(
                    ToolMessage(
                        content=f"Error: Unknown tool '{tool_name}'",
                        tool_call_id=tool_call["id"],
                    )
                )

    # Extract the final text response
    final_response = response.content if response.content else (
        "Transaction processed. Check the details above."
    )

    return {
        "response": final_response,
        "transaction_queued": transaction_queued,
        "transaction": transaction_details,
        "session_id": sid,
    }


def get_session_history(session_id: str) -> list[dict]:
    """
    Get the conversation history for a session.
    Returns a list of {role, content} dicts.
    """
    if session_id not in _sessions:
        return []

    result = []
    for msg in _sessions[session_id]:
        if isinstance(msg, SystemMessage):
            continue  # Don't expose the system prompt
        elif isinstance(msg, HumanMessage):
            result.append({"role": "user", "content": msg.content})
        elif isinstance(msg, AIMessage):
            content = msg.content if msg.content else "[tool call]"
            result.append({"role": "assistant", "content": content})

    return result
