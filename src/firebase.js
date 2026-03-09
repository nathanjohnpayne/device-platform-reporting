// firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// Replace the placeholder values below with your actual Firebase config.
// Find them in: Firebase Console → Project Settings → General → Your apps
// ─────────────────────────────────────────────────────────────────────────────
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'firebase/analytics';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD52LtA8oEHnB8WfLGvv_90UNwIBJZ2v08',
  authDomain: 'device-platform-reporting.firebaseapp.com',
  projectId: 'device-platform-reporting',
  storageBucket: 'device-platform-reporting.firebasestorage.app',
  messagingSenderId: '741928725277',
  appId: '1:741928725277:web:d9c471f320391c502f0ff4',
  measurementId: 'G-KPB589VPT4',
};

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: process.env.REACT_APP_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_CONFIG.measurementId,
};

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const db       = getFirestore(app);
export const storage  = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
export let analytics = null;

isAnalyticsSupported()
  .then((supported) => {
    if (supported && firebaseConfig.measurementId) {
      analytics = getAnalytics(app);
    }
  })
  .catch(() => {
    analytics = null;
  });

// Allowed email domains — enforced both here and in Firestore security rules
export const ALLOWED_DOMAINS = ['disney.com', 'disneystreaming.com'];

export function isAllowedEmail(email = '') {
  return ALLOWED_DOMAINS.some(d => email.toLowerCase().endsWith('@' + d));
}
