/**
 * Assistant endpoint wrapper — POST /api/chat.
 *
 * Reuses the exact `ChatMessage` / `ChatReply` contract the backend and web
 * client share, imported from `@railglide/shared`. Phase 1 wires this into the
 * intent chat screen; here it just establishes the typed call so the shared
 * contract is proven end to end on mobile.
 */

import type { ChatMessage, ChatReply } from "@railglide/shared/assistant/types";
import { apiFetch } from "./client";

export async function sendChat(messages: ChatMessage[]): Promise<ChatReply> {
  return apiFetch<ChatReply>("/api/chat", {
    method: "POST",
    body: JSON.stringify({ messages }),
  });
}
