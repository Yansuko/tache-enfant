import admin from 'firebase-admin';

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

export const db = admin.database();
export const auth = admin.auth();
