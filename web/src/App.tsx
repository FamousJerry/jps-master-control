import React from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  setPersistence,
  browserLocalPersistence,
  User,
} from "firebase/auth";
import { db, auth } from "./lib/firebase";

/** =========================================================
 *  App (auth gate)
 *  =======================================================*/

type View = "dashboard" | "clients" | "inventory" | "sales" | "schedule";

export default function App() {
  const [view, setView] = React.useState<View>("dashboard");
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);

  React.useEffect(() => {
    setPersistence(auth, browserLocalPersistence)
      .catch(() => {})
      .finally(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setAuthReady(true);
        });
        return () => unsub();
      });
  }, []);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141414] text-neutral-300">
        Loading…
      </div>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <Shell current={view} onNavigate={setView} user={user} onLogout={() => fbSignOut(auth)}>
      {view === "dashboard" && <Dashboard />}
      {view === "clients" && <ClientCentral user={user} />}
      {view === "inventory" && <Inventory user={user} />}
      {view === "sales" && <Sales user={user} />}
      {view === "schedule" && <Scheduling user={user} />}
    </Shell>
  );
}

/** =========================================================
 *  Login
 *  =======================================================*/

function LoginScreen() {
  const [err, setErr] = React.useState("");

  async function signIn() {
    try {
      setErr("");
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed");
    }
  }

  return (
    <div className="min-h-screen bg-[#141414] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <div className="text-2xl font-extrabold mb-1" style={{ color: "#39FF14" }}>
          Jingjai
        </div>
        <div className="text-sm text-neutral-400 mb-6">Master Control</div>
        {err && <div className="mb-3 text-sm text-red-400">{err}</div>}
        <button
          onClick={signIn}
          className="w-full px-4 py-3 rounded-lg font-semibold"
          style={{ background: "#39FF14", color: "#141414" }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

/** =========================================================
 *  Shell layout
 *  =======================================================*/

function Shell({
  current,
  onNavigate,
  children,
  user,
  onLogout,
}: {
  current: View;
  onNavigate: (v: View) => void;
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}) {
  const nav: { key: View; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "clients", label: "Client Central" },
    { key: "inventory", label: "Inventory" },
    { key: "sales", label: "Sales" },
    { key: "schedule", label: "Scheduling" },
  ];

  return (
    <div className="min-h-screen bg-[#141414] text-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-64 flex-col border-r border-neutral-800/80 bg-neutral-950/60">
          <div className="px-5 py-4 border-b border-neutral-800">
            <div className="text-2xl font-extrabold" style={{ color: "#39FF14" }}>
              Jingjai
            </div>
            <div className="text-xs text-neutral-400">Master Control</div>
          </div>
          <nav className="p-3 space-y-1">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={() => onNavigate(n.key)}
                className={
                  "w-full text-left block px-3 py-2 rounded-lg text-sm transition " +
                  (current === n.key
                    ? "bg-[#39FF14] text-black font-semibold"
                    : "hover:bg-neutral-800/60")
                }
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto p-3 text-xs text-neutral-500">© {new Date().getFullYear()} Jingjai</div>
        </aside>

        {/* Main */}
        <main className="flex-1">
          {/* Top bar */}
          <header className="sticky top-0 z-40 backdrop-blur bg-neutral-950/50 border-b border-neutral-800">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="md:hidden text-lg font-bold" style={{ color: "#39FF14" }}>
                Jingjai
              </div>
              <div className="flex items-center gap-3 text-sm text-neutral-300">
                <span className="hidden sm:block">{user.email}</span>
                <button
                  onClick={onLogout}
                  className="px-3 py-1.5 rounded-md border border-neutral-700 hover:bg-neutral-800"
                  title="Sign out"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** =========================================================
 *  Simple pages
 *  =======================================================*/

function Dashboard() {
  return (
    <div className="p-2">
      <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
      <p className="text-neutral-300">Pick a module in the sidebar to get started.</p>
    </div>
  );
}
function Placeholder({ title }: { title: string }) {
  return <div className="p-2 text-neutral-300">{title} (coming soon)</div>;
}

/** =========================================================
 *  Client Central
 *  =======================================================*/

type Contact = { name: string; title?: string; email?: string; phone?: string };
type Client = {
  id?: string;
  clientId?: string;
  legalName?: string;
  tradingName?: string;
  industry?: string;
  taxId?: string;
  contacts?: Contact[];
  createdAt?: any;
  createdBy?: string | null;
  updatedAt?: any;
  updatedBy?: string | null;
};

function ClientCentral({ user }: { user: User }) {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Client | null>(null);
  const [form, setForm] = React.useState<Client>({ contacts: [] });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Client[];
      setClients(data.sort((a, b) => (b.clientId ?? "").localeCompare(a.clientId ?? "")));
    });
    return unsub;
  }, [user]);

  function startAdd() {
    setEditing(null);
    setForm({ contacts: [] });
    setError("");
    setOpen(true);
  }
  function startEdit(c: Client) {
    setEditing(c);
    setForm({ ...c, contacts: c.contacts ?? [] });
    setError("");
    setOpen(true);
  }
  function change<K extends keyof Client>(k: K, v: Client[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function addContact() {
    setForm((f) => ({
      ...f,
      contacts: [...(f.contacts || []), { name: "", title: "", email: "", phone: "" }],
    }));
  }

  async function save() {
    try {
      setError("");
      if (!form.tradingName?.trim() && !form.legalName?.trim()) {
        setError("Enter at least a Trading Name or Legal Name.");
        return;
      }

      const payload: Omit<Client, "id"> = {
        legalName: form.legalName?.trim() || "",
        tradingName: form.tradingName?.trim() || "",
        industry: form.industry || "",
        taxId: form.taxId || "",
        contacts: (form.contacts || []).map((c) => ({ ...c, name: c.name?.trim() || "" })),
      };

      const meta = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null };

      if (editing?.id) {
        await updateDoc(doc(db, "clients", editing.id), { ...payload, ...meta } as any);
      } else {
        const counterRef = doc(db, "counters", "client");
        const newId = await runTransaction(db, async (tx) => {
          const snap = await tx.get(counterRef);
          const current = snap.exists() ? (snap.data() as any).current_value ?? 100000 : 100000;
          const next = current + 1;
          tx.set(counterRef, { current_value: next }, { merge: true });
          return next;
        });

        await addDoc(collection(db, "clients"), {
          ...payload,
          clientId: `CL-${newId}`,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || null,
          ...meta,
        } as any);
      }

      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save client (check rules & auth).");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Client Central</h2>
        <button
          onClick={startAdd}
          className="px-4 py-2 rounded-lg font-semibold"
          style={{ background: "#39FF14", color: "#141414" }}
        >
          + Add Client
        </button>
      </div>

      <div className="mt-6 grid gap-3">
        {clients.map((c) => (
          <div
            key={c.id}
            onClick={() => startEdit(c)}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 transition cursor-pointer p-4"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-lg font-semibold">{c.tradingName || c.legalName || "Unnamed"}</div>
                <div className="text-xs text-neutral-400">{c.industry}</div>
              </div>
              <div className="text-xs text-neutral-500">{c.clientId ?? "N/A"}</div>
            </div>
          </div>
        ))}
        {clients.length === 0 && <EmptyCard text="+ Add Client to create your first record." />}
      </div>

      {/* Modal */}
      {open && (
        <Modal title={editing ? "Edit Client" : "Add Client"} onClose={() => setOpen(false)}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {error && <ErrorText text={error} />}
            <div className="grid md:grid-cols-2 gap-4">
              <L label="Company Legal Name">
                <I value={form.legalName || ""} onChange={(e) => change("legalName", e.target.value)} />
              </L>
              <L label="Trading Name">
                <I value={form.tradingName || ""} onChange={(e) => change("tradingName", e.target.value)} />
              </L>
              <L label="Industry">
                <select
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  value={form.industry || ""}
                  onChange={(e) => change("industry", e.target.value)}
                >
                  <option value="">—</option>
                  <option>TV</option>
                  <option>Film</option>
                  <option>Events</option>
                  <option>Corporate</option>
                </select>
              </L>
              <L label="Tax / VAT ID">
                <I value={form.taxId || ""} onChange={(e) => change("taxId", e.target.value)} />
              </L>
            </div>

            <div className="border-t border-neutral-800 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Key Contacts</div>
                <button className="text-sm text-[#39FF14]" onClick={addContact}>
                  + Add Contact
                </button>
              </div>
              {(form.contacts || []).map((ct, idx) => (
                <div key={idx} className="grid md:grid-cols-4 gap-3 mb-3">
                  <I
                    placeholder="Name"
                    value={ct.name || ""}
                    onChange={(e) => {
                      const list = [...(form.contacts || [])];
                      list[idx] = { ...list[idx], name: e.target.value };
                      change("contacts", list);
                    }}
                  />
                  <I
                    placeholder="Title"
                    value={ct.title || ""}
                    onChange={(e) => {
                      const list = [...(form.contacts || [])];
                      list[idx] = { ...list[idx], title: e.target.value };
                      change("contacts", list);
                    }}
                  />
                  <I
                    placeholder="Email"
                    type="email"
                    value={ct.email || ""}
                    onChange={(e) => {
                      const list = [...(form.contacts || [])];
                      list[idx] = { ...list[idx], email: e.target.value };
                      change("contacts", list);
                    }}
                  />
                  <I
                    placeholder="Phone"
                    value={ct.phone || ""}
                    onChange={(e) => {
                      const list = [...(form.contacts || [])];
                      list[idx] = { ...list[idx], phone: e.target.value };
                      change("contacts", list);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
            <Button ghost onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button primary onClick={save}>
              Save Client
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** =========================================================
 *  Inventory
 *  =======================================================*/

type Item = {
  id?: string;
  sku: string;
  name: string;
  tags?: string[];
  quantity: number;
  archived?: boolean;
  createdAt?: any;
  createdBy?: string | null;
  updatedAt?: any;
  updatedBy?: string | null;
};

function Inventory({ user }: { user: User }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [form, setForm] = React.useState<Item>({ sku: "", name: "", quantity: 0, tags: [] });
  const [delta, setDelta] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "inventoryItems"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Item[];
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setItems(data);
    });
    return unsub;
  }, [user]);

  function startAdd() {
    setEditing(null);
    setForm({ sku: "", name: "", quantity: 0, tags: [] });
    setError("");
    setOpen(true);
  }
  function startEdit(it: Item) {
    setEditing(it);
    setForm({ ...it, tags: it.tags ?? [] });
    setError("");
    setOpen(true);
  }
  function change<K extends keyof Item>(k: K, v: Item[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setError("");
    const payload: Omit<Item, "id"> = {
      sku: (form.sku || "").trim(),
      name: (form.name || "").trim(),
      tags: form.tags ?? [],
      quantity: Number.isFinite(form.quantity) ? Number(form.quantity) : 0,
      archived: !!form.archived,
    };
    if (!payload.name) {
      setError("Name is required.");
      return;
    }

    const meta = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null };

    try {
      if (editing?.id) {
        await updateDoc(doc(db, "inventoryItems", editing.id), { ...payload, ...meta } as any);
      } else {
        await addDoc(collection(db, "inventoryItems"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || null,
          ...meta,
        } as any);
      }
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save item (check rules & auth).");
    }
  }

  async function applyDelta(itemId: string, reason: string) {
    try {
      const amt = Number(delta[itemId] || 0);
      if (!amt || !Number.isFinite(amt)) return;
      const itemRef = doc(db, "inventoryItems", itemId);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(itemRef);
        if (!snap.exists()) return;
        const cur = Number((snap.data() as any).quantity || 0);
        const next = cur + amt;
        tx.update(itemRef, { quantity: next, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null });
      });

      await addDoc(collection(db, "inventoryEvents"), {
        itemId,
        delta: amt,
        reason,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || null,
      });

      setDelta((d) => ({ ...d, [itemId]: 0 }));
    } catch (e: any) {
      alert(e?.message || "Adjustment failed (check rules & auth).");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Inventory</h2>
        <button
          onClick={startAdd}
          className="px-4 py-2 rounded-lg font-semibold"
          style={{ background: "#39FF14", color: "#141414" }}
        >
          + Add Item
        </button>
      </div>

      <div className="mt-6 grid gap-3">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[220px]">
                <div className="font-semibold">{it.name}</div>
                <div className="text-xs text-neutral-400">{it.sku || "—"}</div>
              </div>
              <div className="text-sm">
                <span className="text-neutral-400">Qty:</span>{" "}
                <span className="font-mono">{it.quantity ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="w-24 rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  placeholder="+/-"
                  value={delta[it.id!] ?? 0}
                  onChange={(e) => setDelta((d) => ({ ...d, [it.id!]: Number(e.target.value) }))}
                />
                <button
                  className="px-3 py-2 rounded-md border border-neutral-700 hover:bg-neutral-800"
                  onClick={() => applyDelta(it.id!, "adjustment")}
                >
                  Apply
                </button>
                <button
                  className="px-3 py-2 rounded-md border border-neutral-700 hover:bg-neutral-800"
                  onClick={() => startEdit(it)}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <EmptyCard text="+ Add Item to create your first item." />}
      </div>

      {open && (
        <Modal title={editing ? "Edit Item" : "Add Item"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {error && <ErrorText text={error} />}
            <div className="grid md:grid-cols-2 gap-4">
              <L label="Name">
                <I value={form.name || ""} onChange={(e) => change("name", e.target.value)} />
              </L>
              <L label="SKU">
                <I value={form.sku || ""} onChange={(e) => change("sku", e.target.value)} />
              </L>
              <L label="Quantity">
                <I
                  type="number"
                  value={String(form.quantity ?? 0)}
                  onChange={(e) => change("quantity", Number(e.target.value))}
                />
              </L>
              <L label="Tags (comma separated)">
                <I
                  value={(form.tags || []).join(", ")}
                  onChange={(e) =>
                    change(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }
                />
              </L>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.archived}
                onChange={(e) => change("archived", e.target.checked)}
              />
              Archived
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
            <Button ghost onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button primary onClick={save}>
              Save Item
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** =========================================================
 *  Sales (Deals)
 *  =======================================================*/

type Deal = {
  id?: string;
  title: string;
  clientId?: string;
  stage: "Lead" | "Quote" | "Awarded" | "Lost";
  amount: number;
  createdAt?: any;
  createdBy?: string | null;
  updatedAt?: any;
  updatedBy?: string | null;
};

function Sales({ user }: { user: User }) {
  const [deals, setDeals] = React.useState<Deal[]>([]);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Deal | null>(null);
  const [form, setForm] = React.useState<Deal>({ title: "", clientId: "", stage: "Lead", amount: 0 });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    const unsubDeals = onSnapshot(collection(db, "deals"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Deal[];
      data.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setDeals(data);
    });
    const unsubClients = onSnapshot(collection(db, "clients"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Client[];
      data.sort((a, b) => (a.tradingName || a.legalName || "").localeCompare(b.tradingName || b.legalName || ""));
      setClients(data);
    });
    return () => {
      unsubDeals();
      unsubClients();
    };
  }, [user]);

  function startAdd() {
    setEditing(null);
    setForm({ title: "", clientId: "", stage: "Lead", amount: 0 });
    setError("");
    setOpen(true);
  }
  function startEdit(d: Deal) {
    setEditing(d);
    setForm({ ...d });
    setError("");
    setOpen(true);
  }
  function change<K extends keyof Deal>(k: K, v: Deal[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setError("");
    const payload: Omit<Deal, "id"> = {
      title: (form.title || "").trim(),
      clientId: form.clientId || "",
      stage: form.stage || "Lead",
      amount: Number.isFinite(form.amount) ? Number(form.amount) : 0,
    };
    if (!payload.title) {
      setError("Title is required.");
      return;
    }

    const meta = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null };

    try {
      if (editing?.id) {
        await updateDoc(doc(db, "deals", editing.id), { ...payload, ...meta } as any);
      } else {
        await addDoc(collection(db, "deals"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || null,
          ...meta,
        } as any);
      }
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save deal (check rules & auth).");
    }
  }

  const stages: Deal["stage"][] = ["Lead", "Quote", "Awarded", "Lost"];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sales</h2>
        <button
          onClick={startAdd}
          className="px-4 py-2 rounded-lg font-semibold"
          style={{ background: "#39FF14", color: "#141414" }}
        >
          + Add Deal
        </button>
      </div>

      <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stages.map((stage) => (
          <div key={stage} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
            <div className="font-semibold mb-2">{stage}</div>
            <div className="space-y-2">
              {deals
                .filter((d) => d.stage === stage)
                .map((d) => (
                  <div
                    key={d.id}
                    className="rounded-md border border-neutral-800 p-3 hover:bg-neutral-900 cursor-pointer"
                    onClick={() => startEdit(d)}
                  >
                    <div className="text-sm font-semibold">{d.title}</div>
                    <div className="text-xs text-neutral-400">
                      {clients.find((c) => c.id === d.clientId)?.tradingName ||
                        clients.find((c) => c.id === d.clientId)?.legalName ||
                        "—"}
                    </div>
                    <div className="text-xs mt-1">
                      ฿{Number(d.amount || 0).toLocaleString()}
                    </div>
                  </div>
                ))}
              {deals.filter((d) => d.stage === stage).length === 0 && (
                <div className="text-xs text-neutral-500">No deals</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Modal title={editing ? "Edit Deal" : "Add Deal"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {error && <ErrorText text={error} />}
            <div className="grid md:grid-cols-2 gap-4">
              <L label="Title">
                <I value={form.title || ""} onChange={(e) => change("title", e.target.value)} />
              </L>
              <L label="Client">
                <select
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  value={form.clientId || ""}
                  onChange={(e) => change("clientId", e.target.value)}
                >
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.tradingName || c.legalName}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Stage">
                <select
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  value={form.stage}
                  onChange={(e) => change("stage", e.target.value as Deal["stage"])}
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Amount (THB)">
                <I
                  type="number"
                  value={String(form.amount ?? 0)}
                  onChange={(e) => change("amount", Number(e.target.value))}
                />
              </L>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
            <Button ghost onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button primary onClick={save}>
              Save Deal
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** =========================================================
 *  Scheduling (Resources + Bookings)
 *  =======================================================*/

type Resource = {
  id?: string;
  name: string;
  type?: string; // "Person" | "Equipment" | etc.
  archived?: boolean;
  createdAt?: any;
  createdBy?: string | null;
  updatedAt?: any;
  updatedBy?: string | null;
};
type Booking = {
  id?: string;
  title: string;
  resourceId: string;
  start: string; // ISO-like from <input type="datetime-local">
  end: string;
  notes?: string;
  createdAt?: any;
  createdBy?: string | null;
  updatedAt?: any;
  updatedBy?: string | null;
};

function Scheduling({ user }: { user: User }) {
  const [tab, setTab] = React.useState<"resources" | "bookings">("resources");

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Scheduling</h2>
      </div>

      <div className="mt-4 border-b border-neutral-800 flex gap-2">
        <TabButton active={tab === "resources"} onClick={() => setTab("resources")}>
          Resources
        </TabButton>
        <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
          Bookings
        </TabButton>
      </div>

      <div className="mt-4">
        {tab === "resources" ? <Resources user={user} /> : <Bookings user={user} />}
      </div>
    </div>
  );
}

function Resources({ user }: { user: User }) {
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Resource | null>(null);
  const [form, setForm] = React.useState<Resource>({ name: "", type: "", archived: false });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, "resources"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Resource[];
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setResources(data);
    });
    return unsub;
  }, [user]);

  function startAdd() {
    setEditing(null);
    setForm({ name: "", type: "", archived: false });
    setError("");
    setOpen(true);
  }
  function startEdit(r: Resource) {
    setEditing(r);
    setForm({ ...r });
    setError("");
    setOpen(true);
  }
  function change<K extends keyof Resource>(k: K, v: Resource[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setError("");
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    const payload: Omit<Resource, "id"> = {
      name: form.name.trim(),
      type: form.type || "",
      archived: !!form.archived,
    };
    const meta = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null };

    try {
      if (editing?.id) {
        await updateDoc(doc(db, "resources", editing.id), { ...payload, ...meta } as any);
      } else {
        await addDoc(collection(db, "resources"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || null,
          ...meta,
        } as any);
      }
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save resource (check rules & auth).");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Resources</div>
        <button
          onClick={startAdd}
          className="px-4 py-2 rounded-lg font-semibold"
          style={{ background: "#39FF14", color: "#141414" }}
        >
          + Add Resource
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {resources.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 cursor-pointer hover:bg-neutral-900"
            onClick={() => startEdit(r)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-neutral-400">{r.type || "—"}</div>
              </div>
              {r.archived && <span className="text-xs text-neutral-500">Archived</span>}
            </div>
          </div>
        ))}
        {resources.length === 0 && <EmptyCard text="+ Add Resource to begin scheduling." />}
      </div>

      {open && (
        <Modal title={editing ? "Edit Resource" : "Add Resource"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {error && <ErrorText text={error} />}
            <div className="grid md:grid-cols-2 gap-4">
              <L label="Name">
                <I value={form.name || ""} onChange={(e) => change("name", e.target.value)} />
              </L>
              <L label="Type">
                <I value={form.type || ""} onChange={(e) => change("type", e.target.value)} />
              </L>
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.archived}
                onChange={(e) => change("archived", e.target.checked)}
              />
              Archived
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
            <Button ghost onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button primary onClick={save}>
              Save Resource
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Bookings({ user }: { user: User }) {
  const [resources, setResources] = React.useState<Resource[]>([]);
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Booking | null>(null);
  const [form, setForm] = React.useState<Booking>({
    title: "",
    resourceId: "",
    start: "",
    end: "",
    notes: "",
  });
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    const unsubR = onSnapshot(collection(db, "resources"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Resource[];
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setResources(data);
    });
    const unsubB = onSnapshot(
      query(collection(db, "bookings"), orderBy("start", "desc"), limit(100)),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Booking[];
        setBookings(data);
      }
    );
    return () => {
      unsubR();
      unsubB();
    };
  }, [user]);

  function startAdd() {
    setEditing(null);
    setForm({ title: "", resourceId: "", start: "", end: "", notes: "" });
    setError("");
    setOpen(true);
  }
  function startEdit(b: Booking) {
    setEditing(b);
    setForm({ ...b });
    setError("");
    setOpen(true);
  }
  function change<K extends keyof Booking>(k: K, v: Booking[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart < bEnd && aEnd > bStart; // basic overlap
  }

  async function save() {
    setError("");
    const payload: Omit<Booking, "id"> = {
      title: (form.title || "").trim(),
      resourceId: form.resourceId || "",
      start: form.start || "",
      end: form.end || "",
      notes: form.notes || "",
    };
    if (!payload.title || !payload.resourceId || !payload.start || !payload.end) {
      setError("Title, Resource, Start, and End are required.");
      return;
    }
    if (payload.end <= payload.start) {
      setError("End must be after Start.");
      return;
    }

    // Client-side conflict check for same resource
    const existing = bookings.filter((b) => b.resourceId === payload.resourceId && b.id !== editing?.id);
    const hasConflict = existing.some((b) => overlaps(payload.start, payload.end, b.start, b.end));
    if (hasConflict) {
      setError("Time conflict with another booking for this resource.");
      return;
    }

    const meta = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null };

    try {
      if (editing?.id) {
        await updateDoc(doc(db, "bookings", editing.id), { ...payload, ...meta } as any);
      } else {
        await addDoc(collection(db, "bookings"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.email || null,
          ...meta,
        } as any);
      }
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save booking (check rules & auth).");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">Bookings</div>
        <button
          onClick={startAdd}
          className="px-4 py-2 rounded-lg font-semibold"
          style={{ background: "#39FF14", color: "#141414" }}
        >
          + Add Booking
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {bookings.map((b) => {
          const r = resources.find((x) => x.id === b.resourceId);
          return (
            <div
              key={b.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 hover:bg-neutral-900 cursor-pointer"
              onClick={() => startEdit(b)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{b.title}</div>
                  <div className="text-xs text-neutral-400">
                    {r?.name || "—"} • {b.start} → {b.end}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {bookings.length === 0 && <EmptyCard text="+ Add Booking to schedule a resource." />}
      </div>

      {open && (
        <Modal title={editing ? "Edit Booking" : "Add Booking"} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {error && <ErrorText text={error} />}
            <div className="grid md:grid-cols-2 gap-4">
              <L label="Title">
                <I value={form.title || ""} onChange={(e) => change("title", e.target.value)} />
              </L>
              <L label="Resource">
                <select
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  value={form.resourceId || ""}
                  onChange={(e) => change("resourceId", e.target.value)}
                >
                  <option value="">—</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.type ? `(${r.type})` : ""}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Start">
                <input
                  type="datetime-local"
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  value={form.start || ""}
                  onChange={(e) => change("start", e.target.value)}
                />
              </L>
              <L label="End">
                <input
                  type="datetime-local"
                  className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none"
                  value={form.end || ""}
                  onChange={(e) => change("end", e.target.value)}
                />
              </L>
            </div>
            <L label="Notes">
              <I value={form.notes || ""} onChange={(e) => change("notes", e.target.value)} />
            </L>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
            <Button ghost onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button primary onClick={save}>
              Save Booking
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-2 rounded-t-md text-sm " +
        (active ? "bg-[#39FF14] text-black font-semibold" : "bg-neutral-800 hover:bg-neutral-700")
      }
    >
      {children}
    </button>
  );
}

/** =========================================================
 *  UI helpers
 *  =======================================================*/

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-neutral-300">{label}</div>
      {children}
    </label>
  );
}
function I(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 outline-none " +
        (props.className ?? "")
      }
    />
  );
}
function Button({
  children,
  primary,
  ghost,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; ghost?: boolean }) {
  const cls = primary
    ? "px-4 py-2 rounded-md font-semibold"
    : ghost
    ? "px-4 py-2 rounded-md border border-neutral-700"
    : "px-4 py-2 rounded-md";
  const style = primary ? { background: "#39FF14", color: "#141414" } : undefined;
  return (
    <button {...rest} className={cls} style={style}>
      {children}
    </button>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-3">
        <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
            <div className="text-lg font-bold">{title}</div>
            <button className="text-neutral-400 hover:text-white" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
function ErrorText({ text }: { text: string }) {
  return <div className="text-red-400 text-sm">{text}</div>;
}
function EmptyCard({ text }: { text: string }) {
  return (
    <div className="text-neutral-400 text-sm border border-dashed border-neutral-800 rounded-lg p-8">
      No records yet. {text}
    </div>
  );
}
