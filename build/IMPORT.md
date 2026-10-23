# 📦 Import Docker Image on NAS

## Command to Import

On your NAS (via SSH or terminal):

```bash
# Load the image
docker load -i dailykids-1.0.18.tar

# Verify it's loaded
docker images | grep dailykids
```

Or with Podman:
```bash
podman load -i dailykids-1.0.18.tar
```

## Run the Container

```bash
# Create data directory
mkdir -p /path/to/nas/data/dailykids

# Run the container
docker run -d \
  --name dailykids \
  -p 3000:3000 \
  -v /path/to/nas/data/dailykids:/app/data \
  -e NODE_ENV=production \
  dailykids:1.0.18

# View logs
docker logs -f dailykids
```

## Access

- Local: `http://nas-ip:3000`
- Via HTTPS: `https://your-nas.domain` (if using NAS reverse proxy)

## Notes

✅ Image: **149 MB** (compressed)
✅ Version: **1.0.18** (Firebase removed)
✅ Database: SQLite (auto-created in `/app/data`)

---

Once running, you can install as PWA on mobile and push notifications will work! 📱
