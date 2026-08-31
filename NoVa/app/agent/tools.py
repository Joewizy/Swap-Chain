"""
LangChain tools for the NoVa AI agent.

These tools are callable by the LLM when it detects transaction intents.
Each tool validates the input, checks balances, and queues the transaction.
"""

from __future__ import annotations

from typing import Optional

from langchain_core.tools import tool

from app.database import add_to_queue, get_user_balance, get_user_wallet
from app.schemas import TransactionIntent


# ── Shared context ───────────────────────────────────────────────────────────
# The current user_id is injected per-request via the agent runner.
# We use a simple module-level variable for now.

_current_user_id: str = "unknown"


def set_current_user(user_id: str) -> None:
    """Set the user context for the current request."""
    global _current_user_id
    _current_user_id = user_id


# ── Tools ────────────────────────────────────────────────────────────────────

@tool
def queue_swap_transaction(
    token_in: str,
    token_out: str,
    amount: float,
    source_chain: str = "auto",
    destination_chain: str = "auto",
) -> str:
    """Queue a token swap transaction.

    Use this tool when a user wants to SWAP one cryptocurrency for another.
    Only call this AFTER the user has confirmed the transaction details.

    Args:
        token_in: The token the user currently holds and wants to swap FROM
                  (e.g. "BTC", "ETH", "USDT").
        token_out: The token the user wants to swap TO
                   (e.g. "ETH", "SOL", "BNB").
        amount: The amount of token_in to swap (must be > 0).
        source_chain: Blockchain network of token_in
                      (e.g. "ethereum", "bsc"). Defaults to "auto".
        destination_chain: Blockchain network of token_out.
                           Defaults to "auto".

    Returns:
        A confirmation string with the queued transaction details.
    """
    user_id = _current_user_id

    # Check balance
    balance = get_user_balance(user_id, token_in)
    sufficient_balance = balance is not None and balance >= amount

    # Gas fee: 10% of the transaction amount
    estimated_gas_fee = round(amount * 0.10, 8)

    payload = {
        "token_in": token_in.upper(),
        "token_out": token_out.upper(),
        "amount": amount,
        "source_chain": source_chain,
        "destination_chain": destination_chain,
        "estimated_gas_fee": estimated_gas_fee,
        "user_balance": balance,
        "sufficient_balance": sufficient_balance,
    }

    if not sufficient_balance:
        return (
            f"Insufficient balance. You have "
            f"{balance if balance is not None else 0} {token_in.upper()}, "
            f"but you're trying to swap {amount}. "
            f"Transaction NOT queued."
        )

    item = add_to_queue(user_id, TransactionIntent.SWAP, payload)
    return (
        f"Swap transaction queued successfully!\n"
        f"• ID: {item.id}\n"
        f"• Swap: {amount} {token_in.upper()} → {token_out.upper()}\n"
        f"• Source chain: {source_chain}\n"
        f"• Destination chain: {destination_chain}\n"
        f"• Estimated gas fee: {estimated_gas_fee} {token_in.upper()}\n"
        f"• Status: {item.status.value}"
    )


@tool
def queue_transfer_transaction(
    token: str,
    amount: float,
    recipient_address: str,
    chain: str = "auto",
) -> str:
    """Queue a token transfer transaction.

    Use this tool when a user wants to SEND/TRANSFER tokens to another wallet.
    Only call this AFTER the user has confirmed the transaction details.

    Args:
        token: The token to transfer (e.g. "BTC", "ETH", "USDT").
        amount: The amount to send (must be > 0).
        recipient_address: The destination wallet address.
        chain: The blockchain network (e.g. "ethereum", "bsc").
               Defaults to "auto".

    Returns:
        A confirmation string with the queued transaction details.
    """
    user_id = _current_user_id

    # Check balance
    balance = get_user_balance(user_id, token)
    sufficient_balance = balance is not None and balance >= amount

    # Gas fee: 10% of the transaction amount
    estimated_gas_fee = round(amount * 0.10, 8)

    payload = {
        "token": token.upper(),
        "amount": amount,
        "recipient_address": recipient_address,
        "chain": chain,
        "estimated_gas_fee": estimated_gas_fee,
        "user_balance": balance,
        "sufficient_balance": sufficient_balance,
    }

    if not sufficient_balance:
        return (
            f"Insufficient balance. You have "
            f"{balance if balance is not None else 0} {token.upper()}, "
            f"but you're trying to send {amount}. "
            f"Transaction NOT queued."
        )

    item = add_to_queue(user_id, TransactionIntent.TRANSFER, payload)
    return (
        f"Transfer queued successfully!\n"
        f"• ID: {item.id}\n"
        f"• Send: {amount} {token.upper()}\n"
        f"• To: {recipient_address}\n"
        f"• Chain: {chain}\n"
        f"• Estimated gas fee: {estimated_gas_fee} {token.upper()}\n"
        f"• Status: {item.status.value}"
    )


@tool
def queue_sell_transaction(
    token_in: str,
    amount: float,
    token_out: str = "USDT",
    source_chain: str = "auto",
    destination_chain: str = "auto",
) -> str:
    """Queue a token sell transaction.

    Use this tool when a user wants to SELL a cryptocurrency (convert to
    stablecoin or another token). Only call this AFTER the user has
    confirmed the transaction details.

    Args:
        token_in: The token the user wants to sell (e.g. "BTC", "ETH").
        amount: The amount of token_in to sell (must be > 0).
        token_out: The token to receive in exchange.
                   Defaults to "USDT".
        source_chain: Blockchain network of token_in. Defaults to "auto".
        destination_chain: Blockchain network of token_out. Defaults to "auto".

    Returns:
        A confirmation string with the queued transaction details.
    """
    user_id = _current_user_id

    # Check balance
    balance = get_user_balance(user_id, token_in)
    sufficient_balance = balance is not None and balance >= amount

    # Gas fee: 10% of the transaction amount
    estimated_gas_fee = round(amount * 0.10, 8)

    # Routing validation placeholder — always True for now
    routing_valid = True
    confirmation_required = routing_valid and sufficient_balance

    payload = {
        "token_in": token_in.upper(),
        "token_out": token_out.upper(),
        "amount": amount,
        "source_chain": source_chain,
        "destination_chain": destination_chain,
        "estimated_gas_fee": estimated_gas_fee,
        "user_balance": balance,
        "routing_valid": routing_valid,
        "confirmation_required": confirmation_required,
        "sufficient_balance": sufficient_balance,
    }

    if not sufficient_balance:
        return (
            f"Insufficient balance. You have "
            f"{balance if balance is not None else 0} {token_in.upper()}, "
            f"but you're trying to sell {amount}. "
            f"Transaction NOT queued."
        )

    item = add_to_queue(user_id, TransactionIntent.SELL, payload)
    return (
        f"Sell transaction queued successfully!\n"
        f"• ID: {item.id}\n"
        f"• Sell: {amount} {token_in.upper()} → {token_out.upper()}\n"
        f"• Source chain: {source_chain}\n"
        f"• Destination chain: {destination_chain}\n"
        f"• Estimated gas fee: {estimated_gas_fee} {token_in.upper()}\n"
        f"• Status: {item.status.value}"
    )


@tool
def check_wallet_balance(token: Optional[str] = None) -> str:
    """Check the user's token balance(s).

    Use this tool to look up how much of a token (or all tokens) the user has.

    Args:
        token: Specific token to check (e.g. "BTC"). If None, returns all.

    Returns:
        A string with the user's balance information.
    """
    user_id = _current_user_id

    if token:
        balance = get_user_balance(user_id, token)
        if balance is None:
            return f"No {token.upper()} found in your wallet."
        return f"Your {token.upper()} balance: {balance}"

    wallet = get_user_wallet(user_id)
    if not wallet:
        return "Your wallet is empty or not found."

    lines = [f"Your wallet balances:"]
    for tok, bal in sorted(wallet.items()):
        lines.append(f"  • {tok}: {bal}")
    return "\n".join(lines)


# ── Tool list for the agent ──────────────────────────────────────────────────

ALL_TOOLS = [
    queue_swap_transaction,
    queue_transfer_transaction,
    queue_sell_transaction,
    check_wallet_balance,
]
