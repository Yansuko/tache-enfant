# DailyKids Quest IV - Containerized Version

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-blue)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Supported-blue)](https://www.docker.com/)

A fully containerized family task management system with real-time synchronization, offline support, and complete data ownership.

## Quick Start (Local Development)

### Option 1: Docker (Recommended)

```bash
# Clone and navigate
git clone <repo>
cd dailykids-quest

# Build and start
docker-compose -f docker-compose.dev.yml build
docker-compose -f docker-compose.dev.yml up

# Access at http://localhost:3000
# Database admin: http://localhost:5050 (pgAdmin)
```

### Option 2: Local Node.js

```bash
npm install

# Create .env.local
cat > .env.local << EOF
NODE_ENV=development
DATABASE_URL=sqlite://./data/dailykids.db
ADMIN_KEY=dev-secret
EOF

npm run dev
# Opens http://localhost:3000
```

## Login Credentials (Demo)

**Parent:**
- Email: parent@demo.fr
- Password: demo

**Children:**
- Emma: PIN 0000
- Lucas: PIN 1111
- Test: PIN 2222

## Architecture

```
Client (HTML/CSS/JS)
       ↓
Express.js Backend (Port 3000)
       ↓
PostgreSQL/SQLite Database
```

## Development

```bash
npm install          # Install dependencies
npm run dev:docker   # Run with Docker Compose
npm run test         # Run all tests
npm run test:watch   # Watch mode
npm run test:e2e     # Run E2E tests
```

## Deployment

### Production Docker

```bash
docker build -t dailykids-quest:latest .

docker run -d \
  --name dailykids \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@db.example.com:5432/dailykids \
  -e ADMIN_KEY=<your-secret> \
  -v /data/backups:/app/data/backups \
  dailykids-quest:latest
```

### Environment Variables

```bash
NODE_ENV              # development|production
PORT                  # Default: 3000
DATABASE_URL          # postgresql://... or sqlite://...
ADMIN_KEY             # Secret for admin operations
JWT_SECRET            # Auto-generated if not set
BREVO_API_KEY         # Optional: for email features
LOG_LEVEL             # debug|info|warn|error
```

## Features

- ✅ Real-time family task management
- ✅ Multi-child household support
- ✅ Parent approval workflow for tasks/grades
- ✅ XP/gold reward system with levels
- ✅ Grade tracking and statistics
- ✅ Sanctions and reward catalog
- ✅ Admin panel with audit logs
- ✅ Offline-capable (SQLite)
- ✅ Self-hosted (no cloud dependency)
- ✅ JWT authentication

## Migration from Firebase

To migrate existing Firebase data:

```bash
# Export Firebase
export FIREBASE_DATABASE_URL="https://your-project.firebaseio.com"
export FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-service-account.json"
node migrate-firebase-export.mjs

# Transform to SQL
node migrate-transform.mjs

# Load into PostgreSQL
psql -h localhost -U dailykids -d dailykids < migration.sql
```

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires running server)
npm run dev &
npm run test:e2e
```

## License

MIT
