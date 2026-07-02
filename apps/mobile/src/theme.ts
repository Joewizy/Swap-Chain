/**
 * Minimal design tokens. Kept deliberately small for the scaffold — the real
 * Phase-1 UI will flesh this out to match the Railglide web aesthetic.
 */
export const theme = {
  colors: {
    bg: "#0B0B0F",
    surface: "#15151C",
    text: "#F5F5F7",
    muted: "#8A8A99",
    accent: "#6C5CE7",
    border: "#26262F",
  },
  spacing: (n: number) => n * 8,
} as const;
