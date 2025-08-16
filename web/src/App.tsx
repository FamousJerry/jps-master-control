import React from "react";
import { collection, onSnapshot, addDoc, updateDoc, doc, runTransaction } from "firebase/firestore";
import { db } from "./lib/firebase";

/** ---------- App Shell with simple view switcher (no extra deps) ---------- */

type View = "dashboard" | "clients" | "inventory" | "sales" | "schedule";

export default function App() {
  const [view, setView] = React.useState<View>("dashboard");

  return (
    <Shell current={view} onNavigate={setView}>
      {view === "dashboard" && <Dashboard />}
      {view === "clients" && <ClientCentral />}
      {view === "inventory" && <Placeholder title="Inventory" />}
      {view === "sales" && <Placeholder title="Sales" />}
      {view === "schedule" && <Placeholder title="Scheduling" />}
    </Shell>
  );
}

/** ---------- Layout ---------- */

function Shell({
  current,
  onNavigate,
  children,
}: {
  current: View;
  onNavigate: (v: View) => void;
  children: React.ReactNode;
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
                  (current === n.key ? "bg-[#39FF14] text-black font-semibold" : "hover:bg-neutral-800/60")
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
          <header className="sticky top-0 z-40 backdrop-blur bg-neutral-950/50 border-b border-neutral-800 md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-lg font-bold" style={{ color: "#39FF14" }}>
                Jingjai
              </div>
              <div className="text-sm text-neutral-400">Signed in with Google</div>
            </div>
          </header>

          {/* Content */}
          <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** ---------- Simple pages ---------- */

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

/** ---------- Client Central (list + add/edit + counter) ---------- */

type Contact = { name: string; title?: string; email?: string; phone?: string };
type Client = {
  id?: string;
  clientId?: string;
  legalName?: string;
  tradingName?: string;
  industry?: string;
  taxId?: string;
  contacts?: Contact[];
};

function ClientCentral() {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Client | null>(null);
  const [form, setForm] = React.useState<Client>({ contacts: [] });

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Client[];
      setClients(data.sort((a, b) => (b.clientId ?? "").localeCompare(a.clientId ?? "")));
    });
    return unsub;
  }, []);

  function startAdd() {
    setEditing(null);
    setForm({ contacts: [] });
    setOpen(true);
  }

  function startEdit(c: Client) {
    setEditing(c);
    setForm({ ...c, contacts: c.contacts ?? [] });
    setOpen(true);
  }

  function change<K extends keyof Client>(k: K, v: Client[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    const payload: Client = {
      legalName: form.legalName?.trim() || "",
      tradingName: form.tradingName?.trim() || "",
      industry: form.industry || "",
      taxId: form.taxId || "",
      contacts: (form.contacts || []).map((c) => ({ ...c, name: c.name?.trim() || "" })),
    };

    if (editing?.id) {
      await updateDoc(doc(db, "clients", editing.id), payload as any);
    } else {
      // allocate numeric counter and write clientId CL-<number>
      const counterRef = doc(db, "counters", "client");
      const newId = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists() ? (snap.data() as any).current_value ?? 100000 : 100000;
        const next = current + 1;
        tx.set(counterRef, { current_value: next }, { merge: true });
        return next;
      });
      await addDoc(collection(db, "clients"), { ...payload, clientId: `CL-${newId}` });
    }
    setOpen(false);
  }

  function addContact() {
