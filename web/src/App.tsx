// web/src/App.tsx
import React from "react";
import { auth, db, googleProvider } from "./lib/firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

/* ---------- small UI helpers ---------- */
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-black font-semibold disabled:opacity-50 ${
        props.className || ""
      }`}
    />
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded bg-[#2F2F2F] border border-gray-700 px-3 py-2 text-sm ${
        props.className || ""
      }`}
    />
  );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded bg-[#2F2F2F] border border-gray-700 px-3 py-2 text-sm ${
        props.className || ""
      }`}
    />
  );
}

/* ---------- types ---------- */
type Client = {
  id?: string;
  clientId?: string;
  legalName: string;
  tradingName?: string;
  industry: "TV" | "Film" | "Music Video" | "Commercial" | "Other";
  status: "Prospect" | "Active" | "Inactive";
  tier: "A" | "B" | "C";
  tags?: string[];
  updatedAt?: any;
  createdAt?: any;
};

/* ---------- Login ---------- */
const Login: React.FC = () => {
  const [err, setErr] = React.useState<string>("");
  const doLogin = async () => {
    setErr("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-black/70 p-8 rounded w-full max-w-sm">
        <h1 className="logo-neon text-3xl font-bold text-center mb-4">Jingjai</h1>
        {err && <div className="text-red-400 text-sm mb-2">{err}</div>}
        <Button onClick={doLogin} className="w-full">Sign in with Google</Button>
      </div>
    </div>
  );
};

/* ---------- Client Central (Firestore direct) ---------- */
const INDUSTRIES = ["TV", "Film", "Music Video", "Commercial", "Other"] as const;
const STATUSES = ["Prospect", "Active", "Inactive"] as const;
const TIERS = ["A", "B", "C"] as const;

const ClientCentral: React.FC<{ user: User }> = ({ user }) => {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [editing, setEditing] = React.useState<Client | null>(null);
  const [form, setForm] = React.useState({
    id: "",
    legalName: "",
    tradingName: "",
    industry: "TV",
    status: "Prospect",
    tier: "B",
    tagsCSV: "",
  });
  const [error, setError] = React.useState<string>("");

  // subscribe
  React.useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: Client[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setClients(rows);
    });
    return () => unsub();
  }, []);

  // open new form
  const startNew = () => {
    setError("");
    setEditing(null);
    setForm({
      id: "",
      legalName: "",
      tradingName: "",
      industry: "TV",
      status: "Prospect",
      tier: "B",
      tagsCSV: "",
    });
  };

  // open edit form
  const startEdit = (c: Client) => {
    setError("");
    setEditing(c);
    setForm({
      id: c.id || "",
      legalName: c.legalName || "",
      tradingName: c.tradingName || "",
      industry: (c.industry as any) || "TV",
      status: (c.status as any) || "Prospect",
      tier: (c.tier as any) || "B",
      tagsCSV: (c.tags || []).join(", "),
    });
  };

  const cancel = () => {
    setEditing(null);
    setError("");
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  async function saveClient() {
    setError("");
    // simple client-side validation
    const errs: string[] = [];
    if (!form.legalName.trim()) errs.push("Company Legal Name is required");
    if (!INDUSTRIES.includes(form.industry as any)) errs.push("Industry invalid");
    if (!STATUSES.includes(form.status as any)) errs.push("Status invalid");
    if (!TIERS.includes(form.tier as any)) errs.push("Tier invalid");
    if (errs.length) {
      setError(errs.join("; "));
      return;
    }

    const payload = {
      legalName: form.legalName.trim(),
      tradingName: form.tradingName.trim(),
      industry: form.industry,
      status: form.status,
      tier: form.tier,
      tags: form.tagsCSV
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    };

    try {
      if (form.id) {
        await setDoc(doc(db, "clients", form.id), payload, { merge: true });
      } else {
        await addDoc(collection(db, "clients"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }
      setEditing(null);
      setError("");
    } catch (e: any) {
      const message =
        e?.message ||
        e?.details ||
        e?.code ||
        "Failed to save client (Firestore write).";
      setError(String(message));
    }
  }

  async function deleteClient(id: string) {
    if (!confirm("Delete this client?")) return;
    try {
      await deleteDoc(doc(db, "clients", id));
    } catch (e: any) {
      alert(e?.message || "Failed to delete client.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Client Central</h2>
        <Button onClick={startNew}>Add New Client</Button>
      </div>

      {/* list */}
      <div className="space-y-3 mb-8">
        {clients.map((c) => (
          <div
            key={c.id}
            className="bg-gray-700 p-3 rounded-lg flex items-start justify-between"
          >
            <div>
              <div className="font-bold text-lg">{c.tradingName || c.legalName}</div>
              <div className="text-xs text-gray-300">
                {c.industry} • {c.status} • Tier {c.tier}
              </div>
              {c.clientId && (
                <div className="text-[11px] text-gray-400 mt-1">{c.clientId}</div>
              )}
              {c.tags && c.tags.length > 0 && (
                <div className="text-xs text-gray-300 mt-1">
                  Tags: {c.tags.join(", ")}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => startEdit(c)}>Edit</Button>
              <Button onClick={() => deleteClient(c.id!)} className="bg-red-600 hover:bg-red-500">
                Delete
              </Button>
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <div className="text-sm text-gray-400">No clients yet.</div>
        )}
      </div>

      {/* editor */}
      {(editing || form.id === "") && (
        <div className="bg-[#1f1f1f] p-4 rounded">
          <h3 className="text-xl font-bold mb-3">
            {form.id ? "Edit Client" : "Add Client"}
          </h3>

          {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400">Company Legal Name</label>
              <Input name="legalName" value={form.legalName} onChange={onChange} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Trading Name</label>
              <Input name="tradingName" value={form.tradingName} onChange={onChange} />
            </div>
            <div>
              <label className="text-xs text-gray-400">Industry</label>
              <Select name="industry" value={form.industry} onChange={onChange}>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Status</label>
              <Select name="status" value={form.status} onChange={onChange}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Tier</label>
              <Select name="tier" value={form.tier} onChange={onChange}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Tags (CSV)</label>
              <Input
                name="tagsCSV"
                placeholder="vip, netflix, key-account"
                value={form.tagsCSV}
                onChange={onChange}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={saveClient}>Save Client</Button>
            <Button className="bg-gray-500 hover:bg-gray-400" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Shell ---------- */
const App: React.FC = () => {
  const [user, setUser] = React.useState<User | null>(null);
  const [view, setView] = React.useState<"dashboard" | "clients" | "inventory" | "sales" | "scheduling">("clients");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center">Loading…</div>;
  if (!user) return <Login />;

  return (
    <div>
      {/* header */}
      <header className="fixed top-0 left-0 right-0 bg-black z-50 p-4 md:px-8 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <h1 className="text-lg md:text-2xl font-bold logo-neon">Jingjai Productions Master Control</h1>
          <nav className="text-sm">
            <a onClick={() => setView("clients")} className={`mr-4 cursor-pointer ${view==="clients" ? "text-green-400 font-bold" : "text-white"}`}>Client Central</a>
            <a onClick={() => setView("inventory")} className={`mr-4 cursor-pointer ${view==="inventory" ? "text-green-400 font-bold" : "text-white"}`}>Inventory</a>
            <a onClick={() => setView("sales")} className={`mr-4 cursor-pointer ${view==="sales" ? "text-green-400 font-bold" : "text-white"}`}>Sales</a>
            <a onClick={() => setView("scheduling")} className={`cursor-pointer ${view==="scheduling" ? "text-green-400 font-bold" : "text-white"}`}>Scheduling</a>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div className="hidden sm:block">
            <div className="font-semibold">{user.displayName || user.email}</div>
            <div className="text-xs text-gray-400">Signed in</div>
          </div>
          <Button className="bg-gray-500 hover:bg-gray-400" onClick={() => signOut(auth)}>Logout</Button>
        </div>
      </header>

      {/* main */}
      <main className="pt-24 px-4 md:px-8">
        {view === "clients" && <ClientCentral user={user} />}
        {view !== "clients" && (
          <div className="text-sm text-gray-400">
            Placeholder for <span className="font-semibold">{view}</span>. (We’ll wire these next.)
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
