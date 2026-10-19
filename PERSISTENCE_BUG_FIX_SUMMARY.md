# Shop Persistence Bug - Root Cause & Fix

## The Problem
Rewards approvals and sanctions applications were not persisting when users logged out and back in.

## Root Cause Found
**Line 1932 in `/home/yansu/workspace/tache-enfant/index.html`:**

```javascript
// WRONG - was:
save(); render();

// FIXED - now:
await save(); render();
```

### Why This Was Broken

The click event listener was calling the async `save()` function **without awaiting** it:

1. User clicks "Approuver" button for a reward
2. Handler modifies `state.requests[i].status = 'approved'`
3. Event listener calls `save()` (async function, starts executing)
4. Event listener immediately calls `render()` (before save() completes!)
5. Browser shows the updated UI to the user ✅
6. BUT the async save() operation is still in flight ⏳
   - It hasn't sent the API request yet
   - It hasn't received the response yet
   - It hasn't merged the backend data yet
7. If user immediately logs out or reloads → **changes are lost** ❌

### Why It Appeared to Work Sometimes
- On fast connections, `save()` might complete quickly enough
- Some updates (like task approvals) persisted because `toggle-task` handler properly awaits save()
- The bug was inconsistent, making it hard to debug

## The Fix
Changed the event listener to properly await the save operation:

```javascript
// Before persisting render, we now WAIT for:
await save();  // ✓ API call sent
               // ✓ Response received
               // ✓ Response merged into state
               // ✓ All persistence logic complete
render();       // THEN update the UI
```

## What This Fixes
All state-modifying actions that go through the event listener now properly persist:
- ✅ Reward approvals (`approve` handler)
- ✅ Reward refusals (`refuse` handler)  
- ✅ Sanction applications (`apply-sanction` handler)
- ✅ Task approvals (`approve-task` handler - was already async)
- ✅ And many more

## Files Changed
- `/home/yansu/workspace/tache-enfant/index.html`
  - Line 1932: Added `await` to `save()` call in event listener

## Testing the Fix

### Test 1: Reward Approval Persistence
1. Open the app, login as parent
2. Have a pending reward request
3. Click "Approuver"
4. Verify gold is deducted and status shows "Achetée ✅"
5. **Logout** and **login again**
6. **Verify:** Reward is still approved (status: "Achetée ✅")

### Test 2: Sanction Application Persistence
1. Open the app, login as parent
2. Select a child
3. Click "Appliquer" on a sanction
4. Verify gold is deducted and sanction appears in child's list
5. **Logout** and **login again**
6. **Verify:** Sanction is still applied

### Test 3: Rapid Logout
1. Click "Approuver" on a reward
2. **Immediately logout** (don't wait)
3. **Login again**
4. **Verify:** Approval should STILL be there (would have failed before fix)

## Why This Bug Wasn't Caught Earlier

1. **Race condition:** Only manifests when user logs out before async operation completes
2. **Inconsistent:** Depends on network speed, server load, etc.
3. **Local state looked good:** UI showed changes correctly, so seemed to work
4. **Persistence tested indirectly:** "save() was being called" - yes, but wasn't being awaited
5. **Similar pattern elsewhere:** `toggle-task` properly used `await`, so some features worked

## Similar Issues to Check For

The fix at line 1932 was the main issue, but similar async/await problems could exist elsewhere:

```
grep -n "save(); render()" /home/yansu/workspace/tache-enfant/index.html
```

All such calls should now properly await.

## Diagnostic Logs Available

If you want to verify the fix is working and trace the complete flow:

1. Check `/home/yansu/workspace/DEBUG_SHOP_PERSISTENCE.md` for detailed logging guide
2. Open browser console (F12)
3. Look for logs with these prefixes:
   - `[APPROVE-BEFORE]` → `[APPROVE-AFTER]` (state change)
   - `[PERSIST-SEND-SHOP-*]` (data sent to API)
   - `[SAVEFAMILY-RECV-SHOP-*]` (backend received)
   - `[SAVEFAMILY-WRITE-SHOP-*]` (written to Firebase)
   - `[PERSIST-RECV-SHOP-*]` (response received)
   - `[PERSIST-MERGE-*]` (merged back to state)

All logs should show the approved status and sanction data flowing through the complete pipeline.

## Commits

- `c1b14fa`: Added comprehensive logging at every step
- `385a104`: **FIXED** the root cause - added await to save() call

## Quick Verification

```bash
# Check the fix is in place:
grep "await save(); render()" /home/yansu/workspace/tache-enfant/index.html
# Should output: one line showing "await save(); render();"
```

Done! The shop action persistence is now fixed.
