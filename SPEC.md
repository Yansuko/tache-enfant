# DailyKids Quest IV - Containerized Local Version Specification

**Version:** 1.0  
**Date:** 2026-10-20  
**Status:** Draft for Implementation

---

## Executive Summary

This document specifies the migration of DailyKids Quest IV from a Netlify/Firebase cloud architecture to a fully containerized, locally-deployable system. The new system maintains 100% feature parity while enabling offline operation, data ownership, and simplified deployment.

**Current State:** Frontend (index.html) + Netlify Functions (_core.mjs) + Firebase Realtime DB + Firebase Auth  
**Target State:** Frontend + Express.js Backend + PostgreSQL/SQLite + JWT Auth (all in Docker)

---

## 1. Architecture Overview

### 1.1 Current Architecture
```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Browser)                   │
│           HTML/CSS/JS + Firebase SDK + Chart.js          │
│         (index.html, admin.html, 127KB combined)         │
└──────────┬──────────────────────────────────────────────┘
           │ HTTPS
┌──────────▼──────────────────────────────────────────────┐
│              Netlify Functions (Cloud)                   │
│  api.mjs → routes to _core.mjs (business logic)         │
│         ~76KB, 30+ actions/endpoints                     │
└──────────┬──────────────────────────────────────────────┘
           │ HTTPS
┌──────────▼──────────────────────────────────────────────┐
│         Firebase Realtime Database (Cloud)               │
│  - families/{familyId}/* (family data + children)        │
│  - users/email-{sanitized}/* (account data)              │
│  - _metadata/* (indexes, secrets, config)                │
│  - Uses Netlify Blobs for additional storage              │
└─────────────────────────────────────────────────────────┘

Additional:
- Firebase Auth (email/password auth)
- Brevo API (email delivery)
```

### 1.2 Target Architecture
```
┌──────────────────────────────────────────────────────────┐
│                    Docker Container                       │
├─────────────────────┬──────────────────────────────────┤
│   Frontend Service  │      Backend Service             │
│  (Nginx/caddy)      │  (Express.js, Node 18+)          │
│                     │                                  │
│  - index.html       │  - /api/* endpoints              │
│  - admin.html       │  - JWT token validation           │
│  - styles.css       │  - Business logic (_core logic)   │
│  - Chart.js (CDN)   │  - Email relay (Brevo)           │
│                     │  - Health checks                  │
└─────────────────────┴───────────┬──────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   Database (PostgreSQL)    │
                    │   or SQLite for dev        │
                    │                            │
                    │  ✓ families table          │
                    │  ✓ users table             │
                    │  ✓ children table          │
                    │  ✓ tasks table             │
                    │  ✓ grades table            │
                    │  ✓ sanctions table         │
                    │  ✓ task_requests table     │
                    │  ✓ action_logs table       │
                    │  ✓ indexes/metadata        │
                    └────────────────────────────┘
```

### 1.3 Deployment Modes

**Development Mode (docker-compose for local dev)**
```bash
docker-compose -f docker-compose.dev.yml up
# Frontend: http://localhost:3000
# API: http://localhost:3000/api
# DB: PostgreSQL on localhost:5432 (accessible for debugging)
# Hot reload: code changes apply automatically
```

**Production Mode (single optimized container)**
```bash
docker build -t dailykids-quest:latest .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e ADMIN_KEY=... \
  -v /data/persistent:/app/data \
  dailykids-quest:latest
# Frontend + Backend + everything: http://localhost:3000
# SQLite backup files: /data/persistent/backups/
```

**Local Standalone (for demos, no Docker)**
```bash
npm install
npm run dev:local
# Same as above but using local Node/npm
```

---

## 2. Tech Stack Decision

### 2.1 Database Selection: PostgreSQL Primary, SQLite Fallback

**Decision: PostgreSQL for production, SQLite for development/demo**

| Criterion | PostgreSQL | MongoDB | SQLite |
|-----------|-----------|---------|--------|
| Deployment | Container required | Container required | File-based |
| Queries | SQL (straightforward) | Aggregation pipeline (complex) | SQL (limited) |
| Relationships | Native FK constraints | Document refs (app logic) | Native FK constraints |
| Backups | `pg_dump` (robust) | Binary snapshots | File copy (simple) |
| Admin tools | pgAdmin, psql | MongoDB Compass | DBeaver, sqlite3 |
| Multi-family isolation | Native (row-level security) | App-level filtering | Manual filtering |
| Transaction support | Full ACID | Limited | Full ACID |
| Scaling | Horizontal (replication) | Horizontal (sharding) | Vertical only |
| Dev experience | Simple setup in Docker | Larger image | Zero setup |

**Rationale:**
- PostgreSQL: production-grade, standard for SaaS, familiar to most devs, full relational features needed for family/child isolation
- SQLite: zero-config dev/demo mode, excellent for single-user household usage
- MongoDB: not chosen due to unnecessary complexity for relational data (families→children→tasks is a clear hierarchy)

### 2.2 Backend Framework: Express.js (Node.js)

**Decision: Keep Express.js** (current project already uses Node.js)

| Framework | Pros | Cons | Verdict |
|-----------|------|------|--------|
| Express.js | ✓ Lightweight | - Boilerplate | **CHOSEN** |
| | ✓ No breaking changes | Minimal structure | Reuse existing |
| | ✓ Vast middleware ecosystem | | _core.mjs logic |
| Fastify | ✓ High performance | Smaller ecosystem | Not needed for |
| | ✓ Modern API | Different convention | this scale |
| Nest.js | ✓ Full framework | ✗ Heavy boilerplate | Overkill for |
| | ✓ TypeScript | ✗ Steep learning curve | this use case |
| Deno/Fresh | ✓ Modern JS | No production track record | Too new/risky |

**Rationale:** The existing `_core.mjs` is pure business logic (1900 lines) that is framework-agnostic. Express.js is the minimal bridge to HTTP, requires ~10 lines of wrapper code per route, has battle-tested libraries for every need, and requires zero breaking changes to existing logic.

### 2.3 Authentication: JWT Tokens (Local Implementation)

**Decision: JWT tokens (HMAC-SHA256) instead of Firebase Auth**

| Method | Security | Setup | User Experience | Verdict |
|--------|----------|-------|-----------------|--------|
| JWT (local) | ✓ HMAC-SHA256 signing | Simple (crypto.subtle) | Seamless | **CHOSEN** |
| | ✓ Token validation offline | One keypair | Same login flow |
| | ✓ Stateless | No external calls | |
| Session + Cookies | ✓ Revoker-friendly | DB session store | HTTP-only cookies | Adds complexity |
| | ✓ Secure by default | | Familiar to users | Not needed here |
| OAuth (Keycloak) | ✓ Industry standard | Container + config | Centralized identity | Overkill, adds |
| | | Multi-container setup | | complexity |
| Firebase Auth | ✗ Cloud dependency | Requires internet | **Current (to replace)** | **Why we're migrating** |
| | ✗ Data lock-in | Firebase SDK | |

**JWT Implementation Details:**
```javascript
// Token format: {email, exp}
// Signing: HMAC-SHA256 with application secret (auto-generated at first boot)
// Validation: Verify signature + check expiration (30 days default)
// Refresh: Issue new token on login, reuse until expiration
// Logout: Client-side token deletion (stateless, no revocation list needed)
// Family isolation: Token contains email → email owns families → read families → filter by token email
```

**Why not Firebase Auth?**
- Requires internet connection (defeats local deployment goal)
- Proprietary lock-in (Google ecosystem)
- Can't be self-hosted without Keycloak wrapper
- JWT is sufficient for this use case (family-owned data, no third-party access)

### 2.4 API Structure: REST (Current Pattern)

**Decision: Keep REST endpoints** (same as current Netlify functions)

Current API is action-based REST:
```
POST /api
{
  "action": "login",
  "email": "parent@demo.fr",
  "password": "demo"
}
→ { "token": "...", "me": { email, name }, "families": [...] }
```

**Alternative Considered: GraphQL**
```graphql
query GetFamilies($email: String!) {
  familiesByOwner(email: $email) { id, name, children { ... } }
}
```
**Not chosen:** Current action-based API is simpler to debug, mirrors Netlify function structure, and requires zero client changes (the HTML already expects this format).

---

## 3. Database Schema

### 3.1 Schema Design Principles
- **One table per aggregate:** `families`, `users`, `children`, `tasks`, `grades`, `sanctions`, `rewards`
- **Row-level isolation:** Every row includes `family_id` for security
- **Temporal data:** Timestamps for audit trails (`created_at`, `completed_at`, `updated_at`)
- **Backward compatibility:** Fields map 1:1 from Firebase JSON
- **Indexes for common queries:** Lookups by `family_id`, `user_id`, `child_id`

### 3.2 SQL Schema

```sql
-- ============ USERS ============
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_salt VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_users_email (email)
);

-- ============ FAMILIES ============
CREATE TABLE families (
  id VARCHAR(32) PRIMARY KEY,  -- fam-{random hex}
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  day VARCHAR(10) DEFAULT '',  -- last sync day (YYYY-MM-DD)
  daily_bonus_xp INTEGER DEFAULT 30,
  daily_bonus_gold INTEGER DEFAULT 15,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_family_owner FOREIGN KEY (owner_id) REFERENCES users(id),
  INDEX idx_families_owner (owner_id),
  INDEX idx_families_name (name)
);

-- ============ FAMILY MEMBERS ============
CREATE TABLE family_members (
  family_id VARCHAR(32) NOT NULL,
  user_id UUID NOT NULL,
  role ENUM('owner', 'member') DEFAULT 'member',
  invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (family_id, user_id),
  CONSTRAINT fk_fm_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_fm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============ CHILDREN ============
CREATE TABLE children (
  id VARCHAR(32) PRIMARY KEY,  -- child-{random hex}
  family_id VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  xp INTEGER DEFAULT 0,
  gold INTEGER DEFAULT 0,
  pin VARCHAR(4) DEFAULT '0000',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_child_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  INDEX idx_children_family (family_id),
  INDEX idx_children_id (id)
);

-- ============ TASKS ============
CREATE TABLE tasks (
  id VARCHAR(32) PRIMARY KEY,  -- task-{random hex}
  child_id VARCHAR(32) NOT NULL,
  family_id VARCHAR(32) NOT NULL,
  icon VARCHAR(10),
  name VARCHAR(255) NOT NULL,
  xp INTEGER,
  gold INTEGER,
  done BOOLEAN DEFAULT FALSE,
  daily BOOLEAN DEFAULT FALSE,
  frequency VARCHAR(20),  -- 'daily', 'weekly', 'unique', or NULL
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_task_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  INDEX idx_tasks_child (child_id),
  INDEX idx_tasks_family (family_id),
  INDEX idx_tasks_done (done),
  INDEX idx_tasks_completed_at (completed_at)
);

-- ============ GRADES ============
CREATE TABLE grades (
  id VARCHAR(32) PRIMARY KEY,  -- grade-{random hex}
  child_id VARCHAR(32) NOT NULL,
  family_id VARCHAR(32) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  grade VARCHAR(10),
  xp INTEGER DEFAULT 0,
  gold INTEGER DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_grade_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_grade_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  INDEX idx_grades_child (child_id),
  INDEX idx_grades_family (family_id)
);

-- ============ SANCTIONS ============
CREATE TABLE sanctions (
  id VARCHAR(32) PRIMARY KEY,
  child_id VARCHAR(32) NOT NULL,
  family_id VARCHAR(32) NOT NULL,
  motif VARCHAR(255) NOT NULL,
  gold INTEGER,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_sanction_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_sanction_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  INDEX idx_sanctions_child (child_id),
  INDEX idx_sanctions_family (family_id)
);

-- ============ FAMILY REWARDS ============
CREATE TABLE rewards (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  icon VARCHAR(10),
  name VARCHAR(255),
  cost INTEGER,
  lvl INTEGER DEFAULT 1,
  
  CONSTRAINT fk_reward_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  INDEX idx_rewards_family (family_id)
);

-- ============ TASK REQUESTS (approval workflow) ============
CREATE TABLE task_requests (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  child_id VARCHAR(32) NOT NULL,
  task_index INTEGER,
  task_name VARCHAR(255),
  xp INTEGER,
  gold INTEGER,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP,
  
  CONSTRAINT fk_tr_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_tr_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  INDEX idx_task_requests_family (family_id),
  INDEX idx_task_requests_status (status)
);

-- ============ GRADE REQUESTS (approval workflow) ============
CREATE TABLE grade_requests (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  child_id VARCHAR(32) NOT NULL,
  subject VARCHAR(255),
  grade VARCHAR(10),
  xp INTEGER,
  gold INTEGER,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP,
  
  CONSTRAINT fk_gr_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_gr_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  INDEX idx_grade_requests_family (family_id),
  INDEX idx_grade_requests_status (status)
);

-- ============ ACTION LOGS (audit trail) ============
CREATE TABLE action_logs (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32),
  action_type VARCHAR(50),  -- 'task_completed', 'grade_submitted', 'child_created', etc.
  actor_email VARCHAR(255),
  target_child_id VARCHAR(32),
  details JSONB,  -- flexible schema for any additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_actionlog_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  INDEX idx_actionlog_family (family_id),
  INDEX idx_actionlog_created (created_at)
);

-- ============ METADATA (secrets, config) ============
CREATE TABLE metadata (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Stores: secret key, seeded flag, admin config, etc.

-- ============ Indexes for performance ============
-- (Already included above, but summarized:)
-- - users: email (fast login)
-- - families: owner_id (fetch my families), name (search)
-- - tasks: family_id, child_id (common filters), completed_at (stats), done
-- - action_logs: family_id (audit), created_at (time-based queries)
```

### 3.3 Firebase to Database Migration Map

| Firebase Path | Target Table | Notes |
|---------------|--------------|-------|
| `families/{familyId}/*` | families + family_members + children + tasks + grades + ... | Normalize nested structure |
| `users/email-{sanitized}/*` | users | Flatten account data |
| `_metadata/secret` | metadata (key='secret') | Application HMAC key |
| `_metadata/seeded` | metadata (key='seeded') | Bootstrap flag |
| Nested arrays (e.g., `children: {0: {...}, 1: {...}}`) | Separate rows | Firebase object → relational rows |

**Example Migration:**
```javascript
// Firebase:
{
  "families/fam-demo": {
    "id": "fam-demo",
    "name": "Famille Démo",
    "children": {
      "0": { "id": "child-emma-demo", "name": "Emma", ... },
      "1": { "id": "child-lucas-demo", "name": "Lucas", ... }
    }
  }
}

// PostgreSQL:
-- families table: id, owner_id, name, ...
INSERT INTO families (id, owner_id, name) VALUES ('fam-demo', <uuid>, 'Famille Démo');

-- children table: id, family_id, name, ...
INSERT INTO children (id, family_id, name) VALUES ('child-emma-demo', 'fam-demo', 'Emma');
INSERT INTO children (id, family_id, name) VALUES ('child-lucas-demo', 'fam-demo', 'Lucas');
```

---

## 4. Docker Setup

### 4.1 Multi-Stage Dockerfile

```dockerfile
# ============ Stage 1: Build frontend (optional optimization) ============
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY tache-enfant/index.html .
COPY tache-enfant/admin.html .
COPY tache-enfant/styles.css .
# In this simple case, no build step needed (static assets)
# Could esbuild minify CSS if desired, but skipped for now (YAGNI)

# ============ Stage 2: Build backend ============
FROM node:18-alpine AS backend-build
WORKDIR /app/backend
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY netlify/functions ./src/
COPY . ./

# ============ Stage 3: Runtime ============
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy frontend assets
COPY --from=frontend-build /app/frontend ./public/

# Copy backend
COPY --from=backend-build /app/backend ./

# Create data directory for SQLite backups (if using SQLite)
RUN mkdir -p ./data/backups

# Environment defaults (override with docker run -e)
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=sqlite://./data/dailykids.db
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE 3000

CMD ["node", "server.js"]
```

### 4.2 Docker Compose (Development)

**File: `docker-compose.dev.yml`**

```yaml
version: '3.8'

services:
  # ============ Frontend + Backend combined ============
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: dailykids-app-dev
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://dailykids:dailykids@db:5432/dailykids
      ADMIN_KEY: dev-admin-key-change-in-prod
      LOG_LEVEL: debug
      BREVO_API_KEY: ${BREVO_API_KEY:-}  # Optional: for email testing
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./netlify/functions:/app/src:ro
      - ./tache-enfant:/app/public:ro
      - ./server.js:/app/server.js:ro
    networks:
      - dailykids-net

  # ============ PostgreSQL Database ============
  db:
    image: postgres:16-alpine
    container_name: dailykids-db-dev
    environment:
      POSTGRES_DB: dailykids
      POSTGRES_USER: dailykids
      POSTGRES_PASSWORD: dailykids
    ports:
      - "5432:5432"  # Expose for local debugging
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./seed-demo.sql:/docker-entrypoint-initdb.d/02-seed-demo.sql
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U dailykids -d dailykids" ]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - dailykids-net

  # ============ Admin tools (optional, for debugging) ============
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: dailykids-pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@example.com
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - db
    networks:
      - dailykids-net

volumes:
  db-data:

networks:
  dailykids-net:
    driver: bridge
```

**File: `docker-compose.prod.yml`** (for production-like testing)

```yaml
version: '3.8'

services:
  app:
    image: dailykids-quest:latest
    container_name: dailykids-app
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://user:password@db:5432/dailykids
      ADMIN_KEY: ${ADMIN_KEY}
      BREVO_API_KEY: ${BREVO_API_KEY:-}
    depends_on:
      - db
    volumes:
      - ./data/persistent:/app/data
    networks:
      - dailykids-net
    restart: always

  db:
    image: postgres:16-alpine
    container_name: dailykids-db
    environment:
      POSTGRES_DB: dailykids
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U ${DB_USER} -d dailykids" ]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - dailykids-net
    restart: always

volumes:
  db-data:

networks:
  dailykids-net:
    driver: bridge
```

### 4.3 Environment Variables Reference

```bash
# Core
NODE_ENV=production|development
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/dailykids
# OR for SQLite (dev):
DATABASE_URL=sqlite://./data/dailykids.db

# Security
ADMIN_KEY=very-secret-admin-key-change-in-production
JWT_SECRET=auto-generated-if-not-set  # (falls back to metadata table)

# Email (optional, for password reset)
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=dailykidsquest@example.com

# Logging
LOG_LEVEL=debug|info|warn|error

# Optional: Firebase fallback (if keeping hybrid during transition)
FIREBASE_SERVICE_ACCOUNT={"project_id":"..."}
FIREBASE_DATABASE_URL=https://...
```

### 4.4 Volume Mounts

```yaml
# SQLite version (for demo/dev)
volumes:
  - ./data:/app/data  # Persists .db files and backups

# PostgreSQL version (data managed by container volume)
volumes:
  - db-data:/var/lib/postgresql/data  # Named volume

# Development with hot reload
volumes:
  - ./netlify/functions:/app/src:ro  # Backend code
  - ./tache-enfant:/app/public:ro    # Frontend assets
```

---

## 5. Backend API

### 5.1 Express.js Server Structure

**File: `server.js`** (new file to replace Netlify Functions)

```javascript
import express from 'express';
import { Pool } from 'pg';  // or better-sqlite3 for SQLite
import { handleApi, setEmailSender } from './src/_core.mjs';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ============ Logging ============
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============ CORS (allow same-origin frontend) ============
app.use(cors({
  origin: NODE_ENV === 'production' ? false : '*',
  credentials: true
}));

// ============ Middleware ============
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ Database initialization ============
let db = null;

async function initializeDatabase() {
  if (process.env.DATABASE_URL?.startsWith('postgresql')) {
    // PostgreSQL
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    console.log('[DB] PostgreSQL pool initialized');
  } else {
    // SQLite (default)
    const sqlite3 = (await import('better-sqlite3')).default;
    db = new sqlite3(process.env.DATABASE_URL?.replace('sqlite://', '') || './data/dailykids.db');
    db.pragma('journal_mode = WAL');
    console.log('[DB] SQLite database initialized');
  }
  
  // Run migrations (schema initialization)
  await runMigrations();
}

async function runMigrations() {
  // Check if tables exist; if not, initialize schema
  // (Could use a migration library like Flyway or sql-migrate)
  console.log('[DB] Migrations completed');
}

// ============ Database adapter (wraps _core.mjs store interface) ============
function createDatabaseStore(dbConnection) {
  return {
    get: async (key) => {
      // Map keys to table + row lookup
      // e.g., 'family:fam-demo' → SELECT * FROM families WHERE id='fam-demo'
    },
    set: async (key, value) => {
      // e.g., 'family:fam-demo' → INSERT OR UPDATE families
    },
    del: async (key) => {
      // e.g., 'family:fam-demo' → DELETE FROM families WHERE id='fam-demo'
    },
    list: async () => {
      // Return all keys in the system for admin use
    }
  };
}

// ============ Email sender (Brevo integration) ============
async function sendEmail({ to, subject, body }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log('[EMAIL] Brevo not configured, skipping:', { to, subject });
    return;
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'DailyKids Quest', email: process.env.BREVO_SENDER_EMAIL || 'noreply@example.com' },
        to: [{ email: to }],
        subject,
        htmlContent: `<p>${body.replace(/\n/g, '<br>')}</p>`
      })
    });
    if (!res.ok) console.error('[EMAIL] Brevo error:', await res.text());
  } catch (e) {
    console.error('[EMAIL] Send failed:', e.message);
  }
}

setEmailSender(sendEmail);

// ============ Routes ============

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main API endpoint (replaces Netlify function)
app.post('/api', async (req, res) => {
  const { action, ...body } = req.body;
  const token = req.headers.authorization?.replace('Bearer ', '') || null;

  try {
    const store = createDatabaseStore(db);
    const result = await handleApi({ action, token, body }, store);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[API-ERROR]', { action, error: error.message });
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Serve frontend for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ Server startup ============
async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`[SERVER] DailyKids Quest running on http://localhost:${PORT}`);
      console.log(`[SERVER] Node ${process.version}, ${NODE_ENV} mode`);
    });
  } catch (error) {
    console.error('[STARTUP] Fatal error:', error);
    process.exit(1);
  }
}

start();
```

### 5.2 Authentication Strategy

**JWT Token Implementation** (minimal, no library needed)

```javascript
// Existing _core.mjs functions (reuse):
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return { salt, hash };
}

export function checkPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}

export function signToken(email, secret, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!sig || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() ? email : null;
  } catch { return null; }
}
```

**Token Flow:**
1. **Login:** `POST /api { action: 'login', email, password }` → Verify password → Issue JWT token → Return token + user state
2. **Authenticated Requests:** `POST /api { Authorization: 'Bearer <token>', action: '...', ... }` → Verify token → Extract email → Check permissions
3. **Token Expiration:** 30 days → Client receives 401 → User must re-login
4. **No revocation:** Logout is client-side token deletion (stateless design)

**Family Isolation:** Every API action receives email from token → Only allow operations on families owned by that email

### 5.3 Database Connection Pooling

**PostgreSQL (Production)**
```javascript
import { Pool } from 'pg';

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
```

**SQLite (Development)**
```javascript
import Database from 'better-sqlite3';

const db = new Database(process.env.DATABASE_URL?.replace('sqlite://', '') || './data/dailykids.db');
db.pragma('journal_mode = WAL');  // Write-Ahead Logging
db.pragma('synchronous = NORMAL');  // Balance durability/performance
db.pragma('cache_size = -64000');  // 64MB cache
```

### 5.4 Error Handling Strategy

```javascript
// ============ Error classes ============
class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// ============ Middleware: wrap all handlers ============
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
}

app.post('/api', asyncHandler(async (req, res) => {
  // ...
}));

// ============ Error handler (last middleware) ============
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  const body = { error: message };
  
  if (process.env.NODE_ENV === 'development') {
    body.details = err.details;
    body.stack = err.stack;
  }
  
  console.error('[ERROR]', { status, message, stack: err.stack });
  res.status(status).json(body);
});

// ============ Common error responses ============
// 400 Bad Request: invalid input
// 401 Unauthorized: missing/invalid token
// 403 Forbidden: token valid but no permission
// 404 Not Found: family/child/task doesn't exist
// 409 Conflict: already exists
// 500 Server Error: database/unexpected
```

---

## 6. Data Migration

### 6.1 Firebase to PostgreSQL Migration Strategy

**Phase 1: Data Export**
1. Export Firebase Realtime Database as JSON (Firebase Console → Database → Export)
2. Save to `firebase-export.json`

**Phase 2: Transform**
```javascript
// migrate.mjs (new script)
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const firebaseExport = JSON.parse(fs.readFileSync('firebase-export.json', 'utf-8'));

const users = [];
const families = [];
const familyMembers = [];
const children = [];
const tasks = [];
const grades = [];
const sanctions = [];
const rewards = [];

// Process Firebase structure
Object.entries(firebaseExport.families || {}).forEach(([familyId, family]) => {
  families.push({
    id: familyId,
    owner_id: null,  // Will resolve via email → UUID
    name: family.name,
    day: family.day || '',
    daily_bonus_xp: family.dailyBonus?.xp || 30,
    daily_bonus_gold: family.dailyBonus?.gold || 15
  });

  // Process children
  Object.values(family.children || {}).forEach((child) => {
    children.push({
      id: child.id,
      family_id: familyId,
      name: child.name,
      xp: child.xp || 0,
      gold: child.gold || 0,
      pin: child.pin || '0000'
    });

    // Process tasks
    Object.values(child.tasks || {}).forEach((task) => {
      tasks.push({
        id: `task-${generateId()}`,
        child_id: child.id,
        family_id: familyId,
        icon: task.icon,
        name: task.name,
        xp: task.xp,
        gold: task.gold,
        done: task.done || false,
        daily: task.daily || false,
        frequency: task.frequency || null,
        completed_at: task.completedAt ? new Date(task.completedAt) : null
      });
    });

    // Process grades
    Object.values(child.grades || {}).forEach((grade) => {
      grades.push({
        id: `grade-${generateId()}`,
        child_id: child.id,
        family_id: familyId,
        subject: grade.subject,
        grade: grade.grade || null,
        xp: grade.xp || 0,
        gold: grade.gold || 0
      });
    });

    // Process sanctions
    Object.values(child.sanctions || {}).forEach((sanction) => {
      sanctions.push({
        id: `sanction-${generateId()}`,
        child_id: child.id,
        family_id: familyId,
        motif: sanction.motif,
        gold: sanction.gold
      });
    });
  });

  // Process rewards
  Object.values(family.rewards || {}).forEach((reward) => {
    rewards.push({
      id: `reward-${generateId()}`,
      family_id: familyId,
      icon: reward.icon,
      name: reward.name,
      cost: reward.cost,
      lvl: reward.lvl || 1
    });
  });
});

// Process users
Object.entries(firebaseExport.users || {}).forEach(([key, user]) => {
  users.push({
    id: uuidv4(),
    email: user.email,
    name: user.name || '',
    password_salt: user.salt,
    password_hash: user.hash
  });
});

// Output SQL INSERT statements
console.log(generateSQL({ users, families, children, tasks, grades, sanctions, rewards }));

function generateSQL(data) {
  let sql = '';
  // INSERT statements for each table...
  return sql;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}
```

**Phase 3: Load into PostgreSQL**
```bash
# Connect to new database
psql -U dailykids -d dailykids < migration-output.sql

# Verify counts
SELECT 'users' as table_name, COUNT(*) FROM users UNION ALL
SELECT 'families', COUNT(*) FROM families UNION ALL
SELECT 'children', COUNT(*) FROM children;
```

### 6.2 Migration Verification Checklist

- [ ] All users imported (check email counts match)
- [ ] All families imported with correct owners
- [ ] All children and tasks imported
- [ ] Task completion dates preserved
- [ ] Grade history preserved
- [ ] Sanctions/rewards transferred
- [ ] User-family relationships intact
- [ ] Sample queries confirm data integrity
- [ ] No duplicate IDs
- [ ] Indexes created for performance

### 6.3 Demo Data Seeding

**File: `seed-demo.sql`** (auto-run in docker-compose)

```sql
-- Already covered by _core.mjs seedFamily()
-- But converted to SQL INSERT statements
INSERT INTO families (id, owner_id, name, day, daily_bonus_xp, daily_bonus_gold)
VALUES ('fam-demo', (SELECT id FROM users WHERE email='parent@demo.fr'), 'Famille Démo', '', 30, 15);

INSERT INTO children (id, family_id, name, xp, gold, pin)
VALUES 
  ('child-emma-demo', 'fam-demo', 'Emma', 450, 280, '0000'),
  ('child-lucas-demo', 'fam-demo', 'Lucas', 90, 64, '0000');

-- ... (continued for tasks, grades, etc.)
```

---

## 7. Development & Deployment

### 7.1 Local Development Setup

**Quick Start (1 minute)**
```bash
# Clone and setup
git clone <repo>
cd dailykids-quest
npm install

# Create .env.local
cat > .env.local << EOF
NODE_ENV=development
DATABASE_URL=sqlite://./data/dailykids.db
ADMIN_KEY=dev-secret
EOF

# Run
npm run dev:local
# Opens http://localhost:3000
```

**With Docker (3 minutes)**
```bash
docker-compose -f docker-compose.dev.yml up
# Waits for DB to be ready, runs migrations
# Frontend: http://localhost:3000
# DB admin: http://localhost:5050 (pgAdmin)
```

**Testing endpoints**
```bash
# Login
curl -X POST http://localhost:3000/api \
  -H 'Content-Type: application/json' \
  -d '{"action":"login","email":"parent@demo.fr","password":"demo"}'

# Get family state
curl -X POST http://localhost:3000/api \
  -H 'Authorization: Bearer <token>' \
  -d '{"action":"me"}'
```

### 7.2 Production Deployment

**Option A: Self-Hosted Docker (VPS)**
```bash
# Build image
docker build -t dailykids-quest:latest .

# Push to registry (optional)
docker tag dailykids-quest:latest myregistry/dailykids:latest
docker push myregistry/dailykids:latest

# On production server
docker pull myregistry/dailykids:latest
docker run -d \
  --name dailykids \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@db.example.com:5432/dailykids \
  -e ADMIN_KEY=<secret> \
  -v /data/backups:/app/data/backups \
  myregistry/dailykids:latest

# Reverse proxy (Caddy)
cat > Caddyfile << EOF
dailykidsquest.example.com {
  reverse_proxy localhost:3000
  encode gzip
}
EOF
caddy start
```

**Option B: Docker Compose on VPS**
```bash
# Production compose file + secrets
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f app

# Database backups (cron job)
0 2 * * * docker exec dailykids-db pg_dump -U dailykids dailykids > /backups/dailykids-$(date +\%Y\%m\%d).sql
```

**Option C: Kubernetes (multi-node)**
```yaml
# k8s-deployment.yaml (minimal example)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dailykids-quest
spec:
  replicas: 2
  selector:
    matchLabels:
      app: dailykids-quest
  template:
    metadata:
      labels:
        app: dailykids-quest
    spec:
      containers:
      - name: app
        image: myregistry/dailykids:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: dailykids-secrets
              key: database-url
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: dailykids-quest
spec:
  selector:
    app: dailykids-quest
  ports:
  - port: 3000
  type: LoadBalancer
```

### 7.3 Environment Configuration

**Development (.env.local)**
```bash
NODE_ENV=development
DATABASE_URL=sqlite://./data/dailykids.db
ADMIN_KEY=dev-secret-no-real-security
BREVO_API_KEY=  # (optional for testing)
LOG_LEVEL=debug
```

**Production (.env.production)**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://dailykids:${DB_PASSWORD}@db-prod.internal:5432/dailykids
ADMIN_KEY=${ADMIN_KEY_SECRET}  # From secret manager
BREVO_API_KEY=${BREVO_API_KEY}
LOG_LEVEL=info
JWT_SECRET=  # Auto-generated, stored in metadata table
```

**Secrets Management**
- Local: `.env.local` (gitignored)
- Docker: Environment variables or secrets files
- Kubernetes: `kubectl create secret generic dailykids-secrets --from-literal=...`
- Cloud VPS: HashiCorp Vault, AWS Secrets Manager, or 1Password

### 7.4 Health Checks

**Endpoint: `/health`**
```json
{
  "status": "ok",
  "timestamp": "2026-10-20T12:00:00Z",
  "database": "connected",
  "version": "1.0.0"
}
```

**Docker health check**
```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

**Kubernetes liveness/readiness probes**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

### 7.5 Logging & Monitoring

**Logging (Morgan + Custom)**
```javascript
import morgan from 'morgan';

// Development: verbose
app.use(morgan('dev'));

// Production: JSON structured logs (for ELK/Datadog/etc.)
app.use(morgan(JSON.stringify({
  'timestamp': new Date().toISOString(),
  'method': ':method',
  'url': ':url',
  'status': ':status',
  'response_time': ':response-time'
})));
```

**Example Log Entries**
```
[2026-10-20T12:34:56Z] POST /api action=login email=parent@demo.fr status=200 time=45ms
[2026-10-20T12:35:01Z] POST /api action=saveFamily familyId=fam-demo status=200 time=102ms
[2026-10-20T12:35:05Z] ERROR Database connection timeout
```

**Monitoring**
- **Uptime:** Ping `/health` every 30s
- **Error Rate:** Track 4xx/5xx responses
- **Response Time:** Percentile tracking (p50, p95, p99)
- **Database:** Query count, connection pool size, slow queries
- **Disk:** SQLite file size, backup storage usage

---

## 8. Testing Strategy

### 8.1 Unit Tests (Business Logic)

**Test _core.mjs functions** (mostly unchanged, but refactored for DB)

```javascript
// test-core.test.js
import { describe, it, expect } from 'vitest';
import { hashPassword, checkPassword, signToken, verifyToken } from '../src/_core.mjs';

describe('Crypto Functions', () => {
  it('hashes password and verifies', () => {
    const pw = 'test123';
    const { salt, hash } = hashPassword(pw);
    expect(checkPassword(pw, salt, hash)).toBe(true);
    expect(checkPassword('wrong', salt, hash)).toBe(false);
  });

  it('signs and verifies JWT token', () => {
    const email = 'test@example.com';
    const secret = 'secret';
    const token = signToken(email, secret);
    expect(verifyToken(token, secret)).toBe(email);
    expect(verifyToken(token, 'wrong-secret')).toBe(null);
  });
});
```

### 8.2 Integration Tests

**Test API endpoints with real DB** (SQLite in-memory)

```javascript
// test-api.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../src/database.js';

let app;
let db;

beforeAll(() => {
  // In-memory SQLite for tests
  db = new Database(':memory:');
  initializeSchema(db);
  app = createApp(db);  // Express app with DB injected
});

describe('API - Authentication', () => {
  it('POST /api signup creates user and returns token', async () => {
    const res = await request(app)
      .post('/api')
      .send({
        action: 'signup',
        email: 'newuser@example.com',
        password: 'test123',
        name: 'Test User'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.me.email).toBe('newuser@example.com');
  });

  it('POST /api login authenticates user', async () => {
    // Create user first
    await db.prepare(`
      INSERT INTO users (email, name, password_salt, password_hash)
      VALUES (?, ?, ?, ?)
    `).run('existing@example.com', 'User', salt, hash);

    const res = await request(app)
      .post('/api')
      .send({
        action: 'login',
        email: 'existing@example.com',
        password: 'password123'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('Missing token returns 401', async () => {
    const res = await request(app)
      .post('/api')
      .send({ action: 'me' });  // Requires auth

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token/i);
  });
});

describe('API - Family Operations', () => {
  let token;

  beforeAll(async () => {
    // Login to get token
    const res = await request(app).post('/api').send({
      action: 'login',
      email: 'parent@example.com',
      password: 'password'
    });
    token = res.body.token;
  });

  it('POST /api createFamily', async () => {
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'createFamily',
        name: 'My Family'
      });

    expect(res.status).toBe(200);
    expect(res.body.family.name).toBe('My Family');
  });

  it('POST /api saveFamily updates family', async () => {
    // Assumes family created above
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'saveFamily',
        familyId: 'fam-test',
        changes: { name: 'Updated Family' }
      });

    expect(res.status).toBe(200);
  });
});
```

### 8.3 End-to-End Tests

**Reuse existing E2E tests** (HTML-based should still work)

```javascript
// test-e2e.test.js (existing Playwright/Cypress tests adapted)
import { test, expect } from '@playwright/test';

test('User can login and view family', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Enter credentials
  await page.fill('input[placeholder*="email"]', 'parent@demo.fr');
  await page.fill('input[placeholder*="password"]', 'demo');
  
  // Click login
  await page.click('button:has-text("Connexion")');

  // Wait for family to load
  await page.waitForSelector('text=Famille Démo');

  // Verify children are displayed
  const childElements = await page.locator('.child-item').count();
  expect(childElements).toBeGreaterThan(0);
});

test('Child can complete task', async ({ page }) => {
  // Login as parent first (setup)
  await loginAsParent(page);

  // Switch to child view
  await page.click('input[value="enfant"]');

  // Enter PIN
  await page.fill('input[placeholder*="PIN"]', '0000');
  await page.click('button:has-text("Déverrouiller")');

  // Complete task
  const taskCheckbox = await page.locator('.task-icon').first();
  await taskCheckbox.click();

  // Verify task shows as done
  await expect(taskCheckbox).toHaveClass(/done/);
});
```

### 8.4 Performance Tests

```javascript
// test-performance.test.js
import { performance } from 'perf_hooks';

describe('Performance', () => {
  it('GET /api me completes in < 50ms', async () => {
    const start = performance.now();
    const res = await request(app)
      .post('/api')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'me' });
    const duration = performance.now() - start;

    expect(res.status).toBe(200);
    expect(duration).toBeLessThan(50);
  });

  it('Database query on 1000 children completes in < 200ms', async () => {
    // Insert 1000 children
    for (let i = 0; i < 1000; i++) {
      db.prepare('INSERT INTO children (id, family_id, name) VALUES (?, ?, ?)')
        .run(`child-${i}`, 'fam-test', `Child ${i}`);
    }

    const start = performance.now();
    const children = db.prepare('SELECT * FROM children WHERE family_id = ?')
      .all('fam-test');
    const duration = performance.now() - start;

    expect(children.length).toBe(1000);
    expect(duration).toBeLessThan(200);
  });
});
```

### 8.5 Test Execution

**Run all tests:**
```bash
npm run test              # Unit + Integration (Vitest)
npm run test:e2e         # End-to-end (Playwright)
npm run test:performance # Load tests
npm run test:all         # Everything (for CI)
```

**Coverage:**
```bash
npm run test -- --coverage
# Output: coverage/index.html (open in browser)
```

---

## 9. Timeline & Effort Estimate

### 9.1 Phase Breakdown

| Phase | Task | Effort | Duration | Notes |
|-------|------|--------|----------|-------|
| **1: Setup** | Docker setup, Dockerfile, docker-compose | 8h | 1d | Parallel: DB schema design |
| | PostgreSQL schema design & migrations | 12h | 1.5d | SQL, indexes, constraints |
| | **Subtotal** | **20h** | **2d** | |
| **2: Backend** | Express.js server scaffold | 4h | 0.5d | Framework setup, middleware |
| | Database adapter (implement store interface) | 16h | 2d | Query builders, error handling |
| | JWT authentication (replace Firebase Auth) | 8h | 1d | Token generation, validation, endpoint guards |
| | **Subtotal** | **28h** | **3.5d** | |
| **3: Migration** | Firebase → PostgreSQL migration script | 12h | 1.5d | Test with real data export |
| | Data validation & integrity checks | 8h | 1d | Verify counts, dates, relationships |
| | **Subtotal** | **20h** | **2.5d** | |
| **4: Testing** | Unit tests (_core.mjs functions) | 8h | 1d | Crypto, business logic |
| | Integration tests (API endpoints) | 12h | 1.5d | All 30+ actions |
| | E2E tests (adapt existing Playwright) | 8h | 1d | Login, complete task, etc. |
| | **Subtotal** | **28h** | **3.5d** | |
| **5: Docs & Release** | README (local setup, deployment) | 4h | 0.5d | Docker, npm, Kubernetes examples |
| | CHANGELOG, breaking changes doc | 2h | 0.25d | Version 1.0.0-containerized |
| | QA checklist | 4h | 0.5d | Feature parity verification |
| | **Subtotal** | **10h** | **1.25d** | |
| **Total** | | **106h** | **~13 days** | ~2.5 weeks at 40h/week |

### 9.2 Critical Path

1. **Docker + DB schema** (2d) — blocks everything else
2. **Express server + Database adapter** (3.5d) — enables API
3. **JWT auth** (1d) — blocks all authenticated endpoints
4. **Migration script** (1.5d) — enable data transfer
5. **Testing + QA** (3.5d) — parallel with docs
6. **Release** (1.25d) — final polish

**Critical path: 13 days minimum** (some parallelization possible in first 2 weeks)

### 9.3 Dependencies & Blockers

| Item | Depends On | Status |
|------|-----------|--------|
| Backend | Docker + DB schema | Ready |
| Auth | Backend + JWT logic | Straightforward |
| Migration | DB schema + PostgreSQL running | Ready |
| Testing | Backend + Test DB | Standard |
| Release | All above + docs | Straightforward |

**No hard blockers.** All components are independent once Docker/DB are set up.

### 9.4 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Firebase API changes during transition | Low | Medium | Keep Firebase-compatible store interface; easy to add fallback |
| Data loss in migration | Low | **Critical** | Validate every migrated row, automated integrity checks, backups before import |
| Performance regression vs Firebase (cloud) | Medium | Medium | Load test with production data; add DB indexes; profile queries |
| Auth token leaks (HTTP, local storage) | Medium | Medium | HTTPS only in production; consider httpOnly cookies + CSRF token |
| Database schema changes needed after launch | Medium | Low | Design versioning system (flyway migrations); test with real data early |
| Team familiarity with PostgreSQL | Medium | Low | Document common queries; provide psql/DBeaver tutorials; deploy to staging first |

**Mitigation:** Staging environment before production rollout (deploy containerized version parallel to Firebase for 1-2 weeks, sync both to validate correctness).

---

## 10. Implementation Checklist

### Phase 1: Foundation
- [ ] Docker / docker-compose files created
- [ ] PostgreSQL schema finalized and tested
- [ ] SQLite fallback schema created
- [ ] Migration scripts written and validated
- [ ] Health check endpoint implemented

### Phase 2: Backend
- [ ] Express.js server bootstrapped
- [ ] JWT authentication implemented
- [ ] Database adapter bridges _core.mjs
- [ ] All 30+ API actions working with DB backend
- [ ] Error handling standardized
- [ ] Logging structured

### Phase 3: Frontend
- [ ] Frontend assets served from `/public`
- [ ] API calls work against new backend
- [ ] Login/logout flow works with JWT
- [ ] All UI features functional (tasks, grades, stats, admin)
- [ ] No Firebase SDK calls remaining

### Phase 4: Data
- [ ] Firebase export tested
- [ ] Migration script produces valid SQL
- [ ] Data imported to PostgreSQL
- [ ] Integrity checks pass (counts, dates, relationships)
- [ ] Sample queries verify correctness

### Phase 5: Testing
- [ ] Unit tests for _core.mjs (100% coverage)
- [ ] Integration tests for API (all actions)
- [ ] E2E tests (login, task completion, admin panel)
- [ ] Performance tests (response times, DB queries)
- [ ] Load test with realistic family sizes

### Phase 6: Release
- [ ] README with quickstart
- [ ] Docker Hub image published
- [ ] Kubernetes manifests validated
- [ ] Database backup scripts tested
- [ ] Feature parity checklist signed off
- [ ] Version tagged (v1.0.0-containerized)

---

## 11. Feature Parity Verification

**Current Features (Firebase):**
- [x] Email/password authentication (Firebase Auth → JWT)
- [x] Family CRUD (create, read, update, delete)
- [x] Multiple family support (one user, many families)
- [x] Child task management (daily, weekly, unique)
- [x] Task completion tracking (✓ done, XP/gold rewards)
- [x] Grade submission & approval workflow
- [x] Sanction/rule violations (deduct gold)
- [x] Reward catalog (redeemable with gold)
- [x] Statistics (tasks per day, progression, top tasks)
- [x] Admin panel (user/family management, reset PIN, delete account)
- [x] Level system (XP → levels, unlocks features)
- [x] Invitation workflow (invite other parents)
- [x] Password reset (email-based, requires Brevo)

**All features required for parity.** No feature removal in containerized version.

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Container** | Docker image + runtime (like VM but lighter) |
| **Docker Compose** | Tool to run multi-container apps locally (DB + app) |
| **PostgreSQL** | Production relational database |
| **SQLite** | File-based database (for dev/demo) |
| **JWT** | JSON Web Token (stateless auth, signed with secret) |
| **Store** | Abstract interface for get/set/del (implemented by Firebase or Postgres) |
| **Netlify Functions** | Cloud functions (being replaced by Express routes) |
| **Migration** | Script to transfer data from one system to another |
| **Schema** | Database table structure (columns, types, constraints) |
| **Flyway** | Tool for versioning database changes |
| **Health check** | HTTP endpoint that confirms service is running |
| **ACID** | Atomicity, Consistency, Isolation, Durability (transaction guarantees) |

---

## 13. Success Criteria

1. ✓ **Functionality:** All 30+ API actions work identically with PostgreSQL as with Firebase
2. ✓ **Data Integrity:** Migrated data matches source; no loss or corruption
3. ✓ **Performance:** Containerized version ≤ 20% slower than Firebase (due to local network)
4. ✓ **Usability:** Users cannot tell the difference (same login, same UI)
5. ✓ **Offline:** Can deploy without internet (once Docker image is built)
6. ✓ **Reliability:** Production-grade error handling, logging, backups
7. ✓ **Developer Experience:** Clear README, easy to run locally (`docker-compose up`)
8. ✓ **Cost:** Self-hosted = no Firebase bills; only infrastructure costs

---

## 14. Post-Launch Roadmap

**After 1.0 release:**
1. **Cloud deployments** (AWS ECS, GCP Cloud Run, Azure Container Instances)
2. **Backup automation** (daily PostgreSQL dumps, S3 sync)
3. **Multi-family federation** (share tasks across families)
4. **Mobile app** (React Native, same backend API)
5. **Advanced analytics** (Grafana dashboards, query insights)
6. **Theme/customization** (CSS variables for families to brand their instance)

---

## Appendix A: Related Files

**Current System:**
- `/netlify/functions/_core.mjs` — Core business logic (1900 lines, unchanged)
- `/netlify/functions/api.mjs` — Netlify endpoint wrapper
- `/tache-enfant/index.html` — Frontend (127 KB)
- `/tache-enfant/firebase-config.js` — Firebase SDK setup
- `/package.json` — Dependencies

**To Create:**
- `/Dockerfile` — Multi-stage build
- `/docker-compose.dev.yml` — Dev environment
- `/docker-compose.prod.yml` — Prod environment
- `/server.js` — Express.js server
- `/src/database.js` — Database adapter
- `/src/migrations/01-schema.sql` — Initial schema
- `/seed-demo.sql` — Demo data
- `/migrate.mjs` — Firebase → PostgreSQL script
- `/test-*.js` — Test suites
- `/README.md` — Setup & deployment guide
- `/.env.example` — Environment variables template

---

**Document Version:** 1.0  
**Last Updated:** 2026-10-20  
**Status:** Ready for Implementation Review

This specification is comprehensive and serves as the source of truth for the containerized version. It covers architecture, tech decisions, schema design, Docker setup, API structure, data migration, deployment, testing, timeline, and success criteria. Use this as a checklist during implementation.
