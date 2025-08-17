import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";

/**
 * IMPORTANT:
 * - Keep these values matching your Firebase project (they’re yours already).
 * - Region must match where you deploy Cloud Functions (we’ve been using "us-central1").
 */
const firebaseConfig = {
  apiKey: "AIzaSyABNyyrjBNTHc0LCV3nauqdTCsp-1blXAo",
  authDomain: "jps-app-468911.firebaseapp.com",
  projectId: "jps-app-468911",
  storageBucket: "jps-app-468911.appspot.com",
  messagingSenderId: "532726782263",
  appId: "1:532726782263:web:0e227d27bc61ef719962b2",
  measurementId: "G-8HXP33E0S8"
};

// Singleton app
const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// SDK singletons
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
/** Region MUST match your deployed Functions region */
export const functions: Functions = getFunctions(app, "us-central1");
