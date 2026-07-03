/**
 * Assistant endpoint wrapper — POST /api/chat.
 *
 * Reuses the exact `ChatMessage` / `ChatReply` contract the backend and web
 * client share, imported from `@railglide/shared`. Phase 1 wires this into the
 * intent chat screen; here it just establishes the typed call so the shared
 * contract is proven end to end on mobile.
 */

import type { ChatMessage, ChatReply } from "@railglide/shared/assistant/types";
import { apiFetch, ApiError } from "./client";

// Post the conversation to the assistant; unwrap the backend's { error } body
// into a plain ApiError message.
export async function sendChat(messages: ChatMessage[]): Promise<ChatReply> {
  try {
    return await apiFetch<ChatReply>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      let message = err.message;
      try {
        const parsed = JSON.parse(err.message) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        // body wasn't JSON — keep the raw text
      }
      throw new ApiError(message, err.status);
    }
    throw err;
  }
}
