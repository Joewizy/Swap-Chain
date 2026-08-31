"""
NoVa AI Chatbot — FastAPI Application Entry Point
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.chat.router import router as chat_router
from app.queue.router import router as queue_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup / shutdown events."""
    print("🚀 NoVa AI Chatbot is starting up...")
    yield
    print("👋 NoVa AI Chatbot is shutting down...")


app = FastAPI(
    title="NoVa AI Chatbot",
    description=(
        "AI-powered chatbot for the NoVa blockchain platform. "
        "Handles general crypto Q&A, detects transaction intents "
        "(swap, transfer, sell), and queues them for backend execution."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(chat_router)
app.include_router(queue_router)


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "NoVa AI Chatbot",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
