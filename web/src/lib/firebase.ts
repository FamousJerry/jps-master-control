// web/src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Hard-coded project config (safe for client use)
// If you later prefer env vars, we can switch to Vite envs.
const firebaseConfig = {
  apiKey: "AIzaSyABNyyrjBNTHc0LCV3nauqdTCsp-1blXAo",
  authDomain: "jps-app-468911.firebaseapp.com",
  projectId: "jps-app-468911",
  storageBucket: "jps-app-468911.appspot.com",
  messagingSenderId: "532726782263",
  appId: "1:532726782263:web:0e227d27bc61ef719962b2",
  measurementId: "G-8HXP33E0S8",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Not used for Client Central anymore, but exported to avoid import errors elsewhere
export const functions = getFunctions(app);

export const googleProvider = new GoogleAuthProvider();
