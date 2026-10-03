# Verification record

Verified locally on 2026-10-03.

- 19 automated tests passed (`npm run test:embedded`).
- Server TypeScript and production frontend build passed (`npm run build`).
- Desktop browser workflow and 390px mobile layout passed; screenshots are in `docs/screenshots`.
- Integration tests execute the committed PostgreSQL migration using PGlite. This verifies database-backed behavior; it is not a hosted deployment test.
- GitHub Actions is configured to repeat the integration suite against a PostgreSQL 16 service. CI results must be checked separately.

## Hosted testing status

No hosted end-to-end verification has been completed. The requested ChatGPT Sites runtime uses Cloudflare Workers and cannot directly run the current Node server deployment. A compatible backend host is needed to keep the specified PostgreSQL/Prisma/Socket.IO architecture while placing the frontend on Sites. Do not treat local test passes as proof that hosted configuration works.

ShopStack's simulator is a demo payment flow. Hosted Stripe Checkout requires test credentials and an externally reachable webhook; provider checkout has not been exercised with live test credentials.
