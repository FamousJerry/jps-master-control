import React from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, doc, runTransaction, serverTimestamp
} from "firebase/firestore";
import { db } from "./lib/firebase";

/** ---------- App Shell with simple view switcher (no extra deps) ---------- */

type View = "dashboard" | "clients" | "inventory" | "sales" | "schedule";

export default function App() {
  const [view, setView] = React.useState<View>("dashboard");

  return (
    <Shell current={view} onNavigate={setView}>
      {view === "dashboard" && <Dashboard />}
      {view === "clients" && <ClientCentral />}
      {view === "inventory" && <Inventory />}
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
  const [error, setError] = React.useState<string>("");

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

  async function save() {
    setError("");
    // Minimal validation for v1
    if (!form.tradingName?.trim() && !form.legalName?.trim()) {
      setError("Enter at least a Trading Name or Legal Name.");
      return;
    }

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
    setForm((f) => ({ ...f, contacts: [...(f.contacts || []), { name: "", title: "", email: "", phone: "" }] }));
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
        {clients.length === 0 && (
          <div className="text-neutral-400 text-sm border border-dashed border-neutral-800 rounded-lg p-8">
            No clients yet. Click <span className="font-semibold">+ Add Client</span> to create your first record.
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="w-full max-w-3xl rounded-xl border border-neutral-800 bg-neutral-950">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                <div className="text-lg font-bold">{editing ? "Edit Client" : "Add Client"}</div>
                <button className="text-neutral-400 hover:text-white" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
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
              <div className="flex justify-end gap-3 px-5 py-4 border-t border-neutral-800">
                <button className="px-4 py-2 rounded-md border border-neutral-700" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  onClick={save}
                  className="px-4 py-2 rounded-md font-semibold"
                  style={{ background: "#39FF14", color: "#141414" }}
                >
                  Save Client
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- Inventory (items + quantity movements) ---------- */

type Item = {
  id?: string;
  sku: string;
  name: string;
  tags?: string[];
  quantity: number;
  archived?: boolean;
};

function Inventory() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [form, setForm] = React.useState<Item>({ sku: "", name: "", quantity: 0, tags: [] });
  const [delta, setDelta] = React.useState<Record<string, number>>({}); // per-item adjust amount

  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventoryItems"), (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Item[];
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setItems(data);
    });
    return unsub;
  }, []);

  function startAdd() {
    setEditing(null);
    setForm({ sku: "", name: "", quantity: 0, tags: [] });
    setOpen(true);
  }

  function startEdit(it: Item) {
    setEditing(it);
    setForm({ ...it, tags: it.tags ?? [] });
    setOpen(true);
  }

  function change<K extends keyof Item>(k: K, v: Item[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    const payload: Item = {
      sku: (form.sku || "").trim(),
      name: (form.name || "").trim(),
      tags: form.tags ?? [],
      quantity: Number.isFinite(form.quantity) ? Number(form.quantity) : 0,
      archived: !!form.archived,
    };
    if (!payload.name) return; // minimal guard

    if (editing?.id) {
      await updateDoc(doc(db, "inventoryItems", editing.id), payload as any);
    } else {
      await addDoc(collection(db, "inventoryItems"), payload as any);
    }
    setOpen(false);
  }

  async function applyDelta(itemId: string, reason: string) {
    const amt = Number(delta[itemId] || 0);
    if (!amt || !Number.isFinite(amt)) return;
    const itemRef = doc(db, "inventoryItems", itemId);

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(itemRef);
      if (!snap.exists()) return;
      const cur = Number((snap.data() as any).quantity || 0);
      const next = cur + amt;
      tx.update(itemRef, { quantity: next });
    });

    await addDoc(collection(db, "inventoryEvents"), {
      itemId,
      delta: amt,
      reason,
      createdAt: serverTimestamp(),
    });

    setDelta((d) => ({ ...d, [itemId]: 0 }));
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
          <div
            key={it.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4"
          >
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
        {items.length === 0 && (
          <div className="text-neutral-400 text-sm border border-dashed border-neutral-800 rounded-lg p-8">
            No items yet. Click <span className="font-semibold">+ Add Item</span> to create your first item.
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
                <div className="text-lg font-bold">{editing ? "Edit Item" : "Add Item"}</div>
                <button className="text-neutral-400 hover:text-white" onClick={() => setOpen(false)}>✕</button>
              </div>
              <div className="p-5 space-y-4">
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
              <div className="flex justify-end gap-3 px-5 py-4 border-t border-neutral-800">
                <button className="px-4 py-2 rounded-md border border-neutral-700" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  onClick={save}
                  className="px-4 py-2 rounded-md font-semibold"
                  style={{ background: "#39FF14", color: "#141414" }}
                >
                  Save Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- Tiny UI helpers ---------- */

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
