"""
Pydantic schemas for NoVa AI Chatbot.
Defines request/response models and transaction payload structures.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────

class TransactionIntent(str, Enum):
    """Supported transaction intent types."""
    SWAP = "swap"
    TRANSFER = "transfer"
    SELL = "sell"


class TransactionStatus(str, Enum):
    """Lifecycle status of a queued transaction."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# ── Chat Models ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Incoming chat message from the frontend."""
    user_id: str = Field(..., description="Unique user identifier")
    message: str = Field(..., description="User's natural-language message")
    session_id: Optional[str] = Field(
        None, description="Chat session ID for conversation continuity"
    )


class ChatResponse(BaseModel):
    """Response sent back to the frontend."""
    response: str = Field(..., description="Chatbot's reply")
    transaction_queued: bool = Field(
        False, description="Whether a transaction was queued"
    )
    transaction: Optional[dict] = Field(
        None, description="Transaction details if one was queued"
    )
    session_id: str = Field(..., description="Session ID for this conversation")


# ── Transaction Payloads ─────────────────────────────────────────────────────

class SwapPayload(BaseModel):
    """Data required to execute a token swap."""
    token_in: str = Field(..., description="Token the user currently holds")
    token_out: str = Field(..., description="Token the user wants to receive")
    amount: float = Field(..., gt=0, description="Amount of token_in to swap")
    source_chain: str = Field(
        "auto", description="Blockchain of token_in (e.g. ethereum, bsc)"
    )
    destination_chain: str = Field(
        "auto", description="Blockchain of token_out"
    )


class TransferPayload(BaseModel):
    """Data required to execute a token transfer."""
    token: str = Field(..., description="Token to transfer")
    amount: float = Field(..., gt=0, description="Amount to transfer")
    recipient_address: str = Field(
        ..., description="Wallet address of the recipient"
    )
    chain: str = Field(
        "auto", description="Blockchain network for the transfer"
    )


class SellPayload(BaseModel):
    """Data required to execute a token sell."""
    token_in: str = Field(..., description="Token the user wants to sell")
    token_out: str = Field(
        "USDT", description="Token to receive (defaults to USDT/stablecoin)"
    )
    amount: float = Field(..., gt=0, description="Amount of token_in to sell")
    source_chain: str = Field("auto", description="Blockchain of token_in")
    destination_chain: str = Field("auto", description="Blockchain of token_out")


# ── Queue Models ─────────────────────────────────────────────────────────────

class QueueItem(BaseModel):
    """A transaction record in the queue."""
    id: str = Field(..., description="Unique transaction ID")
    user_id: str
    intent: TransactionIntent
    payload: dict
    status: TransactionStatus = TransactionStatus.PENDING
    created_at: datetime
    updated_at: datetime


class QueueStatusUpdate(BaseModel):
    """Request body for updating a transaction's status."""
    status: TransactionStatus
