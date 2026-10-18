// Firebase wrapper - imports Firebase and exposes it globally for HTML script tags
import { initializeApp } from '../node_modules/firebase/app/dist/esm/index.esm.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  getDatabase
} from '../node_modules/firebase/auth/dist/esm/index.esm.js';
import { firebaseConfig } from '../firebase-config.js';
import { getDatabase as getRealtimeDb } from '../node_modules/firebase/database/dist/esm/index.esm.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getRealtimeDb(app);

// Expose to window
window.firebase = {
  app,
  auth,
  db,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
};

console.log('✅ Firebase initialized and exposed to window');
