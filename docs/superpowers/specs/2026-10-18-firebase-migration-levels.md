# Firebase Migration & Configurable Level System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from Netlify Blobs to Firebase Realtime Database for real-time sync, and implement a family-configurable level progression system.

**Architecture:** Replace Netlify Blobs with Firebase Realtime Database as the single source of truth. Use Firebase Authentication for user accounts. Implement per-family level configuration where each family defines their own XP-to-level progression. Stats sync in real-time as tasks are completed.

**Tech Stack:** 
- Firebase Realtime Database (data storage)
- Firebase Authentication (user accounts)
- Firebase SDK v9+ (browser)
- Node.js script for one-time data migration

## Global Constraints

- **Migration approach**: One-time Node.js script (`migrate-to-firebase.mjs`), not auto-migration
- **Auth**: Use Firebase Authentication (email/password), not custom backend auth
- **Sync**: Real-time sync — XP and level update immediately across all devices
- **Level config**: Per-family configurable progression (not global)
- **Backward compat**: After migration, Netlify Blobs no longer accessed; Firebase is single source
- **Admin key**: Keep existing admin key system for admin actions (adminDeleteFamily, adminResetPin, etc.)
- **Testing protocol**: Tests must pass before deployment (npm run test:all)

---

## 1. Data Architecture

### Firebase Realtime Database Structure

```
/
  users/
    {uid}/
      email: string
      name: string
      familyIds: [string]  // Array of family IDs this user owns/belongs to
      createdAt: timestamp
  
  families/
    {familyId}/
      id: string
      name: string
      owner: string  // email
      members: [string]  // Array of emails
      children/
        {childId}/
          id: string
          name: string
          pin: string
          xp: number
          gold: number
          tasks: [
            { name, icon, xp, gold, done, completedAt, frequency }
          ]
          dailyBonusDay: string
      createdAt: timestamp
      updatedAt: timestamp
  
  levelConfigs/
    {familyId}/
      name: string  // e.g. "Config de progression"
      levels: [
        { level: 1, xpRequired: 100 },
        { level: 2, xpRequired: 200 },
        { level: 3, xpRequired: 350 },
        ...
      ]
      createdAt: timestamp
      updatedAt: timestamp
  
  adminMetadata/
    familyIds: [string]
    accountEmails: [string]
    lastAdminAction: {
      timestamp: number
      action: string
    }

  activityHistory/
    {entryId}/
      timestamp: number
      type: string  // 'login', 'completeTask', 'submitGrade'
      subject: string
      target: string
      details: string
```

### Key Design Decisions

**Real-time sync**: Child XP updates trigger level recalculation immediately in client (using level config from `/levelConfigs/{familyId}`).

**No stats caching**: Stats computed on-read from task data in `/families/{familyId}/children/{childId}/tasks`.

**Activity history**: Logged to `/activityHistory/` on every action (login, task completion, grade submission, admin actions).

---

## 2. Firebase Authentication

### User Registration & Login

**Frontend flow** (replaces current email/password auth):
```javascript
// Signup
firebase.auth().createUserWithEmailAndPassword(email, password)
  .then(userCredential => {
    // Create user doc in /users/{uid}
    db.ref(`users/${userCredential.user.uid}`).set({
      email, name, familyIds: [newFamilyId], createdAt: Date.now()
    })
  })

// Login
firebase.auth().signInWithEmailAndPassword(email, password)
  .then(userCredential => {
    // User is authenticated, token auto-managed by Firebase
    token = await userCredential.user.getIdToken()
  })

// Token refresh
firebase.auth().onAuthStateChanged(user => {
  if (user) token = await user.getIdToken()
})
```

**Backend validation** (Netlify Functions):
```javascript
// Every API call includes token in header
const token = request.headers.authorization?.split(' ')[1]
const decodedToken = await admin.auth().verifyIdToken(token)
const uid = decodedToken.uid
```

---

## 3. Data Migration Script

### One-Time Migration: `migrate-to-firebase.mjs`

**Input**: Reads from Netlify Blobs (existing system)

**Process**:
1. List all keys from Netlify Blobs
2. Parse `account:*` keys → create Firebase users + `/users/{uid}` docs
3. Parse `family:*` keys → migrate to `/families/{familyId}`
4. Create default `/levelConfigs/{familyId}` for each family (100 XP per level)
5. Verify counts match (e.g., "Migrated 5 accounts, 3 families, 12 children")
6. Log migration report to `migrate-report.json`

**Output**:
- All data in Firebase
- Migration report showing what was migrated + any errors
- Can be re-run safely (idempotent—checks if data already exists)

**Usage**:
```bash
FIREBASE_PROJECT_ID=my-project npm run migrate-firebase
```

**Report format**:
```json
{
  "timestamp": "2026-10-18T10:30:00Z",
  "accountsMigrated": 5,
  "familiesMigrated": 3,
  "childrenMigrated": 12,
  "tasksMigrated": 87,
  "errors": [],
  "status": "success"
}
```

---

## 4. Configurable Level System

### Default Level Config

When a new family is created, default config is:
```javascript
{
  levels: [
    { level: 1, xpRequired: 0 },
    { level: 2, xpRequired: 100 },
    { level: 3, xpRequired: 200 },
    { level: 4, xpRequired: 350 },
    // ... up to level 50
  ]
}
```

### Level Calculation

**Client-side function** (real-time):
```javascript
function getCurrentLevel(childXp, levelConfig) {
  const config = levelConfig.levels
  for (let i = config.length - 1; i >= 0; i--) {
    if (childXp >= config[i].xpRequired) {
      return config[i].level
    }
  }
  return 1
}

function getXpForNextLevel(childXp, levelConfig) {
  const currentLevel = getCurrentLevel(childXp, levelConfig)
  const nextLevelConfig = levelConfig.levels.find(l => l.level === currentLevel + 1)
  return nextLevelConfig ? nextLevelConfig.xpRequired - childXp : null
}
```

**XP progress bar**: Shows `childXp % nextLevelXp / nextLevelXp * 100%`

### Admin Interface: Level Config Editor

**New section in admin dashboard**: "Paramètres de niveaux"

**Display**:
- Show current family's level config
- Table: Level | XP Requis | Actions
- Example: "Niv 1: 0 XP | Niv 2: 100 XP | Niv 3: 200 XP | ..."

**Actions**:
- ✏️ Edit XP for a level
- ➕ Add new level
- 🗑️ Remove level
- ↻ Reset to default (100 XP per level)

**Validation**:
- Levels must be in order (Niv 1 < Niv 2 < ...)
- XP values must increase
- Max 99 levels

---

## 5. Real-Time Synchronization

### Task Completion Flow

1. **Child completes task** (child.html)
   - Marks task as `done: true`
   - Sets `completedAt: Date.now()`
   - Writes to `/families/{familyId}/children/{childId}/tasks/{taskIndex}`

2. **Firebase triggers update**
   - Child doc updates in real-time
   - All connected clients (parent + other children) see update

3. **Level recalculation** (all clients)
   - Client listens to `/families/{familyId}/children/{childId}` changes
   - When XP changes, recalculate level using levelConfig
   - Display new level to user

4. **Backend logging**
   - On-write trigger logs to `/activityHistory/` (completed task + XP earned)

### Firebase Listeners (Frontend)

```javascript
// Listen to child data
firebase.database().ref(`families/${familyId}/children/${childId}`)
  .on('value', snapshot => {
    const child = snapshot.val()
    const levelConfig = getLevelConfig(familyId)
    const level = getCurrentLevel(child.xp, levelConfig)
    // Update UI with new XP and level
  })
```

---

## 6. Migration Checklist

### Phase 1: Firebase Setup
- [ ] Create Firebase project (free tier)
- [ ] Enable Firebase Authentication (email/password)
- [ ] Enable Firebase Realtime Database
- [ ] Configure security rules (users can only write their own data + owned families)
- [ ] Initialize Firebase Admin SDK for backend

### Phase 2: Code Changes
- [ ] Update frontend auth (replace email/password forms with Firebase SDK)
- [ ] Update backend to verify Firebase tokens
- [ ] Create migration script
- [ ] Update family/child operations to write to Firebase
- [ ] Update stats calculation to read from Firebase

### Phase 3: Migration
- [ ] Test migration script on staging Firebase project
- [ ] Run migration script on production
- [ ] Verify counts match (accounts, families, children, tasks)
- [ ] Update admin.html to read from Firebase (familyIds, stats)

### Phase 4: Testing & Cleanup
- [ ] Run test suite (npm run test:all)
- [ ] Manual testing on all user flows (signup, login, task completion, stats)
- [ ] Remove Netlify Blobs references
- [ ] Keep migration report for audit trail

---

## 7. Error Handling & Rollback

### Migration Rollback
- If migration script fails → run again (idempotent)
- If Firebase write fails → retry with exponential backoff
- If rules misconfigured → update and re-run affected sections

### Data Validation
- Migration script verifies counts before/after
- Stats recalculation validates level configs exist
- Backend logs any missing data references

---

## 8. Testing Strategy

**Unit tests** (test suite):
- Level calculation with different configs
- Level config validation (ordered, increasing XP)
- Migration script data transformation

**Integration tests**:
- Task completion updates XP in Firebase + recalculates level
- Family level config applies correctly to all children
- Admin config changes reflect immediately

**Manual testing**:
- Signup/login with Firebase Auth
- Task completion syncs in real-time across devices
- Admin can modify level config and see changes apply

---

## 9. Future Extensibility

- Per-family settings (bonus XP multipliers, daily bonus amounts)
- Leaderboards (top XP gainers per family)
- Level achievements/milestones (alert on level up)
- Different difficulty tiers (easy/medium/hard tasks multiply XP differently)

---

**Status**: Design complete. Ready for implementation plan.
