import admin from 'firebase-admin';

let db, auth;

try {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT: ${error.message}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });

  db = admin.database();
  auth = admin.auth();
} catch (error) {
  // Firebase not configured - provide mock/stub for testing
  console.warn(`[FIREBASE-INIT] Warning: ${error.message} - using stubs for testing`);
  db = {
    ref: () => ({
      set: async () => { console.warn('[FIREBASE-STUB] db.ref().set() called'); },
      once: async () => ({ exists: () => false, val: () => null })
    })
  };
  auth = {
    createUser: async () => { throw new Error('[FIREBASE-STUB] auth.createUser() requires Firebase config'); },
    getUserByEmail: async () => { throw new Error('[FIREBASE-STUB] auth.getUserByEmail() requires Firebase config'); },
    verifyIdToken: async () => { throw new Error('[FIREBASE-STUB] auth.verifyIdToken() requires Firebase config'); }
  };
}

export { db, auth };
