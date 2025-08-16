import React, { useEffect, useState } from "react";
import { auth, db, functions } from "./lib/firebase";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

function Login() {
  const [err, setErr] = useState("");
  const google = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e:any) { setErr(e.message); }
  };
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-full max-w-sm bg-black/60 p-6 rounded-xl">
        <h1 className="text-2xl font-bold text-brand mb-2">Jingjai</h1>
        <p className="mb-4">Sign in to continue</p>
        {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
        <button onClick={google} className="w-full py-2 rounded-md bg-brand text-black font-semibold">Sign in with Google</button>
      </div>
    </div>
  );
}

function Clients() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"), limit(25));
    return onSnapshot(q, (snap) => setRows(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);
  const createQuick = async () => {
    const upsert = httpsCallable(functions, "upsertClient");
    await upsert({ legalName: "Acme Corp", tradingName: "Acme", industry: "Film", contacts: [] });
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Client Central</h2>
        <button onClick={createQuick} className="px-3 py-1.5 rounded bg-brand text-black font-semibold">+ Quick Add</button>
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.id} className="bg-neutral-800 p-3 rounded">
            <div className="flex justify-between">
              <div className="font-semibold">{r.tradingName || r.legalName}</div>
              <div className="text-xs text-neutral-400">{r.clientId || "—"}</div>
            </div>
            <div className="text-sm text-neutral-300">{r.industry}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-neutral-400">No clients yet.</div>}
      </div>
    </div>
  );
}

export default function App(){
  const [user, setUser] = useState<any>(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (!user) return <Login/>;
  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand">Jingjai • Master Control</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-300">{user.email}</span>
          <button onClick={() => signOut(auth)} className="text-sm text-neutral-400 hover:text-white">Logout</button>
        </div>
      </header>
      <Clients/>
    </div>
  );
}
