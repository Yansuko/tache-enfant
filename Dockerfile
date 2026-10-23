# ============ Stage 1: Frontend (static assets) ============
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
# Copy all public files (manifest, logos, HTML, CSS, etc)
COPY public/ .
# No build step needed, assets are static

# ============ Stage 2: Backend dependencies ============
FROM node:18-alpine AS backend-build
WORKDIR /app/backend
# better-sqlite3 falls back to node-gyp when no prebuilt musl binary matches (Alpine has no build-essential; build-base is its equivalent)
RUN apk add --no-cache python3 build-base
COPY package.json package-lock.json ./
RUN npm ci --only=production
# Copy backend code will happen in stage 3

# ============ Stage 3: Runtime ============
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy frontend assets from stage 1
COPY --from=frontend-build /app/frontend ./public/

# Copy dependencies from stage 2
COPY --from=backend-build /app/backend/node_modules ./node_modules/

# Copy application files
COPY package.json package-lock.json ./
COPY server.js auth.js database.js ./
COPY netlify/functions/ ./netlify/functions/

# Create data directory for SQLite backups
RUN mkdir -p ./data/backups

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=sqlite://./data/dailykids.db
ENV LOG_LEVEL=info
# CRITICAL: Fixed JWT secret for consistent token validation across restarts
ENV JWT_SECRET=dailykids_jwt_secret_production_v1_2026

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE 3000

CMD ["node", "server.js"]
