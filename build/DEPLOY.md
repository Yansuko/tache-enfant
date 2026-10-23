# 🚀 DailyKids NAS Deployment

## Quick Start

1. **Extract on NAS**:
   ```bash
   cd /your/nas/path
   tar -xzf dailykids-nas.tar.gz
   cd dailykids
   ```

2. **Install dependencies**:
   ```bash
   npm ci --production
   ```

3. **Start the app**:
   ```bash
   npm start
   # Port: 3000 (or configure via NAS reverse proxy for HTTPS)
   ```

## Configuration

Create `.env` file (optional):
```
NODE_ENV=production
PORT=3000
DATABASE_URL=sqlite://./data/dailykids.db
BREVO_API_KEY=<optional-for-emails>
```

## Access from Phone

- **Desktop/Laptop**: `http://nas-ip:3000`
- **Phone (via HTTPS NAS)**: `https://your-nas-domain.com`
  - Install as PWA: Share → Add to Home Screen
  - Push notifications now work on iOS 16+ ✅

## Features

✅ **Fully autonomous** (no Firebase)
✅ **Notifications** (Web Push + Email option)
✅ **Offline capable** (Service Worker)
✅ **SQLite database** (auto-created)
✅ **PWA support** (install on mobile)

## Backup

```bash
# Backup database regularly
cp data/dailykids.db data/backups/dailykids-$(date +%Y%m%d).db
```

---

**Version**: 1.0.17 (Firebase removed)
**Branch**: remove-firebase
