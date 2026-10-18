# Task 3: Update Frontend Authentication - Completion Report

## Summary
Successfully implemented Firebase Authentication (SDK v9+) on the frontend, replacing the custom backend auth system with Firebase's managed authentication.

## Files Modified

### 1. `/home/yansu/workspace/tache-enfant/index.html` (Main app)
- **Lines 109-145**: Added Firebase SDK imports and initialization module
  - Import Firebase App, Auth, and all needed methods from CDN
  - Initialize Firebase with `firebaseConfig` from `/firebase-config.js`
  - Export auth functions to global window scope for use in non-module code
  - Set up auth state listener for token management

- **Lines 174-225**: Updated `api()` function
  - Changed to use Firebase token (`window.firebaseToken`) instead of localStorage token
  - Falls back to legacy token for compatibility during transition
  - Sends Firebase ID token in `Authorization: Bearer` header

- **Lines 1515-1546**: Updated signup and login handlers
  - **Login**: Uses `window.firebaseSignIn()` → calls `signInWithEmailAndPassword`
  - **Signup**: Uses `window.firebaseSignUp()` → calls `createUserWithEmailAndPassword`
  - Both get Firebase ID token and send to backend API for user data
  - Both call `onAuthed()` to set session state

- **Lines 1574-1580**: Updated logout handler
  - Uses `window.firebaseSignOut()` → calls Firebase's `signOut`
  - Clears Firebase token and session state
  - Error handling for logout failures

- **Lines 1701-1825**: Completely rewrote `boot()` function
  - Removed localStorage token restoration
  - Now waits for Firebase `onAuthStateChanged` to initialize
  - If Firebase user exists: gets ID token and restores session via `api('me')`
  - If no Firebase user: shows login screen
  - Preserves all existing task approval/restoration logic

## Implementation Details

### Firebase Auth Flow

**Signup Flow:**
1. User enters name, email, password, family name
2. Frontend calls `createUserWithEmailAndPassword(email, password)`
3. Firebase creates user and returns UserCredential
4. Get ID token from Firebase user
5. Send to backend: `api('signup', { name, email, familyName })`
6. Backend creates user doc and family
7. Session established

**Login Flow:**
1. User enters email and password
2. Frontend calls `signInWithEmailAndPassword(email, password)`
3. Firebase authenticates and returns UserCredential
4. Get ID token from Firebase user
5. Send to backend: `api('me')` to verify token and get user data
6. Session established

**Token Management:**
- `onAuthStateChanged` listener automatically updates token when auth state changes
- Token stored in `window.firebaseToken` (not localStorage)
- All API calls use token from `window.firebaseToken`
- Firebase automatically refreshes token as needed

**Session Persistence:**
- Boot checks Firebase auth state on app load
- If user logged in: restores session from Firebase user
- If no user: shows login screen
- No manual token restoration from localStorage needed

### Global Functions Exported to Window
```javascript
window.firebaseAuth              // Firebase Auth instance
window.firebaseOnAuthStateChanged // onAuthStateChanged function
window.firebaseSignIn             // signInWithEmailAndPassword
window.firebaseSignUp             // createUserWithEmailAndPassword
window.firebaseSignOut            // signOut
window.firebaseToken              // Current user's ID token
window.firebaseReady              // Flag indicating Firebase is initialized
```

## Critical Changes

1. **No localStorage token management**: Replaced with Firebase's auto-managed tokens
2. **No manual refresh logic**: Firebase handles token refresh automatically
3. **Session persistence automatic**: Firebase's `onAuthStateChanged` handles login state
4. **Authorization header format unchanged**: Still uses `Authorization: Bearer <token>`

## Expected Backend Integration

The frontend now expects the backend to:
1. Accept Firebase ID tokens in `Authorization: Bearer` header
2. Verify tokens using Firebase Admin SDK
3. Create user document on first signup
4. Return user data and families on subsequent requests

**Note**: Backend verification not yet implemented (Task 4).

## Test Checklist

- [ ] Signup form submits successfully (creates Firebase user)
- [ ] Signup sends ID token to backend
- [ ] Login form authenticates with Firebase
- [ ] Login sends ID token to backend
- [ ] Token persists in API calls (Authorization header)
- [ ] Logout clears Firebase session
- [ ] Page reload restores session if user is logged in
- [ ] All API calls include Authorization header

## Commit Info
- **SHA**: b82ddfc
- **Date**: Implemented Firebase Auth module and auth flows
- **Changes**: 432 insertions, 18 deletions

## Files Not Modified

- `/home/yansu/workspace/firebase-config.js` - Already created in Task 1
- `/home/yansu/workspace/tache-enfant/admin.html` - Uses admin key, not user auth
- `/home/yansu/workspace/tache-enfant/styles.css` - No changes needed

## Notes

- Password reset flow (`reset-password` action) still calls backend API - will need Firebase Password Reset when backend is updated
- Child authentication (PIN-based) is separate and unaffected by this change
- All UI and styling unchanged - only auth backend changed
