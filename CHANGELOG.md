# Changelog

## v1.0.0-containerized (2026-10-20)

Containerized, self-hosted version of DailyKids Quest: Express + PostgreSQL/SQLite replacing Netlify Functions + Blobs/Firebase. The API handler (`handleApi`) is shared with the Netlify version.

### Delivered (task -> commit)
| Task | Deliverable | Commit |
|---|---|---|
| 1 | Multi-stage Dockerfile | a26f21a |
| 2 | docker-compose.dev.yml | e28800d |
| 3 | PostgreSQL schema | a61bd87 |
| 4 | Demo seed data | 1573b99 |
| 5 | Express server | 3bda939 |
| 6 | Database adapter (PG/SQLite) | 3b93cc9 |
| 7 | JWT authentication | a137c42 |
| 8 | POST /api on SQL key/value store | 3f69c4c |
| 9 | Firebase export script | d6edf75 |
| 10 | Firebase -> PostgreSQL transform | 3c8090f |
| 11 | Migration verification report | 08a35dd |
| 12 | JWT unit tests | 136a1f8 |
| 14 | Playwright E2E tests | 7444665 |
| 15 | README quickstart | fa58b57 |
| 16 | Environment documentation | a39314a |
| 17 | CHANGELOG, FEATURE-PARITY.md | this commit |

### Not complete / not verified
- Task 11 migration: export + transform run, but generated migration.sql would FAIL on load (duplicate user emails, NULL password hashes, duplicate child id); load into PostgreSQL not run. See migration-verification.txt.
- Task 13 (API integration tests): `test/api.test.js` exists but is uncommitted and fails at startup (needs a database).
- Docker build, docker-compose, curl login/health, and E2E suite were not run (no Docker in this environment).

See FEATURE-PARITY.md for the action checklist.
