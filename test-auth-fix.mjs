import { handleApi, signToken, hashPassword } from './netlify/functions/_core.mjs';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
const store = {
  async get(key) {
    // Simulated in-memory store
    return this._data?.[key] || null;
  },
  async set(key, val) {
    this._data = this._data || {};
    this._data[key] = val;
  },
  async del(key) {
    if (this._data) delete this._data[key];
  },
  _data: {}
};

async function test() {
  console.log('[TEST] Starting authentication flow test...\n');

  // 1. Signup
  console.log('[TEST-1] Testing signup...');
  const signupRes = await handleApi({
    action: 'signup',
    token: null,
    body: {
      email: 'test@example.com',
      password: 'testpass123',
      name: 'Test User',
      familyName: 'Test Family'
    }
  }, store);

  if (signupRes.status !== 200 || !signupRes.body.token) {
    console.error('[TEST-1] FAILED: No token in signup response');
    console.error('Response:', signupRes);
    return;
  }
  console.log('[TEST-1] PASSED: Token received from signup');
  const signupToken = signupRes.body.token;

  // 2. Login
  console.log('\n[TEST-2] Testing login...');
  const loginRes = await handleApi({
    action: 'login',
    token: null,
    body: {
      email: 'test@example.com',
      password: 'testpass123'
    }
  }, store);

  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('[TEST-2] FAILED: No token in login response');
    return;
  }
  console.log('[TEST-2] PASSED: Token received from login');
  const loginToken = loginRes.body.token;

  // 3. Call 'me' with token
  console.log('\n[TEST-3] Testing "me" endpoint with token...');
  const meRes = await handleApi({
    action: 'me',
    token: loginToken,
    body: {}
  }, store);

  if (meRes.status !== 200 || !meRes.body.me) {
    console.error('[TEST-3] FAILED: "me" endpoint rejected token');
    console.error('Response:', meRes);
    return;
  }
  console.log('[TEST-3] PASSED: "me" endpoint accepted token');

  // 4. Call saveFamily with token
  console.log('\n[TEST-4] Testing "saveFamily" with token...');
  const familyId = loginRes.body.families[0]?.id;
  const saveFamilyRes = await handleApi({
    action: 'saveFamily',
    token: loginToken,
    body: {
      family: {
        id: familyId,
        name: 'Test Family',
        owner: 'test@example.com',
        members: ['test@example.com'],
        children: [],
        questList: [],
        proposals: [],
        rewards: [],
        requests: [],
        gradeRequests: [],
        taskRequests: [],
        sanctionsList: [],
        actionLog: []
      }
    }
  }, store);

  if (saveFamilyRes.status !== 200) {
    console.error('[TEST-4] FAILED: saveFamily rejected token');
    console.error('Response:', saveFamilyRes);
    return;
  }
  console.log('[TEST-4] PASSED: saveFamily accepted token');

  console.log('\n[TEST] All tests PASSED! ✓');
}

test().catch(err => {
  console.error('[TEST-ERROR]', err.message);
  process.exit(1);
});
