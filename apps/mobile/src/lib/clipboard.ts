import { Share } from "react-native";

type ClipboardApi = { setStringAsync(text: string): Promise<boolean> };

let clipboard: ClipboardApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboard = require("expo-clipboard") as ClipboardApi;
} catch {
  clipboard = null;
}

/** True when the native clipboard module linked; Share still works either way. */
export const clipboardAvailable = clipboard != null;

/**
 * Copy text to the clipboard. If the native module is missing or throws,
 * opens the system share sheet so the user can still copy / send the value.
 * Always returns true when either path succeeds.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (clipboard?.setStringAsync) {
      await clipboard.setStringAsync(text);
      return true;
    }
  } catch {
    // fall through to Share
  }
  try {
    await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}
