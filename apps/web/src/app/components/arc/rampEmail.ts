"use client";

/**
 * The KYC/contact email the ramp flows share. Entered once, remembered on-device
 * (localStorage), and reused across Buy and Sell so we never ask twice. Never
 * leaves the browser except as the order's `userEmail`.
 */
const EMAIL_KEY = "railglide:ramp:email";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function loadSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveEmail(email: string): void {
  try {
    localStorage.setItem(EMAIL_KEY, email.trim());
  } catch {
    // localStorage unavailable — the email just won't persist this session.
  }
}
