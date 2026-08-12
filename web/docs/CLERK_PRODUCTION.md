# Clerk production setup (HoneyMatcha)

Embedded sign-in / sign-up are branded in code (`src/lib/clerk-appearance.ts`). Production still needs live Clerk keys and OAuth configured in the Clerk Dashboard.

## Required for production

1. **Live API keys** — set env vars to `pk_live_…` / `sk_live_…` (not `pk_test_` / `sk_test_`).
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - The Clerk “Development mode” banner only disappears with `pk_live_`. `unsafe_disableDevelopmentModeWarnings` only hides in-component notices.

2. **Custom Google OAuth** — in the [Clerk Dashboard](https://dashboard.clerk.com), configure Google as a social connection with **your** Google Cloud OAuth client (not Clerk’s shared development credentials). Add authorized redirect URIs for `https://honeymatcha.io` (and any staging hosts).

3. **Allowed origins / redirect URLs** — add `https://honeymatcha.io` (and Render preview URLs if used) under Clerk Domains / Paths so `/sign-in` and `/sign-up` complete on your domain instead of feeling like `clerk.accounts.dev`.

Never commit secret keys. Use Render (or local `.env.local`) only.
