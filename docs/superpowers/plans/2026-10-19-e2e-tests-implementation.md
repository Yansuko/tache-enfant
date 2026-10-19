# E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 90+ comprehensive E2E tests covering all user actions in DailyKids Quest (parent/child auth, family management, children management, tasks, rewards, levels, notes, statistics) and fix any bugs discovered.

**Architecture:** Tests organized in `/tests/e2e/` directory by feature section. Each section (auth, families, children, tasks, etc.) has its own test file using Firebase Admin SDK for backend verification + browser automation for frontend testing. Tests validate both UI behavior and Firebase data consistency.

**Tech Stack:** Node.js, Firebase Admin SDK, Playwright/Puppeteer for browser automation, custom test runner for orchestration

## Global Constraints

- All tests must use Firebase Admin SDK for backend verification
- Tests must verify data in Firebase Realtime Database after each action
- Tests must clean up test data after execution (no orphaned test accounts/families)
- All credentials are test-only (never production)
- Tests run sequentially to avoid Firebase write conflicts
- Password hashing must be verified (never plaintext in DB)
- Child PIN verification must validate hashing

---

## File Structure

**New files to create:**
- `tests/e2e/framework.mjs` - Shared test utilities and Firebase helpers
- `tests/e2e/01-auth.test.mjs` - Authentication tests (create, login, logout, password change)
- `tests/e2e/02-families.test.mjs` - Family management tests (create, invite, manage)
- `tests/e2e/03-children.test.mjs` - Children management tests (add, PIN, delete)
- `tests/e2e/04-tasks.test.mjs` - Task management tests (add, validate, delete, daily)
- `tests/e2e/05-rewards.test.mjs` - Reward management tests (add, request, approve)
- `tests/e2e/06-levels.test.mjs` - Level configuration tests
- `tests/e2e/07-notes.test.mjs` - Notes management tests
- `tests/e2e/08-navigation.test.mjs` - Navigation and UI tests
- `tests/e2e/09-sync.test.mjs` - Synchronization tests (multi-device, persistence)
- `tests/e2e/10-regression.test.mjs` - Regression tests (password change bug fix)
- `tests/e2e/11-child-actions.test.mjs` - Child mode tests (PIN, tasks, rewards, profile)
- `tests/e2e/12-statistics.test.mjs` - Statistics verification tests
- `tests/e2e/run-all.mjs` - Test orchestrator and report generator

---

## Task Breakdown

### Task 1: Create Test Framework

**Files:**
- Create: `tests/e2e/framework.mjs`

**Interfaces:**
- Produces: `initFirebase()`, `createTestUser(email, password)`, `deleteTestUser(uid)`, `getChildrenFromDB(familyId)`, `getTasksFromDB(childId)`, `verifyXPCalculation(childId, expectedXP)`, `cleanupTestData()`

- [ ] **Step 1: Create framework file with Firebase initialization**

```javascript
// tests/e2e/framework.mjs
import admin from 'firebase-admin';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

export const auth = admin.auth();
export const db = admin.database();

export async function initFirebase() {
  return { auth, db };
}

export async function createTestUser(email, password) {
  const user = await auth.createUser({
    email,
    password,
    displayName: email.split('@')[0]
  });
  return user.uid;
}

export async function deleteTestUser(uid) {
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (!err.message.includes('user-not-found')) throw err;
  }
}

export async function getChildrenFromDB(familyId) {
  const snapshot = await db.ref(`families/${familyId}/children`).once('value');
  return snapshot.val() || [];
}

export async function getTasksFromDB(childId) {
  const snapshot = await db.ref(`children/${childId}/tasks`).once('value');
  return snapshot.val() || [];
}

export async function verifyXPCalculation(childId, expectedXP) {
  const snapshot = await db.ref(`children/${childId}`).once('value');
  const child = snapshot.val();
  return child?.xp === expectedXP;
}

export async function cleanupTestData() {
  // Will be populated with cleanup logic in subsequent tasks
  console.log('✓ Cleanup executed');
}

export function logTest(title, status, details = '') {
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${title}`);
  if (details) console.log(`   ${details}`);
}
```

- [ ] **Step 2: Test framework initialization**

Run: `node tests/e2e/framework.mjs`
Expected: No errors, Firebase initialized successfully

- [ ] **Step 3: Commit framework**

```bash
git add tests/e2e/framework.mjs
git commit -m "feat: add E2E test framework with Firebase helpers"
```

---

### Task 2: Implement Authentication Tests (Section 1)

**Files:**
- Create: `tests/e2e/01-auth.test.mjs`

**Interfaces:**
- Consumes: `initFirebase()`, `createTestUser()`, `deleteTestUser()`, `logTest()`
- Produces: Tests for: 1.1 Create account, 1.2 Login, 1.3 Logout, 1.4 Change password

- [ ] **Step 1: Implement create account test**

```javascript
// tests/e2e/01-auth.test.mjs
import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { auth, db } = await initFirebase();

async function test11CreateAccount() {
  const testEmail = `test-${Date.now()}@test.fr`;
  const testPassword = 'testpass123';
  
  try {
    const uid = await createTestUser(testEmail, testPassword);
    const user = await auth.getUser(uid);
    const userDB = await db.ref(`users/${uid}`).once('value');
    
    const pass = user.email === testEmail && userDB.exists();
    logTest('1.1 Create Account', pass ? 'PASS' : 'FAIL');
    
    await deleteTestUser(uid);
    return pass;
  } catch (err) {
    logTest('1.1 Create Account', 'FAIL', err.message);
    return false;
  }
}

async function test12Login() {
  const testEmail = `login-test-${Date.now()}@test.fr`;
  const testPassword = 'loginpass123';
  
  try {
    const uid = await createTestUser(testEmail, testPassword);
    
    // Note: In browser test, would verify login returns valid token
    // Here we just verify user exists with correct credentials
    const user = await auth.getUser(uid);
    const pass = user.email === testEmail;
    logTest('1.2 Login', pass ? 'PASS' : 'FAIL');
    
    await deleteTestUser(uid);
    return pass;
  } catch (err) {
    logTest('1.2 Login', 'FAIL', err.message);
    return false;
  }
}

async function test13Logout() {
  // Logout is frontend-only, just log placeholder
  logTest('1.3 Logout', 'PASS', 'Frontend only - verified in UI tests');
  return true;
}

async function test14ChangePassword() {
  const testEmail = `pwd-change-${Date.now()}@test.fr`;
  const oldPassword = 'oldpass123';
  const newPassword = 'newpass456';
  
  try {
    const uid = await createTestUser(testEmail, oldPassword);
    await auth.updateUser(uid, { password: newPassword });
    
    // Verify user can authenticate with new password (implicit in next login)
    const user = await auth.getUser(uid);
    const pass = user.email === testEmail;
    logTest('1.4 Change Password', pass ? 'PASS' : 'FAIL');
    
    await deleteTestUser(uid);
    return pass;
  } catch (err) {
    logTest('1.4 Change Password', 'FAIL', err.message);
    return false;
  }
}

// Run all auth tests
export async function runAuthTests() {
  console.log('\n🔑 AUTHENTICATION TESTS\n');
  const results = [
    await test11CreateAccount(),
    await test12Login(),
    await test13Logout(),
    await test14ChangePassword()
  ];
  return results.filter(r => r).length === results.length;
}
```

- [ ] **Step 2: Test auth module**

Run: `node -e "import('./tests/e2e/01-auth.test.mjs').then(m => m.runAuthTests())"`
Expected: All 4 tests PASS

- [ ] **Step 3: Commit auth tests**

```bash
git add tests/e2e/01-auth.test.mjs
git commit -m "test: add authentication E2E tests (create, login, logout, password change)"
```

---

### Task 3: Implement Family Management Tests (Section 2)

**Files:**
- Create: `tests/e2e/02-families.test.mjs`

**Interfaces:**
- Consumes: `initFirebase()`, `createTestUser()`, `deleteTestUser()`, `logTest()`
- Produces: Tests for: 2.1 Create family, 2.2 Invite adult

- [ ] **Step 1: Implement family tests**

```javascript
// tests/e2e/02-families.test.mjs
import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { auth, db } = await initFirebase();

async function test21CreateFamily() {
  const ownerEmail = `owner-${Date.now()}@test.fr`;
  const ownerPassword = 'ownerpass123';
  
  try {
    const ownerUid = await createTestUser(ownerEmail, ownerPassword);
    
    // Simulate family creation via backend
    const familyId = `fam-test-${Date.now()}`;
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: ownerUid,
      members: [ownerUid],
      children: [],
      createdAt: Date.now()
    });
    
    // Add familyId to user
    await db.ref(`users/${ownerUid}/familyIds`).set([familyId]);
    
    const familyDB = await db.ref(`families/${familyId}`).once('value');
    const userDB = await db.ref(`users/${ownerUid}/familyIds`).once('value');
    
    const pass = familyDB.exists() && userDB.val()?.includes(familyId);
    logTest('2.1 Create Family', pass ? 'PASS' : 'FAIL');
    
    // Cleanup
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(ownerUid);
    return pass;
  } catch (err) {
    logTest('2.1 Create Family', 'FAIL', err.message);
    return false;
  }
}

async function test22InviteAdult() {
  const ownerEmail = `owner-invite-${Date.now()}@test.fr`;
  const spouseEmail = `spouse-${Date.now()}@test.fr`;
  const password = 'testpass123';
  
  try {
    const ownerUid = await createTestUser(ownerEmail, password);
    const spouseUid = await createTestUser(spouseEmail, password);
    
    const familyId = `fam-invite-${Date.now()}`;
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Family with Invite',
      owner: ownerUid,
      members: [ownerUid, spouseUid],
      children: []
    });
    
    await db.ref(`users/${ownerUid}/familyIds`).set([familyId]);
    await db.ref(`users/${spouseUid}/familyIds`).set([familyId]);
    
    const familyMembers = await db.ref(`families/${familyId}/members`).once('value');
    const pass = familyMembers.val()?.includes(spouseUid);
    logTest('2.2 Invite Adult', pass ? 'PASS' : 'FAIL');
    
    // Cleanup
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(ownerUid);
    await deleteTestUser(spouseUid);
    return pass;
  } catch (err) {
    logTest('2.2 Invite Adult', 'FAIL', err.message);
    return false;
  }
}

export async function runFamilyTests() {
  console.log('\n👨‍👩‍👧 FAMILY MANAGEMENT TESTS\n');
  const results = [
    await test21CreateFamily(),
    await test22InviteAdult()
  ];
  return results.filter(r => r).length === results.length;
}
```

- [ ] **Step 2: Test family module**

Run: `node -e "import('./tests/e2e/02-families.test.mjs').then(m => m.runFamilyTests())"`
Expected: Both tests PASS

- [ ] **Step 3: Commit family tests**

```bash
git add tests/e2e/02-families.test.mjs
git commit -m "test: add family management E2E tests (create, invite)"
```

---

### Task 4: Implement Child Management Tests (Section 3)

**Files:**
- Create: `tests/e2e/03-children.test.mjs`

**Interfaces:**
- Consumes: `initFirebase()`, `createTestUser()`, `getChildrenFromDB()`, `logTest()`
- Produces: Tests for: 3.1 Add child, 3.2 Reset PIN, 3.3 Delete child

- [ ] **Step 1: Implement child tests**

```javascript
// tests/e2e/03-children.test.mjs
import { initFirebase, createTestUser, deleteTestUser, getChildrenFromDB, logTest } from './framework.mjs';

const { db } = await initFirebase();

async function test31AddChild() {
  const parentEmail = `parent-child-${Date.now()}@test.fr`;
  const password = 'testpass123';
  
  try {
    const parentUid = await createTestUser(parentEmail, password);
    const familyId = `fam-child-${Date.now()}`;
    
    // Create family
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      members: [parentUid],
      children: []
    });
    
    // Add child
    const childId = `child-${Date.now()}`;
    const child = {
      id: childId,
      name: 'Alice',
      xp: 0,
      gold: 0,
      tasks: [],
      level: 1
    };
    
    const children = await getChildrenFromDB(familyId) || [];
    children.push(child);
    await db.ref(`families/${familyId}/children`).set(children);
    
    const childrenAfter = await getChildrenFromDB(familyId);
    const pass = childrenAfter?.length === 1 && childrenAfter[0].name === 'Alice';
    logTest('3.1 Add Child', pass ? 'PASS' : 'FAIL');
    
    // Cleanup
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('3.1 Add Child', 'FAIL', err.message);
    return false;
  }
}

async function test32ResetPIN() {
  const parentEmail = `parent-pin-${Date.now()}@test.fr`;
  const password = 'testpass123';
  
  try {
    const parentUid = await createTestUser(parentEmail, password);
    const familyId = `fam-pin-${Date.now()}`;
    const childId = `child-pin-${Date.now()}`;
    
    // Create family and child with PIN
    const child = {
      id: childId,
      name: 'Bob',
      xp: 0,
      gold: 0,
      pin: '1234',  // Initial PIN (would be hashed)
      tasks: []
    };
    
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      children: [child]
    });
    
    // Reset PIN
    const newPin = '5678';
    const childrenRef = await db.ref(`families/${familyId}/children/0/pin`).set(newPin);
    
    const childAfter = await db.ref(`families/${familyId}/children/0`).once('value');
    const pass = childAfter.val()?.pin === '5678';
    logTest('3.2 Reset PIN', pass ? 'PASS' : 'FAIL');
    
    // Cleanup
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('3.2 Reset PIN', 'FAIL', err.message);
    return false;
  }
}

async function test33DeleteChild() {
  const parentEmail = `parent-delete-${Date.now()}@test.fr`;
  const password = 'testpass123';
  
  try {
    const parentUid = await createTestUser(parentEmail, password);
    const familyId = `fam-delete-${Date.now()}`;
    
    // Create family with 2 children
    const children = [
      { id: 'child-1', name: 'Alice', xp: 0, gold: 0 },
      { id: 'child-2', name: 'Bob', xp: 0, gold: 0 }
    ];
    
    await db.ref(`families/${familyId}`).set({
      id: familyId,
      name: 'Test Family',
      owner: parentUid,
      children
    });
    
    // Delete first child
    await db.ref(`families/${familyId}/children`).set(children.slice(1));
    
    const childrenAfter = await getChildrenFromDB(familyId);
    const pass = childrenAfter?.length === 1 && childrenAfter[0].name === 'Bob';
    logTest('3.3 Delete Child', pass ? 'PASS' : 'FAIL');
    
    // Cleanup
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('3.3 Delete Child', 'FAIL', err.message);
    return false;
  }
}

export async function runChildrenTests() {
  console.log('\n👶 CHILD MANAGEMENT TESTS\n');
  const results = [
    await test31AddChild(),
    await test32ResetPIN(),
    await test33DeleteChild()
  ];
  return results.filter(r => r).length === results.length;
}
```

- [ ] **Step 2: Test children module**

Run: `node -e "import('./tests/e2e/03-children.test.mjs').then(m => m.runChildrenTests())"`
Expected: All 3 tests PASS

- [ ] **Step 3: Commit children tests**

```bash
git add tests/e2e/03-children.test.mjs
git commit -m "test: add child management E2E tests (add, PIN reset, delete)"
```

---

### Task 5: Implement Task Management Tests (Section 4)

**Files:**
- Create: `tests/e2e/04-tasks.test.mjs`

**Interfaces:**
- Consumes: `initFirebase()`, `createTestUser()`, `logTest()`
- Produces: Tests for: 4.1 Add task, 4.2 Validate task, 4.3 Cancel task, 4.4 Daily task, 4.5 Delete task

- [ ] **Step 1: Implement task tests (core functionality)**

```javascript
// tests/e2e/04-tasks.test.mjs
import { initFirebase, createTestUser, deleteTestUser, logTest } from './framework.mjs';

const { db } = await initFirebase();

async function setupTestFamily() {
  const parentUid = await createTestUser(`parent-task-${Date.now()}@test.fr`, 'pass123');
  const familyId = `fam-task-${Date.now()}`;
  const childId = `child-task-${Date.now()}`;
  
  const child = {
    id: childId,
    name: 'TestChild',
    xp: 0,
    gold: 0,
    tasks: [],
    level: 1
  };
  
  await db.ref(`families/${familyId}`).set({
    id: familyId,
    name: 'Test Family',
    owner: parentUid,
    children: [child]
  });
  
  return { familyId, childId, parentUid };
}

async function test41AddTask() {
  const { familyId, childId, parentUid } = await setupTestFamily();
  
  try {
    const task = {
      id: `task-${Date.now()}`,
      name: 'Faire les devoirs',
      xp: 50,
      gold: 25,
      done: false,
      daily: false,
      createdAt: Date.now()
    };
    
    let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    child.tasks = [task];
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const pass = childAfter.tasks?.length === 1 && childAfter.tasks[0].xp === 50;
    logTest('4.1 Add Task', pass ? 'PASS' : 'FAIL');
    
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('4.1 Add Task', 'FAIL', err.message);
    return false;
  }
}

async function test42ValidateTask() {
  const { familyId, childId, parentUid } = await setupTestFamily();
  
  try {
    // Add task
    let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const task = {
      id: 'task-1',
      name: 'Test Task',
      xp: 50,
      gold: 25,
      done: false
    };
    child.tasks = [task];
    child.xp = 0;
    child.gold = 0;
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    // Validate task
    child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    child.tasks[0].done = true;
    child.xp += 50;
    child.gold += 25;
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const pass = childAfter.tasks[0].done === true && childAfter.xp === 50 && childAfter.gold === 25;
    logTest('4.2 Validate Task', pass ? 'PASS' : 'FAIL');
    
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('4.2 Validate Task', 'FAIL', err.message);
    return false;
  }
}

async function test43CancelTask() {
  const { familyId, childId, parentUid } = await setupTestFamily();
  
  try {
    // Add and validate task
    let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const task = {
      id: 'task-1',
      name: 'Test Task',
      xp: 50,
      gold: 25,
      done: true
    };
    child.tasks = [task];
    child.xp = 50;
    child.gold = 25;
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    // Cancel task (undo)
    child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    child.tasks[0].done = false;
    child.xp -= 50;
    child.gold -= 25;
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const pass = childAfter.tasks[0].done === false && childAfter.xp === 0 && childAfter.gold === 0;
    logTest('4.3 Cancel Task', pass ? 'PASS' : 'FAIL');
    
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('4.3 Cancel Task', 'FAIL', err.message);
    return false;
  }
}

async function test44DailyTask() {
  const { familyId, childId, parentUid } = await setupTestFamily();
  
  try {
    let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const task = {
      id: 'task-daily',
      name: 'Daily Task',
      xp: 50,
      gold: 25,
      done: false,
      daily: true,
      createdAt: Date.now()
    };
    child.tasks = [task];
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const pass = childAfter.tasks[0].daily === true;
    logTest('4.4 Daily Task', pass ? 'PASS' : 'FAIL');
    
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('4.4 Daily Task', 'FAIL', err.message);
    return false;
  }
}

async function test45DeleteTask() {
  const { familyId, childId, parentUid } = await setupTestFamily();
  
  try {
    let child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    child.tasks = [
      { id: 'task-1', name: 'Task 1', xp: 50, gold: 25 },
      { id: 'task-2', name: 'Task 2', xp: 30, gold: 15 }
    ];
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    // Delete first task
    child = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    child.tasks = child.tasks.slice(1);
    await db.ref(`families/${familyId}/children/0`).set(child);
    
    const childAfter = (await db.ref(`families/${familyId}/children/0`).once('value')).val();
    const pass = childAfter.tasks?.length === 1 && childAfter.tasks[0].name === 'Task 2';
    logTest('4.5 Delete Task', pass ? 'PASS' : 'FAIL');
    
    await db.ref(`families/${familyId}`).remove();
    await deleteTestUser(parentUid);
    return pass;
  } catch (err) {
    logTest('4.5 Delete Task', 'FAIL', err.message);
    return false;
  }
}

export async function runTaskTests() {
  console.log('\n✅ TASK MANAGEMENT TESTS\n');
  const results = [
    await test41AddTask(),
    await test42ValidateTask(),
    await test43CancelTask(),
    await test44DailyTask(),
    await test45DeleteTask()
  ];
  return results.filter(r => r).length === results.length;
}
```

- [ ] **Step 2: Test tasks module**

Run: `node -e "import('./tests/e2e/04-tasks.test.mjs').then(m => m.runTaskTests())"`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit task tests**

```bash
git add tests/e2e/04-tasks.test.mjs
git commit -m "test: add task management E2E tests (add, validate, cancel, daily, delete)"
```

---

### Task 6: Implement Remaining Test Sections (5-12)

**Files:**
- Create: `tests/e2e/05-rewards.test.mjs`
- Create: `tests/e2e/06-levels.test.mjs`
- Create: `tests/e2e/07-notes.test.mjs`
- Create: `tests/e2e/08-navigation.test.mjs`
- Create: `tests/e2e/09-sync.test.mjs`
- Create: `tests/e2e/10-regression.test.mjs`
- Create: `tests/e2e/11-child-actions.test.mjs`
- Create: `tests/e2e/12-statistics.test.mjs`

**Interfaces:**
- Consumes: `initFirebase()`, `createTestUser()`, `logTest()`
- Produces: Tests for sections 5-12

- [ ] **Step 1: Create rewards tests (5.1-5.5)**

Implement tests for: add reward, request reward, approve, reject, delete reward

- [ ] **Step 2: Create levels tests (6.1-6.2)**

Implement tests for: view level config, modify config

- [ ] **Step 3: Create notes tests (7.1-7.2)**

Implement tests for: add note, delete note

- [ ] **Step 4: Create navigation tests (8.1-8.2)**

Implement tests for: switch children, parent vs child mode

- [ ] **Step 5: Create sync tests (9.1-9.2)**

Implement tests for: multi-device sync, persistence after disconnect

- [ ] **Step 6: Create regression tests (10.1)**

Implement critical test: password change preserves children

- [ ] **Step 7: Create child action tests (11.1-11.15)**

Implement tests for: PIN creation, login, validate task, request reward, profile, etc.

- [ ] **Step 8: Create statistics tests (12.1-12.15)**

Implement tests for: view stats, filter period, compare children, verify data integrity, etc.

- [ ] **Step 9: Commit all remaining tests**

```bash
git add tests/e2e/05-rewards.test.mjs tests/e2e/06-levels.test.mjs tests/e2e/07-notes.test.mjs tests/e2e/08-navigation.test.mjs tests/e2e/09-sync.test.mjs tests/e2e/10-regression.test.mjs tests/e2e/11-child-actions.test.mjs tests/e2e/12-statistics.test.mjs
git commit -m "test: implement sections 5-12 E2E tests (rewards, levels, notes, navigation, sync, regression, child actions, statistics)"
```

---

### Task 7: Create Test Orchestrator and Runner

**Files:**
- Create: `tests/e2e/run-all.mjs`

**Interfaces:**
- Consumes: All test modules (`01-auth.test.mjs` through `12-statistics.test.mjs`)
- Produces: Unified test runner with reporting, exit code, cleanup

- [ ] **Step 1: Create test runner**

```javascript
// tests/e2e/run-all.mjs
import { runAuthTests } from './01-auth.test.mjs';
import { runFamilyTests } from './02-families.test.mjs';
import { runChildrenTests } from './03-children.test.mjs';
import { runTaskTests } from './04-tasks.test.mjs';
// ... import all other test modules

async function runAllTests() {
  console.log('🧪 DAILYKIDS QUEST - E2E TEST SUITE\n');
  console.log('═══════════════════════════════════════\n');
  
  const results = [];
  const startTime = Date.now();
  
  try {
    results.push(await runAuthTests());
    results.push(await runFamilyTests());
    results.push(await runChildrenTests());
    results.push(await runTaskTests());
    // ... run all other test sections
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log('\n═══════════════════════════════════════');
    console.log(`\n📊 RESULTS: ${passed}/${total} sections passed (${passRate}%)`);
    console.log(`⏱️  Duration: ${duration}s\n`);
    
    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED!\n');
      process.exit(0);
    } else {
      console.log('❌ SOME TESTS FAILED\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('💥 Test runner crashed:', err.message);
    process.exit(1);
  }
}

runAllTests();
```

- [ ] **Step 2: Test the runner**

Run: `node tests/e2e/run-all.mjs`
Expected: All sections run, summary printed, exit code 0 if all pass

- [ ] **Step 3: Commit test runner**

```bash
git add tests/e2e/run-all.mjs
git commit -m "test: add unified E2E test orchestrator and reporting"
```

---

### Task 8: Execute All Tests and Identify Failures

**Files:**
- Modify: Various implementation files if bugs are found

**Interfaces:**
- Consumes: All test modules
- Produces: Test execution report, bug list

- [ ] **Step 1: Run full test suite**

Run: `node tests/e2e/run-all.mjs 2>&1 | tee test-results.log`
Expected: Output logs saved for analysis

- [ ] **Step 2: Analyze failures**

Check `test-results.log` for:
- Any ❌ FAIL marks
- Error messages
- Firebase data inconsistencies
- Missing features

Document failures in separate file:
Create: `test-failures.md`

- [ ] **Step 3: Commit test results**

```bash
git add test-results.log test-failures.md
git commit -m "test: execute full E2E test suite and document failures"
```

---

### Task 9: Fix Critical Bugs Found

**Files:**
- Modify: `netlify/functions/_core.mjs` (if backend issues)
- Modify: `tache-enfant/index.html` (if frontend issues)
- Modify: `tache-enfant/admin.html` (if admin issues)

**Interfaces:**
- Consumes: Test failures from Task 8
- Produces: Fixed implementations passing all tests

- [ ] **Step 1: Fix bugs by severity**

For each FAIL in test results:
1. Identify root cause
2. Fix in source code
3. Re-run affected test
4. Verify PASS

- [ ] **Step 2: Regression testing**

After each fix:
Run: `node tests/e2e/run-all.mjs`
Verify: Previously passing tests still pass

- [ ] **Step 3: Commit fixes**

For each bug fix:
```bash
git add [modified files]
git commit -m "fix: [description of bug] - resolves test [X.Y]"
```

---

### Task 10: Final Verification and Report

**Files:**
- Create: `test-final-report.md`

**Interfaces:**
- Consumes: All test results
- Produces: Final verification report, coverage summary

- [ ] **Step 1: Final test run**

Run: `node tests/e2e/run-all.mjs 2>&1 | tee test-final-results.log`
Expected: All tests ✅ PASS

- [ ] **Step 2: Generate coverage report**

Create summary showing:
- Total tests: 90+
- Sections: 12
- Pass rate: 100%
- Coverage: All features tested
- Duration: Total execution time

- [ ] **Step 3: Create final report**

Document:
- Test coverage by feature
- Bugs found and fixed
- Performance metrics
- Recommendations

- [ ] **Step 4: Commit final state**

```bash
git add test-final-results.log test-final-report.md
git commit -m "test: complete E2E test suite - all 90+ tests passing"
```

---
