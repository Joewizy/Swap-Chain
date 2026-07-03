/**
 * Design tokens — mirrors the Railglide website (src/app/globals.css).
 *
 * Light, warm and restrained: off-white base, ink text, one confident coral
 * accent, ink primary buttons. Every screen reads from here, so this file is
 * the single source of the app's look.
 */
export const theme = {
  colors: {
    // surfaces
    bg: "#F8F6F1", // warm off-white
    bgSoft: "#F1EEE7",
    surface: "#FFFFFF", // elevated cards
    sunk: "#EEEAE1",

    // text
    text: "#14120E", // ink
    textSoft: "#2D2A22",
    muted: "#6E6A5E",
    faint: "#989385",

    // one accent — warm coral
    accent: "#D9694A",
    accentFg: "#FFFFFF",
    accentSoft: "rgba(217, 105, 74, 0.10)",
    accentLine: "rgba(217, 105, 74, 0.30)",

    // hairlines
    border: "rgba(20, 18, 14, 0.10)",
    border2: "rgba(20, 18, 14, 0.16)",

    // primary button — confident dark ink
    btnBg: "#14120E",
    btnFg: "#F8F6F1",

    // status — desaturated
    ok: "#2F7A4F",
    okSoft: "rgba(47, 122, 79, 0.10)",
    pend: "#B26A1A",
    err: "#B23A2A",
    errSoft: "rgba(178, 58, 42, 0.10)",
  },
  radius: {
    input: 10,
    card: 16,
    cardLg: 20,
    pill: 999,
  },
  // One soft elevation, as the website's tokens prescribe.
  shadow: {
    shadowColor: "#14120E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  },
  /** Editorial display face — loaded in App.tsx (Instrument Serif, the site's). */
  serif: "InstrumentSerif_400Regular",
  spacing: (n: number) => n * 8,
} as const;
