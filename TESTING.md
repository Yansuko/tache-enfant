# 🧪 Test Strategy & Deployment

## Overview
This project follows a comprehensive testing strategy with automated test suites before each production deployment.

## Test Suite

### 1. **Basic Backend Tests** (`test-backend.mjs`)
```bash
npm test
```
Tests core functionality:
- Authentication flow (signup, login, token verification)
- Family management and sharing
- Access control and security

### 2. **Extended Features Tests** (`test-extended.mjs`)
```bash
npm run test:extended
```
Tests new features:
- Admin operations (reset password, delete account, reset PIN)
- Task statistics (year, week, month periods)
- Admin dashboard functionality
- Activity history generation

### 3. **All API Actions Tests** (`test-all-actions.mjs`)
```bash
npm run test:actions
```
Tests all 18+ API actions:
- User authentication (5 actions)
- Family management (4 actions)
- Task management (5 actions)
- Admin operations (4 actions)
- Security & error handling

### 4. **Complete Test Suite**
```bash
npm run test:all
```
Runs all test suites in sequence:
1. Basic backend tests
2. Extended features tests
3. All API actions tests

## Pre-Production Checklist

### Before Every Deployment
1. ✅ Run complete test suite: `npm run test:all`
2. ✅ Verify all tests pass
3. ✅ Review changes in git: `git log --oneline -5`
4. ✅ Check console output for warnings/errors
5. ✅ Test in dev server: `npm run dev`

### Commands
```bash
# Run all tests
npm run test:all

# Start dev server for manual testing
npm run dev

# Push to production (after tests pass)
git push origin main
```

## Adding New Features

### Process
1. **Create the feature** in the code
2. **Write test cases** for the feature
3. **Run tests** to verify: `npm run test:all`
4. **Commit** with tests included
5. **Deploy** when all tests pass

### Test File Template
```javascript
// ── Tests for [Feature Name] ──
console.log('\n[emoji] [FEATURE NAME]:');

// Test 1: Basic functionality
r = await call(s, 'actionName', { /* parameters */ });
assert.equal(r.status, 200, '    ✓ Feature works');

// Test 2: Error handling
r = await call(s, 'actionName', { /* invalid params */ });
assert.equal(r.status, 400, '    ✓ Invalid input rejected');

// Test 3: Security
r = await call(s, 'actionName', { /* unauthorized */ });
assert.equal(r.status, 403, '    ✓ Unauthorized rejected');
```

## Recent Test Coverage

### Latest Tests Added
- ✅ Admin account management
- ✅ PIN reset functionality
- ✅ Activity history logging
- ✅ Task statistics aggregation
- ✅ All API actions (18+)

### Test Results
- **Basic Backend**: 16 test cases ✅ PASS
- **Extended Features**: 9 test cases ✅ PASS
- **All Actions**: 50+ test cases ✅ PASS
- **Total**: 75+ test cases covering complete app

## Continuous Integration

When available, integrate with CI/CD:
```yaml
# Example CI configuration
before_deploy:
  - npm run test:all
  
deploy:
  - git push origin main
```

## Best Practices

1. **Test before commit** - Always run `npm run test:all`
2. **Test new features** - Add tests for every new action
3. **Test edge cases** - Include error and security tests
4. **Clear assertions** - Use descriptive assertion messages
5. **Organize by feature** - Group related tests

## Troubleshooting Tests

### If tests fail:
1. Check the assertion error message
2. Review the test case
3. Fix the code or the test
4. Re-run: `npm run test:all`

### Common issues:
- **401 Unauthorized**: Check token validity
- **404 Not Found**: Verify resource exists
- **400 Bad Request**: Check required parameters
- **403 Forbidden**: Verify admin key or permissions

## Test Metrics

| Test Suite | Cases | Status | Command |
|-----------|-------|--------|---------|
| Backend | 16 | ✅ PASS | `npm test` |
| Extended | 9 | ✅ PASS | `npm run test:extended` |
| All Actions | 50+ | ✅ PASS | `npm run test:actions` |
| **Total** | **75+** | **✅ PASS** | `npm run test:all` |

## Future Improvements

- [ ] Add database integration tests
- [ ] Add API response time benchmarks
- [ ] Add load testing
- [ ] Add end-to-end UI tests (if frontend testing framework added)
- [ ] Integrate with GitHub Actions CI

---

**Last Updated**: 2026-10-11  
**Maintained By**: Development Team  
**Next Review**: After each major feature release
