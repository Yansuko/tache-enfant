export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://YOUR_PROJECT.firebaseio.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "YOUR_PROJECT",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "YOUR_MESSAGING_ID",
  appId: process.env.FIREBASE_APP_ID || "YOUR_APP_ID"
};
