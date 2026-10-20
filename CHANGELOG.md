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
| 12 | JWT unit tests | 136a1f8 |
| 14 | Playwright E2E tests | 7444665 |
| 15 | README quickstart | fa58b57 |
| 17 | CHANGELOG, FEATURE-PARITY.md, migration-verification.txt | this commit |

### Not complete / not verified
- Task 11 (run + verify data migration): no commit; see migration-verification.txt.
- Task 13 (API integration tests): `test/api.test.js` exists but is uncommitted and fails at startup.
- Task 16 (.env.example / docs/ENVIRONMENT.md): in progress, uncommitted at time of tagging.
- Docker build, docker-compose, curl login/health, and E2E suite were not run (no Docker in this environment).

See FEATURE-PARITY.md for the action checklist.
