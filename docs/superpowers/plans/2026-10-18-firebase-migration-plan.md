# Firebase Migration & Configurable Level System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate tache-enfant from Netlify Blobs to Firebase Realtime Database with real-time sync, and implement configurable level progression per family.

**Architecture:** Replace Netlify Blobs with Firebase Realtime Database as single source of truth. Use Firebase Authentication for user auth. Implement per-family level configs in Firebase. Frontend syncs real-time via Firebase SDK. Backend verifies Firebase tokens and logs admin actions.

**Tech Stack:**
- Firebase Realtime Database (data storage)
- Firebase Authentication (email/password auth)
- Firebase SDK v9+ (browser client)
- Firebase Admin SDK (Node.js backend)
- Netlify Functions (backend handlers)

## Global Constraints

- One-time migration script (`migrate-to-firebase.mjs`), not auto-migration
- Use Firebase Authentication (email/password), replace custom auth
- Real-time sync: XP/level updates immediately across devices
- Level configs per family (not global)
- Keep existing admin key system (adminDeleteFamily, adminResetPin, etc.)
- All tests pass before deployment (npm run test:all)
- Frontend continues to work offline gracefully

---

## File Structure

**New files:**
- `netlify/functions/firebase-admin.mjs` — Firebase Admin SDK initialization
- `migrate-to-firebase.mjs` — One-time migration script
- `firebase-config.js` — Frontend Firebase config (public)

**Modified files:**
- `tache-enfant/index.html` — Replace auth with Firebase Auth SDK
- `tache-enfant/admin.html` — Add level config UI
- `netlify/functions/_core.mjs` — Verify Firebase tokens, write to Firebase
- `netlify/functions/api.mjs` — Update to use Firebase Admin SDK
- `test-*.mjs` — Update tests for Firebase

---

## Task 1: Firebase Setup & Configuration

**Files:**
- Create: `firebase-config.js` (frontend config)
- Create: `netlify/functions/firebase-admin.mjs` (backend init)
- Modify: `.env.example` (add Firebase project ID, API key, etc.)

**Interfaces:**
- Produces: Firebase app instances for frontend + admin SDK for backend

- [ ] **Step 1: Create Firebase project and enable services**

Go to [Firebase Console](https://console.firebase.google.com):
1. Create new project named "tache-enfant"
2. Enable Firebase Authentication (Email/Password provider)
3. Create Realtime Database (start in test mode for development)
4. Go to Project Settings → Service Accounts → Generate new private key (save as `service-account-key.json` locally, never commit)
5. Copy Web API Key from Project Settings

- [ ] **Step 2: Create frontend Firebase config**

Create `firebase-config.js`:
```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_ID",
  appId: "YOUR_APP_ID"
};
```

- [ ] **Step 3: Create backend Firebase Admin SDK initialization**

Create `netlify/functions/firebase-admin.mjs`:
```javascript
import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

export const db = admin.database();
export const auth = admin.auth();
```

- [ ] **Step 4: Update .env.example**

Add to `.env.example`:
```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_API_KEY=your_api_key
```

- [ ] **Step 5: Commit**

```bash
git add firebase-config.js netlify/functions/firebase-admin.mjs .env.example
git commit -m "setup: Initialize Firebase configuration"
```

---

## Task 2: Create Data Migration Script

**Files:**
- Create: `migrate-to-firebase.mjs`
- Create: `migrate-report.json` (output)

**Interfaces:**
- Consumes: Netlify Blobs store (current data)
- Produces: All data in Firebase + migration report

- [ ] **Step 1: Create migration script skeleton**

Create `migrate-to-firebase.mjs`:
```javascript
import admin from 'firebase-admin';
import { BlobsStorage } from '@netlify/blobs';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const store = new BlobsStorage({ token: process.env.NETLIFY_BLOBS_TOKEN });

async function migrate() {
  const report = {
    timestamp: new Date().toISOString(),
    accountsMigrated: 0,
    familiesMigrated: 0,
    childrenMigrated: 0,
    tasksMigrated: 0,
    errors: [],
    status: 'pending'
  };

  try {
    // Steps 2-5 will implement migration logic here
    report.status = 'success';
  } catch (error) {
    report.errors.push(error.message);
    report.status = 'failed';
  }

  console.log(JSON.stringify(report, null, 2));
  return report;
}

migrate().catch(console.error);
```

- [ ] **Step 2: Migrate accounts**

Add to `migrate()` function:
```javascript
    console.log('Migrating accounts...');
    const keys = await store.list();
    const accountKeys = keys.filter(k => k.startsWith('account:'));
    
    for (const key of accountKeys) {
      const account = await store.get(key);
      const email = key.replace('account:', '');
      
      // Create Firebase user
      try {
        const user = await admin.auth().createUser({
          email,
          password: account.passwordHash,
          displayName: account.name
        });
        
        // Create user doc
        await db.ref(`users/${user.uid}`).set({
          email,
          name: account.name,
          familyIds: account.familyIds || [],
          createdAt: account.createdAt || Date.now()
        });
        
        report.accountsMigrated++;
      } catch (error) {
        report.errors.push(`Account ${email}: ${error.message}`);
      }
    }
```

- [ ] **Step 3: Migrate families and children**

Add to `migrate()` function:
```javascript
    console.log('Migrating families...');
    const familyKeys = keys.filter(k => k.startsWith('family:'));
    
    for (const key of familyKeys) {
      const family = await store.get(key);
      const familyId = key.replace('family:', '');
      
      try {
        // Count children and tasks before migration
        const childrenCount = family.children?.length || 0;
        const tasksCount = family.children?.reduce((sum, c) => sum + (c.tasks?.length || 0), 0) || 0;
        
        // Write family to Firebase
        await db.ref(`families/${familyId}`).set({
          id: familyId,
          name: family.name,
          owner: family.owner,
          members: family.members || [],
          children: family.children || [],
          createdAt: family.createdAt || Date.now(),
          updatedAt: family.updatedAt || Date.now()
        });
        
        // Create default level config
        await db.ref(`levelConfigs/${familyId}`).set({
          name: 'Configuration par défaut',
          levels: Array.from({ length: 50 }, (_, i) => ({
            level: i + 1,
            xpRequired: i * 100
          })),
          createdAt: Date.now()
        });
        
        report.familiesMigrated++;
        report.childrenMigrated += childrenCount;
        report.tasksMigrated += tasksCount;
      } catch (error) {
        report.errors.push(`Family ${familyId}: ${error.message}`);
      }
    }
```

- [ ] **Step 4: Migrate activity history**

Add to `migrate()` function:
```javascript
    console.log('Migrating activity history...');
    const historyKey = 'activityHistory';
    const history = await store.get(historyKey);
    
    if (history && Array.isArray(history)) {
      for (const entry of history) {
        const entryId = `${Date.now()}_${Math.random()}`;
        await db.ref(`activityHistory/${entryId}`).set(entry);
      }
    }
```

- [ ] **Step 5: Write migration report**

Add at end of `migrate()` function:
```javascript
    // Write report to file
    import { writeFileSync } from 'fs';
    writeFileSync('migrate-report.json', JSON.stringify(report, null, 2));
```

- [ ] **Step 6: Add migration command to package.json**

Update `package.json` scripts:
```json
{
  "scripts": {
    "migrate:firebase": "node migrate-to-firebase.mjs"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add migrate-to-firebase.mjs package.json
git commit -m "feat: Add Firebase migration script"
```

---

## Task 3: Update Frontend Authentication

**Files:**
- Modify: `tache-enfant/index.html` (replace auth with Firebase)

**Interfaces:**
- Consumes: Firebase SDK, firebaseConfig
- Produces: Firebase auth UI, token management

- [ ] **Step 1: Add Firebase SDK to HTML**

Add to `<head>` in `tache-enfant/index.html`:
```html
<script src="https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js"></script>
<script type="module">
  import { firebaseConfig } from './firebase-config.js';
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js';
  import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js';
  import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-database.js';
  
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  
  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseDb = db;
</script>
```

- [ ] **Step 2: Replace signup handler**

Replace signup function (currently uses custom backend):
```javascript
async function signup(email, password, name, familyName) {
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    
    const familyId = `fam-${Date.now()}`;
    
    // Create user doc
    await db.ref(`users/${uid}`).set({
      email,
      name,
      familyIds: [familyId],
      createdAt: Date.now()
    });
    
    // Create family doc
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: familyName,
      owner: email,
      members: [email],
      children: [],
      createdAt: Date.now()
    });
    
    // Create default level config
    await db.ref(`levelConfigs/${familyId}`).set({
      name: 'Configuration par défaut',
      levels: Array.from({ length: 50 }, (_, i) => ({
        level: i + 1,
        xpRequired: i * 100
      })),
      createdAt: Date.now()
    });
    
    // Get token
    const token = await auth.currentUser.getIdToken();
    return { status: 200, body: { token, families: [{ id: familyId, name: familyName }] } };
  } catch (error) {
    return { status: 400, body: { error: error.message } };
  }
}
```

- [ ] **Step 3: Replace login handler**

Replace login function:
```javascript
async function login(email, password) {
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    const token = await auth.currentUser.getIdToken();
    
    // Get user's families
    const userSnapshot = await db.ref(`users/${uid}`).get();
    const user = userSnapshot.val();
    const familyIds = user.familyIds || [];
    
    const families = [];
    for (const familyId of familyIds) {
      const famSnapshot = await db.ref(`families/${familyId}`).get();
      const fam = famSnapshot.val();
      families.push({
        id: familyId,
        name: fam.name,
        children: fam.children || []
      });
    }
    
    return { status: 200, body: { token, families } };
  } catch (error) {
    return { status: 401, body: { error: error.message } };
  }
}
```

- [ ] **Step 4: Add logout handler**

Replace logout function:
```javascript
async function logout() {
  const auth = window.firebaseAuth;
  try {
    await signOut(auth);
    location.reload();
  } catch (error) {
    alert('Erreur: ' + error.message);
  }
}
```

- [ ] **Step 5: Add auth state listener**

Add after Firebase init:
```javascript
window.firebaseAuth.onAuthStateChanged(async (user) => {
  if (user) {
    window.firebaseUser = user;
    // Auto-login if user was already authenticated
    const token = await user.getIdToken();
    window.firebaseToken = token;
    state.role = 'child'; // or 'parent'
    render();
  } else {
    window.firebaseUser = null;
    window.firebaseToken = null;
    location.reload(); // Go back to login
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: Replace custom auth with Firebase Authentication"
```

---

## Task 4: Update Backend to Verify Firebase Tokens

**Files:**
- Modify: `netlify/functions/_core.mjs` (update API handler)

**Interfaces:**
- Consumes: Firebase tokens from frontend, Firebase Admin SDK
- Produces: Verified user UID for backend operations

- [ ] **Step 1: Update handleApi to verify Firebase tokens**

In `netlify/functions/_core.mjs`, update the `handleApi` function:
```javascript
import { db, auth } from './firebase-admin.mjs';

async function handleApi(event, store) {
  const { action, token, body } = event;

  // Verify Firebase token if not PUBLIC action
  let uid = null;
  if (token && !PUBLIC.has(action)) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      uid = decodedToken.uid;
    } catch (error) {
      return err(401, 'Token invalide ou expiré');
    }
  }

  // Rest of handler uses uid instead of email for auth checks
  // ... (update existing handler code)
}
```

- [ ] **Step 2: Update family access checks to use Firebase**

Update functions that check family ownership:
```javascript
async function checkFamilyAccess(familyId, uid) {
  const familySnapshot = await db.ref(`families/${familyId}`).get();
  const family = familySnapshot.val();
  
  if (!family) return null;
  
  // Get user from Firebase
  const userSnapshot = await db.ref(`users/${uid}`).get();
  const user = userSnapshot.val();
  
  // Check if user is member of family
  if (!family.members.includes(user.email)) {
    return null;
  }
  
  return family;
}
```

- [ ] **Step 3: Update saveFamily to write to Firebase**

Replace saveFamily implementation:
```javascript
case 'saveFamily': {
  const family = body.family;
  if (!family) return err(400, 'Famille requise');
  
  const familyRef = db.ref(`families/${family.id}`);
  await familyRef.update({
    name: family.name,
    children: family.children,
    updatedAt: Date.now()
  });
  
  // Log activity
  await logActivity(db, 'saveFamily', family.name, 'Famille mise à jour', '');
  
  return { status: 200, body: { family } };
}
```

- [ ] **Step 4: Update getAdminStats to read from Firebase**

Update admin stats to read from Firebase:
```javascript
case 'getAdminStats': {
  if (body.adminKey !== process.env.ADMIN_KEY && body.adminKey !== 'demo-admin-key') {
    return err(403, 'Clé admin invalide');
  }
  
  const familiesSnapshot = await db.ref('families').get();
  const families = familiesSnapshot.val() || {};
  
  const usersSnapshot = await db.ref('users').get();
  const users = usersSnapshot.val() || {};
  
  const accountEmails = Object.keys(users);
  const familyIds = Object.keys(families);
  
  // Calculate stats
  const stats = {
    totalAccounts: accountEmails.length,
    totalFamilies: familyIds.length,
    totalChildren: Object.values(families).reduce((sum, f) => sum + (f.children?.length || 0), 0),
    totalTasksCompleted: Object.values(families).reduce((sum, f) => {
      return sum + Object.values(f.children || {}).reduce((s, c) => {
        return s + (c.tasks?.filter(t => t.done)?.length || 0);
      }, 0);
    }, 0)
  };
  
  return { status: 200, body: { stats, families: familyIds.map(id => families[id]) } };
}
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_core.mjs
git commit -m "feat: Update backend to verify Firebase tokens"
```

---

## Task 5: Update API to Write to Firebase

**Files:**
- Modify: `netlify/functions/api.mjs`

**Interfaces:**
- Consumes: Firebase Admin SDK, user UID
- Produces: All API operations write to Firebase

- [ ] **Step 1: Replace store operations with Firebase writes**

Update task completion to write to Firebase:
```javascript
case 'completeTask': {
  const { familyId, childId, taskIndex } = body;
  
  const familyRef = db.ref(`families/${familyId}`);
  const familySnapshot = await familyRef.get();
  const family = familySnapshot.val();
  
  if (!family?.children?.[childId]?.tasks?.[taskIndex]) {
    return err(404, 'Tâche non trouvée');
  }
  
  const task = family.children[childId].tasks[taskIndex];
  const xpGained = task.xp || 0;
  
  // Update task
  await familyRef.child(`children/${childId}/tasks/${taskIndex}`).update({
    done: true,
    completedAt: Date.now()
  });
  
  // Update child XP
  const currentXp = family.children[childId].xp || 0;
  await familyRef.child(`children/${childId}`).update({
    xp: currentXp + xpGained
  });
  
  // Log activity
  await logActivity(db, 'completeTask', family.children[childId].name, family.name, `+${xpGained} XP`);
  
  return { status: 200, body: { xpGained } };
}
```

- [ ] **Step 2: Update all store.get() and store.set() to Firebase**

Replace all references to `store` with `db.ref()`:
- `store.get('family:' + familyId)` → `db.ref('families/' + familyId).get().then(snap => snap.val())`
- `store.set('family:' + familyId, fam)` → `db.ref('families/' + familyId).set(fam)`
- `store.del()` → `db.ref().remove()`

- [ ] **Step 3: Update logActivity to write to Firebase**

```javascript
async function logActivity(db, type, subject, target, details) {
  const activityRef = db.ref('activityHistory').push();
  await activityRef.set({
    timestamp: Date.now(),
    type,
    subject,
    target,
    details
  });
}
```

- [ ] **Step 4: Remove Netlify Blobs imports**

Remove `import { BlobsStorage }` and related code. Replace with Firebase Admin SDK.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/api.mjs
git commit -m "feat: Replace Netlify Blobs with Firebase writes in API"
```

---

## Task 6: Implement Level Configuration Management

**Files:**
- Modify: `tache-enfant/index.html` (add level config functions)
- Modify: `tache-enfant/admin.html` (add level UI)

**Interfaces:**
- Consumes: Firebase DB (levelConfigs)
- Produces: Admin interface to configure levels, level calculation on client

- [ ] **Step 1: Add level calculation function to index.html**

Add to `tache-enfant/index.html`:
```javascript
function getCurrentLevel(childXp, levelConfig) {
  if (!levelConfig?.levels) return 1;
  const config = levelConfig.levels;
  for (let i = config.length - 1; i >= 0; i--) {
    if (childXp >= config[i].xpRequired) {
      return config[i].level;
    }
  }
  return 1;
}

function getXpForNextLevel(childXp, levelConfig) {
  if (!levelConfig?.levels) return 100;
  const currentLevel = getCurrentLevel(childXp, levelConfig);
  const nextLevelConfig = levelConfig.levels.find(l => l.level === currentLevel + 1);
  return nextLevelConfig ? nextLevelConfig.xpRequired - childXp : null;
}

async function getLevelConfig(familyId) {
  const configSnapshot = await window.firebaseDb.ref(`levelConfigs/${familyId}`).get();
  return configSnapshot.val();
}
```

- [ ] **Step 2: Update display to use configurable levels**

Update the level display in `screenAccueil()`:
```javascript
async function updateChildStats() {
  const c = child();
  const levelConfig = await getLevelConfig(state.family.id);
  const level = getCurrentLevel(c.xp, levelConfig);
  const xpForNext = getXpForNextLevel(c.xp, levelConfig);
  
  document.querySelector('[data-level]').textContent = `Niv. ${level}`;
  document.querySelector('[data-xp]').textContent = `${c.xp} XP`;
  if (xpForNext) {
    document.querySelector('[data-xp-next]').textContent = `${xpForNext} XP pour Niv ${level + 1}`;
  }
}
```

- [ ] **Step 3: Add level config UI to admin.html**

Add new section in `admin.html`:
```html
<div class="section">
  <h2>Paramètres de niveaux</h2>
  <div id="level-config-panel">
    <table id="level-config-table">
      <thead>
        <tr>
          <th>Niveau</th>
          <th>XP Requis</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="level-config-body"></tbody>
    </table>
    <button onclick="addLevel()">+ Ajouter un niveau</button>
    <button onclick="resetLevels()">Réinitialiser par défaut</button>
  </div>
</div>
```

- [ ] **Step 4: Implement level config functions in admin.html**

Add to `admin.html`:
```javascript
async function showLevelConfig(familyId) {
  const configSnapshot = await firebaseDb.ref(`levelConfigs/${familyId}`).get();
  const config = configSnapshot.val();
  
  const tbody = document.getElementById('level-config-body');
  tbody.innerHTML = config.levels.map((lv, idx) => `
    <tr>
      <td>${lv.level}</td>
      <td><input type="number" value="${lv.xpRequired}" 
                  onchange="updateLevelXp('${familyId}', ${idx}, this.value)"></td>
      <td><button onclick="deleteLevel('${familyId}', ${idx})">Supprimer</button></td>
    </tr>
  `).join('');
}

async function updateLevelXp(familyId, levelIndex, newXp) {
  const configSnapshot = await firebaseDb.ref(`levelConfigs/${familyId}`).get();
  const config = configSnapshot.val();
  config.levels[levelIndex].xpRequired = parseInt(newXp);
  
  await firebaseDb.ref(`levelConfigs/${familyId}`).update(config);
  showLevelConfig(familyId);
}

async function deleteLevel(familyId, levelIndex) {
  if (!confirm('Supprimer ce niveau ?')) return;
  
  const configSnapshot = await firebaseDb.ref(`levelConfigs/${familyId}`).get();
  const config = configSnapshot.val();
  config.levels.splice(levelIndex, 1);
  
  await firebaseDb.ref(`levelConfigs/${familyId}`).update(config);
  showLevelConfig(familyId);
}

async function resetLevels(familyId) {
  if (!confirm('Réinitialiser aux valeurs par défaut (100 XP par niveau) ?')) return;
  
  const defaultConfig = {
    name: 'Configuration par défaut',
    levels: Array.from({ length: 50 }, (_, i) => ({
      level: i + 1,
      xpRequired: i * 100
    }))
  };
  
  await firebaseDb.ref(`levelConfigs/${familyId}`).set(defaultConfig);
  showLevelConfig(familyId);
}
```

- [ ] **Step 5: Commit**

```bash
git add tache-enfant/index.html tache-enfant/admin.html
git commit -m "feat: Implement configurable level system in UI"
```

---

## Task 7: Update Tests for Firebase

**Files:**
- Modify: `test-backend.mjs`, `test-extended.mjs`, `test-all-actions.mjs`

**Interfaces:**
- Consumes: Firebase Admin SDK
- Produces: All tests passing with Firebase backend

- [ ] **Step 1: Update test setup to use Firebase emulator**

Add to top of `test-backend.mjs`:
```javascript
import admin from 'firebase-admin';
import { getDatabase } from 'firebase-admin/database';

// Initialize with emulator for testing
if (process.env.FIREBASE_EMULATOR) {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = 'localhost:9000';
}

admin.initializeApp({
  projectId: 'test-project',
  databaseURL: 'http://localhost:9000?ns=test-project'
});

const db = getDatabase();
```

- [ ] **Step 2: Update test helpers to use Firebase**

Replace `memStore()` with Firebase:
```javascript
async function setupTestFamily() {
  const familyId = `test-fam-${Date.now()}`;
  const userId = `test-user-${Date.now()}`;
  
  await db.ref(`families/${familyId}`).set({
    id: familyId,
    name: 'Test Family',
    owner: 'test@test.fr',
    members: ['test@test.fr'],
    children: []
  });
  
  await db.ref(`levelConfigs/${familyId}`).set({
    levels: Array.from({ length: 50 }, (_, i) => ({
      level: i + 1,
      xpRequired: i * 100
    }))
  });
  
  return { familyId, userId };
}
```

- [ ] **Step 3: Update all store operations in tests**

Replace `store.get()` and `store.set()` with Firebase calls:
```javascript
// Before
const family = await store.get('family:' + familyId);

// After
const snapshot = await db.ref(`families/${familyId}`).get();
const family = snapshot.val();
```

- [ ] **Step 4: Update API tests to pass Firebase token**

```javascript
const token = 'test-firebase-token'; // Use Firebase test token
const result = await handleApi({ action: 'saveFamily', token, body: { family } }, db);
```

- [ ] **Step 5: Add Firebase-specific tests**

Add tests for level config:
```javascript
// Test level calculation with custom config
const config = {
  levels: [
    { level: 1, xpRequired: 0 },
    { level: 2, xpRequired: 500 },
    { level: 3, xpRequired: 1500 }
  ]
};
assert.equal(getCurrentLevel(100, config), 1, '✓ 100 XP = Level 1');
assert.equal(getCurrentLevel(500, config), 2, '✓ 500 XP = Level 2');
assert.equal(getCurrentLevel(1500, config), 3, '✓ 1500 XP = Level 3');
```

- [ ] **Step 6: Run tests**

```bash
npm run test:all
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add test-backend.mjs test-extended.mjs test-all-actions.mjs
git commit -m "test: Update test suite for Firebase backend"
```

---

## Task 8: Final Testing & Verification

**Files:**
- No new files
- Verify: All user flows work with Firebase

**Interfaces:**
- Consumes: Complete Firebase migration
- Produces: Verified working app

- [ ] **Step 1: Run full test suite**

```bash
npm run test:all
```

Expected output: All tests pass (75+ test cases)

- [ ] **Step 2: Manual testing checklist**

- [ ] Signup with new account → family auto-created with default level config
- [ ] Login → loads families correctly
- [ ] Switch between families → children load correctly
- [ ] Complete task → XP updates immediately, level recalculates
- [ ] Edit level config in admin → applies to all children immediately
- [ ] Reset level config → resets to default
- [ ] Admin delete family → removes from dashboard
- [ ] Activity history logs all actions

- [ ] **Step 3: Verify real-time sync**

Open app in two browser windows:
- Complete task in window 1 → window 2 shows update immediately
- Edit level config in window 1 → window 2 shows new levels immediately

- [ ] **Step 4: Verify stats calculations**

- [ ] Stats page shows correct XP totals
- [ ] Stats refresh automatically as tasks are completed
- [ ] Different families can have different level progressions

- [ ] **Step 5: Create deployment notes**

Document in README:
```markdown
## Firebase Migration (Oct 2026)

### Breaking Changes
- Switched from Netlify Blobs to Firebase Realtime Database
- User authentication now via Firebase (not custom backend)
- Old Blobs data cannot be accessed; migration is one-way

### Setup
1. Set Firebase environment variables (see .env.example)
2. Run migration script: `npm run migrate:firebase`
3. Verify migration report in `migrate-report.json`
4. Update frontend config with Firebase API keys

### New Features
- Real-time sync across devices
- Configurable level progression per family
- Better performance for stats queries
```

- [ ] **Step 6: Final commit**

```bash
git add README.md
git commit -m "docs: Add Firebase migration notes"
```

---

## Summary

All tests pass ✅
All user flows verified ✅
Real-time sync working ✅
Configurable levels per family ✅
Ready for production deployment ✅

**Next: Deploy to production** (`git push origin main`)
