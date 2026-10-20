# Feature Parity Checklist

Approach: `server.js` POST `/api` calls the same `handleApi` (`netlify/functions/_core.mjs`) as the Netlify version, with a SQL key/value store instead of Netlify Blobs. Parity is therefore by construction (same handler code).
Legend: [x] handler present and routed through the SQL-backed endpoint; runtime verification against PostgreSQL has NOT been run (no Docker/psql in the verification environment).

## API actions (24 in `_core.mjs`; the plan's "30+" figure does not match the code)

Public (no token): 
- [x] login
- [x] signup
- [x] reset-password
- [x] unlockChildDirect (child PIN)
- [x] submitGrade
- [x] getTaskStats
- [x] getFamilyData (listed as public; no `case` in the switch)
- [x] getLevelConfig
- [x] updateLevelConfig
- [x] resetLevelConfig
- [x] getAdminStats
- [x] adminResetPassword
- [x] adminDeleteAccount
- [x] adminResetPin
- [x] adminDeleteFamily

Authenticated (Bearer JWT):
- [x] me
- [x] verifyPassword
- [x] changePassword
- [x] saveFamily
- [x] createFamily
- [x] deleteFamily
- [x] invite
- [x] removeAdult
- [x] approveGrade

## Infrastructure
- [x] Health endpoint, JWT middleware, scrypt password hashing (shared with Netlify code)
- [x] PostgreSQL schema + SQLite adapter (`database.js`, `schema.sql`)
- [x] Seed data (`seed-demo.sql`)
- [ ] Docker build / docker-compose run: not executed
- [ ] Login flow + /health curl against running container: not executed
- [ ] Data migration executed against real Firebase export: not confirmed (see migration-verification.txt)

## Tests
- [x] `test/auth.test.js` (vitest): passes
- [ ] `test/api.test.js` (vitest): fails at startup (server process.exit without database); uncommitted
- [ ] `tests/e2e` Playwright: not executed
