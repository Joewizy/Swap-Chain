"""
Queue API router.

Provides endpoints for the backend to consume queued transactions.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.queue import service
from app.schemas import QueueStatusUpdate

router = APIRouter(prefix="/api/queue", tags=["Transaction Queue"])


@router.get("/pending")
async def get_pending_transactions():
    """
    Fetch all pending transactions for backend processing.

    The backend worker should poll this endpoint, pick up pending
    transactions, execute them, then PATCH the status to
    'processing' / 'completed' / 'failed'.
    """
    return {
        "count": len(service.fetch_pending()),
        "transactions": service.fetch_pending(),
    }


@router.get("/all")
async def get_all_transactions():
    """Fetch all transactions regardless of status."""
    transactions = service.fetch_all()
    return {
        "count": len(transactions),
        "transactions": transactions,
    }


@router.get("/{transaction_id}")
async def get_transaction(transaction_id: str):
    """Fetch a single transaction by its ID."""
    item = service.fetch_by_id(transaction_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return item


@router.patch("/{transaction_id}/status")
async def update_transaction_status(
    transaction_id: str, body: QueueStatusUpdate
):
    """
    Update the status of a queued transaction.

    Use this after picking up a pending transaction to mark it as
    'processing', 'completed', or 'failed'.
    """
    updated = service.mark_status(transaction_id, body.status)
    if updated is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Status updated", "transaction": updated}
