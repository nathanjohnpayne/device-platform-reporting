// firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// Replace the placeholder values below with your actual Firebase config.
// Find them in: Firebase Console → Project Settings → General → Your apps
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY            || 'YOUR_API_KEY',
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN        || 'device-platform-reporting.firebaseapp.com',
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID         || 'device-platform-reporting',
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET     || 'device-platform-reporting.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '741928725277',
  appId:             process.env.REACT_APP_FIREBASE_APP_ID             || 'YOUR_APP_ID',
  measurementId:     process.env.REACT_APP_FIREBASE_MEASUREMENT_ID     || 'YOUR_MEASUREMENT_ID',
};

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const storage  = getStorage(app);
export const analytics = getAnalytics(app);
export const googleProvider = new GoogleAuthProvider();

// Allowed email domains — enforced both here and in Firestore security rules
export const ALLOWED_DOMAINS = ['disney.com', 'disneystreaming.com'];

export function isAllowedEmail(email = '') {
  return ALLOWED_DOMAINS.some(d => email.toLowerCase().endsWith('@' + d));
}
