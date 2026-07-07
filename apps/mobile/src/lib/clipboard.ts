type ClipboardApi = { setStringAsync(text: string): Promise<boolean> };

let clipboard: ClipboardApi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  clipboard = require("expo-clipboard") as ClipboardApi;
} catch {
  clipboard = null;
}

/** Whether the native clipboard module is available in this build. */
export const clipboardAvailable = clipboard != null;

/** Copy text to the clipboard. Returns false if the native module is missing. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (!clipboard?.setStringAsync) return false;
    await clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
