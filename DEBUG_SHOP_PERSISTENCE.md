# Shop Persistence Debug Guide

## Complete Flow With Logging

I've added comprehensive logging at every step of the reward/sanction persistence flow. Follow this guide to identify where data is being lost.

### Test Steps

1. **Open browser dev console** (F12)
2. **Clear logs** and filter to see only shop-related messages
3. **Test Reward Approval Flow:**
   - Parent approves a pending reward request
   - Watch console for logs starting with `[APPROVE-`
4. **Test Sanction Application Flow:**
   - Parent applies a sanction to a child
   - Watch console for logs starting with `[SANCTION-` and `[PERSIST-`
5. **Verify persistence:**
   - Logout and login again
   - Check if approved rewards and applied sanctions are still there

### Log Locations & What They Tell You

#### 1. **Frontend - User Action Handler**

**Approval Handler:** Look for `[APPROVE-` logs
```
[APPROVE-BEFORE] state.requests: [{"child":"Emma","name":"Phone","status":"pending"}]
[APPROVE-FOUND] child=Emma, cost=40, old gold=100, new gold=60
[APPROVE-AFTER] state.requests: [{"child":"Emma","name":"Phone","status":"approved"}]
```

**Sanction Handler:** Look for `[SANCTION-` logs
```
[SANCTION-BEFORE] child.sanctions: []
[SANCTION-APPLY] Applying "Bad behavior" (10🪙) to Emma
[SANCTION-AFTER] child.sanctions: [{"motif":"Bad behavior","gold":10}]
```

**What they tell you:**
- ✅ If you see AFTER logs: state WAS modified locally
- ❌ If AFTER logs show the same as BEFORE: modification failed

---

#### 2. **Frontend - Save Function (persistFamily)**

**Sending to API:** Look for `[PERSIST-SEND-SHOP-` logs
```
[PERSIST-SEND-SHOP-abc123] requests: [{"child":"Emma","name":"Phone","status":"approved","cost":40}]
[PERSIST-SEND-SHOP-abc123] sanctionsList: [{"name":"Bad behavior","gold":10}]
[PERSIST-SEND-SHOP-abc123] children sanctions: [{"name":"Emma","gold":60,"sanctions":1}]
```

**Critical check:**
- ✅ If approved requests are here with `status: "approved"` → being sent correctly
- ✅ If sanctions are in the children data → being sent correctly
- ❌ If requests show `status: "pending"` or sanctions are missing → not being sent

**Receiving from Backend:** Look for `[PERSIST-RECV-SHOP-` logs
```
[PERSIST-RECV-SHOP-abc123] Backend returned - requests: [{"child":"Emma","name":"Phone","status":"approved"}]
[PERSIST-RECV-SHOP-abc123] Backend returned - sanctionsList: [{"name":"Bad behavior","gold":10}]
```

**Critical check:**
- ✅ If approved status is here → backend received and persisted it
- ❌ If back to pending → backend might be resetting it
- ❌ If requests are empty → something wrong with backend merge

**After Merge:** Look for `[PERSIST-MERGE-` logs
```
[PERSIST-MERGE-abc123] After merge - requests: [{"child":"Emma","name":"Phone","status":"approved"}]
[PERSIST-MERGE-abc123] After merge - sanctionsList: [{"name":"Bad behavior","gold":10}]
```

**Critical check:**
- ✅ If same as received from backend → merge worked
- ❌ If reverted to pending → merge logic is wrong
- ❌ If empty → merge overwrote with stale data

---

#### 3. **Backend - saveFamily Function**

**Receiving Data:** Look for `[SAVEFAMILY-RECV-SHOP-` logs
```
[SAVEFAMILY-RECV-SHOP-xyz789] requests: [{"child":"Emma","name":"Phone","status":"approved"}]
[SAVEFAMILY-RECV-SHOP-xyz789] sanctionsList: [{"name":"Bad behavior","gold":10}]
[SAVEFAMILY-RECV-CHILD0-xyz789] name=Emma, gold=60, sanctions=[{"motif":"Bad behavior","gold":10}]
```

**After Normalization:** Look for `[SAVEFAMILY-NORM-SHOP-` logs
```
[SAVEFAMILY-NORM-SHOP-xyz789] requests after normalize: [{"child":"Emma","name":"Phone","status":"approved"}]
```

**Critical check:**
- ✅ If same as received → normalization preserved data
- ❌ If reverted or empty → Firebase conversion is breaking it

**Merged Data:** Look for `[SAVEFAMILY-MERGED-` logs
```
[SAVEFAMILY-MERGED-xyz789] requests: [{"child":"Emma","name":"Phone","status":"approved"}]
[SAVEFAMILY-MERGED-xyz789] sanctionsList: [{"name":"Bad behavior","gold":10}]
```

**Firebase Write:** Look for `[SAVEFAMILY-WRITE-SHOP-` logs
```
[SAVEFAMILY-WRITE-SHOP-xyz789] Writing to Firebase - requests: [{"child":"Emma","name":"Phone","status":"approved"}]
[SAVEFAMILY-WRITE-SHOP-xyz789] Writing to Firebase - sanctionsList: [{"name":"Bad behavior","gold":10}]
```

**Return to Frontend:** Look for `[SAVEFAMILY-RETURN-` logs
```
[SAVEFAMILY-RETURN-xyz789] Returning to frontend - requests: [{"child":"Emma","name":"Phone","status":"approved"}]
[SAVEFAMILY-RETURN-xyz789] Returning to frontend - sanctionsList: [{"name":"Bad behavior","gold":10}]
```

**Critical check:**
- ✅ If all three are the same → complete flow worked
- ❌ If different at any point → data is being lost at that step

---

## Quick Diagnosis Flowchart

```
1. Check [APPROVE-AFTER] / [SANCTION-AFTER]
   ├─ Missing → Handler didn't execute. Check if button has data-action="approve"
   └─ Present → Go to 2

2. Check [PERSIST-SEND-SHOP-*]
   ├─ requests empty / status: "pending" → State not updated. Check approve handler.
   ├─ sanctions missing → Child.sanctions not being sent. Check normalization.
   └─ Both correct → Go to 3

3. Check [PERSIST-RECV-SHOP-*]
   ├─ Empty / status: "pending" → Backend didn't persist. Go to 4
   └─ status: "approved" → Go to 5

4. Check [SAVEFAMILY-RECV-SHOP-*] and [SAVEFAMILY-WRITE-SHOP-*]
   ├─ Different → Backend lost data between receive and write
   │   Check: normalizeFamilyData, merge logic, array conversion
   └─ Same → Check Firebase logs for write errors

5. Check [PERSIST-MERGE-*]
   ├─ Empty / reverted → Frontend merge logic overwrote with stale data
   │   Check: persistFamily merge logic around line 393-402
   └─ Correct → Go to 6

6. Check after logout/login
   ├─ Data lost → Firebase write didn't persist. Check Firebase DB directly.
   └─ Data present → ✅ Persistence working!
```

## Testing Scenarios

### Scenario 1: Approve a Reward
```
1. Have a pending reward request from a child
2. Parent clicks "Approuver" button
3. Watch console for [APPROVE-* logs
4. Verify status changed to "approved"
5. Check if gold was deducted
6. Logout and login
7. Verify approval still there
```

### Scenario 2: Apply Sanction
```
1. Parent selects a child from dropdown
2. Parent clicks "Appliquer" on a sanction
3. Watch console for [SANCTION-* logs
4. Verify sanctions array has new entry
5. Check if gold was deducted
6. Logout and login
7. Verify sanction still there in child's sanctions list
```

### Scenario 3: Both Together
```
1. Do Scenario 1 AND 2
2. Check [PERSIST-SEND-SHOP-* has BOTH requests and child.sanctions
3. Verify both survive logout/login
```

## Files Modified

- `/home/yansu/workspace/tache-enfant/index.html` - Frontend handlers and persistence
- `/home/yansu/workspace/netlify/functions/_core.mjs` - Backend saveFamily function

## Key Logs to Save

When reporting results, save these log sequences:

1. User action: `[APPROVE-BEFORE]` → `[APPROVE-AFTER]` (or `[SANCTION-` equivalents)
2. Sending: `[PERSIST-SEND-SHOP-*]`
3. Backend receive: `[SAVEFAMILY-RECV-SHOP-*]`
4. Backend write: `[SAVEFAMILY-WRITE-SHOP-*]`
5. Frontend receive: `[PERSIST-RECV-SHOP-*]` and `[PERSIST-MERGE-*]`
6. After reload: Check if data persisted

If you can provide all these logs, the issue will be immediately apparent.
