# Railglide Mobile

React Native (Expo SDK 57) client for Railglide. It's a second head on the same
backend as the web app — same `/api/*` routes, same route planner, same
`@railglide/shared` contracts. See [`../../todo/MOBILE_ARCHITECTURE.md`](../../todo/MOBILE_ARCHITECTURE.md).

## Run

```bash
cd apps/mobile
npx expo start
```

Then open **Expo Go** and scan the QR (or press `i` / `a` for a simulator /
emulator). No dev build is needed yet — the wallet/native-crypto step (which
requires `expo-dev-client`) is deferred.

## Environment

Expo inlines any `EXPO_PUBLIC_*` var at build time. Create `apps/mobile/.env`:

```bash
# Backend origin the app calls. A physical phone can't reach the dev machine's
# localhost — use the machine's LAN IP (find it with `ipconfig getifaddr en0`).
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000

# testnet (default) | mainnet — mirrors the web app's NEXT_PUBLIC_NETWORK.
EXPO_PUBLIC_NETWORK=testnet
```

Run the web backend alongside it (`npm run web:dev` from the repo root) so the
mobile app has `/api/chat`, `/api/router`, etc. to talk to.

## Status (Phase 1)

- **Ask** tab — natural-language intent chat wired to `/api/chat`. On a ready
  reply it stashes the `FlowLaunch` in the session store and hands off.
- **Cash out** tab — renders the handed-off intent (no signing yet; Phase 2).
- **History / Recipients** — placeholders (next).

## Checks

```bash
npm run typecheck        # tsc
npx expo export ...      # full Metro bundle (resolution check)
```
