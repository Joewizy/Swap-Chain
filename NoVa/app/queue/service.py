"""
Queue service layer.

Thin wrapper over the mock database for transaction queue operations.
Exists as a separate module for clean separation — when the real DB
is added, only this file and app/database.py need to change.
"""

from __future__ import annotations

from typing import Optional

from app.database import (
    add_to_queue,
    get_all_transactions,
    get_pending_transactions,
    get_transaction_by_id,
    update_transaction_status,
)
from app.schemas import QueueItem, TransactionIntent, TransactionStatus


def enqueue(
    user_id: str,
    intent: TransactionIntent,
    payload: dict,
) -> QueueItem:
    """Add a transaction to the queue and return the created item."""
    return add_to_queue(user_id, intent, payload)


def fetch_pending() -> list[dict]:
    """Return all pending transactions for backend processing."""
    return get_pending_transactions()


def fetch_all() -> list[dict]:
    """Return all transactions regardless of status."""
    return get_all_transactions()


def fetch_by_id(transaction_id: str) -> Optional[dict]:
    """Fetch a specific transaction by ID."""
    return get_transaction_by_id(transaction_id)


def mark_status(
    transaction_id: str, status: TransactionStatus
) -> Optional[dict]:
    """Update a transaction's status (e.g. processing → completed)."""
    return update_transaction_status(transaction_id, status)
