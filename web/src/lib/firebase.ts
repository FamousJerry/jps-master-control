import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";

const REGION = "us-central1"; // must match functions setGlobalOptions

const firebaseConfig = {
  apiKey: "AIzaSyABNyyrjBNTHc0LCV3nauqdTCsp-1blXAo",
  authDomain: "jps-app-468911.firebaseapp.com",
  projectId: "jps-app-468911",
  storageBucket: "jps-app-468911.appspot.com",
  messagingSenderId: "532726782263",
  appId: "1:532726782263:web:0e227d27bc61ef719962b2",
  measurementId: "G-8HXP33E0S8"
};

export const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const functions: Functions = getFunctions(app, REGION);

// handy helpers for UI
export const signInGoogle = async () => {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
};
export const doSignOut = () => signOut(auth);
