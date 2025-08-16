import React, { useEffect, useState } from "react";
import { auth, db, functions } from "./lib/firebase";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
