# DailyKids Quest IV - Version 1.0.6

**Release Date:** October 22, 2026  
**Status:** Production Ready  
**Docker Image:** `dailykids:1.0.6`

---

## 📦 Release Package

| File | Size | SHA256 |
|------|------|--------|
| `dailykids-1.0.6.tar` | 383 MB | See below |

---

## ✨ What's New in 1.0.6

### 🔐 Persistent Session & Auto-Login

#### SessionManager
- Sessions stored in localStorage with 30-day TTL
- Auto-expiration after 30 days of inactivity
- Secure token storage (no PIN in plaintext)

#### Auto-Login Feature
- **App startup**: Detects valid session automatically
- **Parents**: Auto-login with API 'me' endpoint
- **Children**: Auto-login with family context restored
- **Fallback**: Shows normal login if session expired/invalid

#### UI Improvements
- ✅ "Se souvenir de moi" checkbox for parents
- ✅ "Se souvenir de moi" checkbox for children  
- ✅ Clear logout button in topbar
- ✅ Session persists across browser restart

#### Security
- ✅ JWT tokens stored securely
- ✅ Child PIN never stored in plaintext
- ✅ Automatic expiration (30 days)
- ✅ Complete session cleanup on logout
- ✅ Device-specific sessions (no cross-device sync)

---

## 🎯 User Experience

**Before:**
```
1. Open app
2. Type PIN (every time)
3. Wait for unlock
4. Access app
5. Close app
6. Repeat next day...
```

**After:**
```
1. Open app
2. App auto-logs in ✓
3. Direct to home screen
4. Close app
5. Open tomorrow → Auto-logged in ✓
```

---

## 📱 PWA Benefits

✓ **Seamless**: No re-authentication on app launch  
✓ **Fast**: Instant access for daily users  
✓ **Offline**: Session already loaded before going offline  
✓ **Secure**: 30-day automatic expiration  

---

## 🔧 Technical Details

### Session Storage Structure
```javascript
{
  token: "jwt-token-here",
  user: { email, name },
  familyId: "family-id",
  role: "parent|enfant",
  expiresAt: timestamp
}
```

### Behavior
- **Valid session found**: Restore state + call API to verify
- **Invalid/expired session**: Clear and show login form
- **Logout clicked**: Purge session from localStorage
- **30 days passed**: Auto-expire on next app load

---

## ✅ Testing

**Session Features Tested:**
- ✓ Session saved correctly for parent/child
- ✓ Session loaded on app startup
- ✓ Auto-login works with valid token
- ✓ Expired session triggers login form
- ✓ Logout clears session completely
- ✓ 30-day TTL calculated correctly

---

## 📋 Files Modified

- `public/index.html`: SessionManager integration + auto-login logic
- `netlify/functions/_core.mjs`: Session validation on API calls
- Package.json: Version bumped to 1.0.6

---

## 🚀 Deployment

```bash
docker load -i dailykids-1.0.6.tar
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**Access:** `https://yansu.synology.me:8585/`

---

## 📝 Version History

- **v1.0.6** (2026-10-22): Persistent sessions + auto-login ✨ NEW
- **v1.0.5** (2026-10-22): Code cleanup + test coverage
- **v1.0.4** (2026-10-22): Complete Dockerfile
- **v1.0.3** (2026-10-22): RGBA icons
- **v1.0.2** (2026-10-22): Official logo
- **v1.0.1** (2026-10-22): web-push dependency
- **v1.0.0** (2026-10-22): Initial release

---

## 🎉 Production Ready

✓ Persistent session system implemented  
✓ Auto-login fully functional  
✓ UI updated with remember-me options  
✓ Secure token storage  
✓ 30-day auto-expiration  
✓ All tests passing  

**DailyKids Quest IV is now PWA-optimized!** 🚀

---

**Build Info**  
- Built from: `main` branch
- Date: October 22, 2026
- Status: ✅ **PRODUCTION READY**
