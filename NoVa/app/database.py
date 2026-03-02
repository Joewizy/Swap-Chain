"""
Mock database layer for NoVa AI Chatbot.

Provides in-memory storage for:
  - Transaction queue
  - User balances / wallet data (placeholder)

This module will be replaced with a real database (PostgreSQL + SQLAlchemy)
once the backend database schema is ready.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.schemas import QueueItem, TransactionIntent, TransactionStatus


# ── In-Memory Stores ─────────────────────────────────────────────────────────

# Transaction queue: list of QueueItem dicts
_transaction_queue: list[dict] = []

# Mock user balances: user_id -> {token -> balance}
_user_balances: dict[str, dict[str, float]] = {
    # Example mock data — extend or modify as needed for testing
    "test_user": {
        "BTC": 0.5,
        "ETH": 2.0,
        "USDT": 1000.0,
        "BNB": 5.0,
        "SOL": 20.0,
    },
    "demo_user": {
        "BTC": 0.1,
        "ETH": 1.5,
        "USDT": 500.0,
    },
}


# ── User Balance Operations ──────────────────────────────────────────────────

def get_user_balance(user_id: str, token: str) -> Optional[float]:
    """
    Look up how much of a given token a user holds.
    Returns None if user or token not found.
    """
    user_wallet = _user_balances.get(user_id)
    if user_wallet is None:
        return None
    return user_wallet.get(token.upper())


def get_user_wallet(user_id: str) -> dict[str, float]:
    """Return the full wallet for a user (empty dict if unknown user)."""
    return _user_balances.get(user_id, {})


def set_user_balance(user_id: str, token: str, balance: float) -> None:
    """Set (or create) a user's balance for a specific token."""
    if user_id not in _user_balances:
        _user_balances[user_id] = {}
    _user_balances[user_id][token.upper()] = balance


# ── Transaction Queue Operations ─────────────────────────────────────────────

def add_to_queue(
    user_id: str,
    intent: TransactionIntent,
    payload: dict,
) -> QueueItem:
    """
    Add a new transaction to the queue.
    Returns the created QueueItem.
    """
    now = datetime.now(timezone.utc)
    item = QueueItem(
        id=str(uuid.uuid4()),
        user_id=user_id,
        intent=intent,
        payload=payload,
        status=TransactionStatus.PENDING,
        created_at=now,
        updated_at=now,
    )
    _transaction_queue.append(item.model_dump())
    return item


def get_pending_transactions() -> list[dict]:
    """Return all transactions with status 'pending'."""
    return [
        t for t in _transaction_queue
        if t["status"] == TransactionStatus.PENDING
    ]


def get_all_transactions() -> list[dict]:
    """Return every transaction in the queue."""
    return list(_transaction_queue)


def get_transaction_by_id(transaction_id: str) -> Optional[dict]:
    """Fetch a single transaction by its ID."""
    for t in _transaction_queue:
        if t["id"] == transaction_id:
            return t
    return None


def update_transaction_status(
    transaction_id: str, status: TransactionStatus
) -> Optional[dict]:
    """
    Update the status of a queued transaction.
    Returns the updated record, or None if not found.
    """
    for t in _transaction_queue:
        if t["id"] == transaction_id:
            t["status"] = status
            t["updated_at"] = datetime.now(timezone.utc)
            return t
    return None
