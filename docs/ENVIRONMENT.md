# Environment Variables Reference

## Core

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| NODE_ENV | No | development | development \| production |
| PORT | No | 3000 | Server port |

## Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | No | sqlite://./data/dailykids.db | PostgreSQL or SQLite connection |

Examples:
- SQLite: `sqlite://./data/dailykids.db`
- PostgreSQL: `postgresql://user:pass@localhost:5432/dailykids`

## Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| ADMIN_KEY | No | dev-admin-key | Secret key for admin operations |
| JWT_SECRET | No | auto-generated | 32-char secret for token signing |

## Email

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| BREVO_API_KEY | No | - | Brevo API key for email delivery |
| BREVO_SENDER_EMAIL | No | noreply@example.com | Sender email address |

## Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| LOG_LEVEL | No | info | debug \| info \| warn \| error |

## Firebase (migration only)

Used only by the Firebase export/transform scripts, not by the running server.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| FIREBASE_DATABASE_URL | Migration only | - | Realtime Database URL to export from |
| FIREBASE_SERVICE_ACCOUNT_PATH | Migration only | ./firebase-service-account.json | Path to service account JSON |

## Development

Set in `.env.local`:

```bash
NODE_ENV=development
DATABASE_URL=sqlite://./data/dailykids.db
ADMIN_KEY=dev-secret
LOG_LEVEL=debug
```

## Production

Set via environment or secrets manager:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://dailykids:STRONG_PASSWORD@db.internal:5432/dailykids
ADMIN_KEY=RANDOM_32_CHAR_SECRET
JWT_SECRET=ANOTHER_32_CHAR_SECRET
LOG_LEVEL=info
```

## Docker

Pass via -e flag:

```bash
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e ADMIN_KEY=... \
  dailykids-quest:latest
```

Or via .env file:

```bash
docker run -d \
  -p 3000:3000 \
  --env-file /path/to/.env.prod \
  dailykids-quest:latest
```
