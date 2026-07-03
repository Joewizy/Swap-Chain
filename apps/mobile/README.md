# Railglide Mobile

React Native (Expo SDK 57) client for Railglide. It's a second head on the same
backend as the web app — same `/api/*` routes, same route planner, same
`@railglide/shared` contracts. See [`../../todo/MOBILE_ARCHITECTURE.md`](../../todo/MOBILE_ARCHITECTURE.md).

## Run

The wallet stack (Reown AppKit + `react-native-quick-crypto`) uses native
modules, so the app runs in a **custom dev client — not Expo Go**. Build and
install it once per native-dependency change:

```bash
cd apps/mobile
npx expo run:android      # needs Android Studio + SDK / an emulator or device
# or
npx expo run:ios          # needs Xcode (macOS)
```

That prebuilds (`android/` · `ios/`), applies the config plugins (quick-crypto,
build-properties), compiles, and launches. After the first build, iterate with
`npx expo start --dev-client` and reload JS without rebuilding — until you touch
native deps again.

## Environment

Expo inlines any `EXPO_PUBLIC_*` var at build time. Create `apps/mobile/.env`:

```bash
# Backend origin the app calls. A physical phone can't reach the dev machine's
# localhost — use the machine's LAN IP (find it with `ipconfig getifaddr en0`).
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000

# testnet (default) | mainnet — mirrors the web app's NEXT_PUBLIC_NETWORK.
EXPO_PUBLIC_NETWORK=testnet

# WalletConnect / Reown project id (free at cloud.reown.com) — required for
# wallet connect + SIWE sign-in on the History tab.
EXPO_PUBLIC_REOWN_PROJECT_ID=your_project_id
```

Run the web backend alongside it (`npm run web:dev` from the repo root) so the
mobile app has `/api/chat`, `/api/router`, etc. to talk to.

## Status

- **Ask** — natural-language intent chat wired to `/api/chat`. On a ready reply
  it stashes the `FlowLaunch` in the session store and hands off.
- **Cash out** — renders the handed-off intent (no signing yet; the signed
  cash-out flow is next).
- **Recipients** — device-local AsyncStorage address book (add / delete).
- **History** — wallet connect (Reown AppKit) + SIWE sign-in → the authenticated
  wallet's Paycrest orders. Session token lives in `expo-secure-store` and is
  sent as `Authorization: Bearer` (the backend accepts cookie or bearer).

## Checks

```bash
npm run typecheck        # tsc
npx expo export ...      # full Metro bundle (resolution check)
```
