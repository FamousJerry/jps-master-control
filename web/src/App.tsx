import React from "react";
import "./index.css";

import { auth, db, signInGoogle, doSignOut } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  DocumentData,
} from "firebase/firestore";

/* ---------- small UI helpers ---------- */
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-black font-semibold ${
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
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="bg-[#1f1f1f] rounded p-4 mb-8">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xl font-bold">{title}</h3>
    </div>
    {children}
  </div>
);

/* ---------- Types ---------- */
type Client = {
  id?: string;
  legalName: string;
  tradingName: string;
  industry: "TV" | "Film" | "Music Video" | "Commercial" | "Other";
  status: "Prospect" | "Active" | "Inactive";
  tier: "A" | "B" | "C";
  tags?: string;
  createdAt?: any;
  updatedAt?: any;
};

type InventoryItem = {
  id?: string;
  name: string;
  category: string;
  status: "Available" | "Out" | "Repair";
  ratePerDay?: number;
  createdAt?: any;
  updatedAt?: any;
};

type Sale = {
  id?: string;
  clientName: string;
  amount: number;
  status: "Draft" | "Sent" | "Paid" | "Void";
  createdAt?: any;
  updatedAt?: any;
};

type Booking = {
  id?: string;
  title: string;
  clientName: string;
  date: string; // ISO yyyy-mm-dd
  createdAt?: any;
  updatedAt?: any;
};

/* ---------- Login ---------- */
const Login: React.FC = () => {
  const [err, setErr] = React.useState<string>("");
  const doLogin = async () => {
    setErr("");
    try {
      await signInGoogle();
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-black/70 p-8 rounded w-full max-w-sm">
        <h1 className="logo-neon text-3xl font-bold text-center mb-4">Jingjai</h1>
        {err && <div className="text-red-400 text-sm mb-2">{err}</div>}
        <Button onClick={doLogin} className="w-full">
          Sign in with Google
        </Button>
      </div>
    </div>
  );
};

/* ---------- Clients module (Firestore direct) ---------- */
function Clients() {
  const [items, setItems] = React.useState<Client[]>([]);
  const [editing, setEditing] = React.useState<Client>({
    legalName: "",
    tradingName: "",
    industry: "TV",
    status: "Prospect",
    tier: "B",
    tags: "",
  });
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("legalName"));
    return onSnapshot(q, (snap) => {
      const rows: Client[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
    });
  }, []);

  const resetForm = () =>
    setEditing({
      legalName: "",
      tradingName: "",
      industry: "TV",
      status: "Prospect",
      tier: "B",
      tags: "",
    });

  async function save() {
    setError("");
    try {
      const payload: Client = {
        legalName: editing.legalName.trim(),
        tradingName: editing.tradingName.trim(),
        industry: editing.industry,
        status: editing.status,
        tier: editing.tier,
        tags: editing.tags?.trim() || "",
        updatedAt: serverTimestamp(),
      };

      if (!payload.legalName) throw new Error("Company Legal Name is required.");

      if (editing.id) {
        await updateDoc(doc(db, "clients", editing.id), payload as any);
      } else {
        await addDoc(collection(db, "clients"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e: any) {
      const msg =
        e?.message ||
        e?.details ||
        e?.code ||
        "Failed to save client. (Firestore write)";
      setError(String(msg));
      console.error("save client error:", e);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      await deleteDoc(doc(db, "clients", id));
      if (editing.id === id) resetForm();
    } catch (e: any) {
      const msg =
        e?.message || e?.details || e?.code || "Delete failed (Firestore)";
      setError(String(msg));
      console.error("delete client error:", e);
    }
  }

  return (
    <Section title="Client Central">
      {error && <div className="text-red-400 mb-3 text-sm">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-400">Company Legal Name</label>
          <Input
            value={editing.legalName}
            onChange={(e) => setEditing({ ...editing, legalName: e.target.value })}
            placeholder="Netflix"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Trading Name</label>
          <Input
            value={editing.tradingName}
            onChange={(e) => setEditing({ ...editing, tradingName: e.target.value })}
            placeholder="NFLX"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Industry</label>
          <Select
            value={editing.industry}
            onChange={(e) =>
              setEditing({ ...editing, industry: e.target.value as Client["industry"] })
            }
          >
            {["TV", "Film", "Music Video", "Commercial", "Other"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Status</label>
          <Select
            value={editing.status}
            onChange={(e) =>
              setEditing({ ...editing, status: e.target.value as Client["status"] })
            }
          >
            {["Prospect", "Active", "Inactive"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Tier</label>
          <Select
            value={editing.tier}
            onChange={(e) =>
              setEditing({ ...editing, tier: e.target.value as Client["tier"] })
            }
          >
            {["A", "B", "C"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Tags (comma separated)</label>
          <Input
            value={editing.tags}
            onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
            placeholder="Studio, Preferred"
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button onClick={save}>Save Client</Button>
        <Button
          className="bg-gray-700 hover:bg-gray-600 text-white"
          onClick={resetForm}
        >
          Cancel
        </Button>
      </div>

      <div className="mt-6 text-sm text-gray-400">
        {items.length === 0 ? "No clients yet." : `${items.length} client(s)`}
      </div>

      <ul className="mt-3 divide-y divide-gray-800">
        {items.map((c) => (
          <li key={c.id} className="py-2 flex items-center justify-between">
            <div>
              <div className="font-semibold">{c.legalName}</div>
              <div className="text-xs text-gray-400">
                {c.tradingName} • {c.industry} • {c.status} • Tier {c.tier}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-amber-500 hover:bg-amber-400"
                onClick={() => setEditing(c)}
              >
                Edit
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-500"
                onClick={() => c.id && del(c.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Inventory (Firestore direct) ---------- */
function Inventory() {
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [editing, setEditing] = React.useState<InventoryItem>({
    name: "",
    category: "",
    status: "Available",
    ratePerDay: 0,
  });
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("name"));
    return onSnapshot(q, (snap) => {
      const rows: InventoryItem[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setItems(rows);
    });
  }, []);

  const resetForm = () =>
    setEditing({ name: "", category: "", status: "Available", ratePerDay: 0 });

  async function save() {
    setError("");
    try {
      const payload: InventoryItem = {
        name: editing.name.trim(),
        category: editing.category.trim(),
        status: editing.status,
        ratePerDay: Number(editing.ratePerDay || 0),
        updatedAt: serverTimestamp(),
      };
      if (!payload.name) throw new Error("Item Name is required.");

      if (editing.id) {
        await updateDoc(doc(db, "inventory", editing.id), payload as any);
      } else {
        await addDoc(collection(db, "inventory"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (e: any) {
      setError(
        e?.message || e?.details || e?.code || "Failed to save inventory item."
      );
      console.error("save inventory error:", e);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      await deleteDoc(doc(db, "inventory", id));
      if (editing.id === id) resetForm();
    } catch (e: any) {
      setError(e?.message || "Delete failed (inventory).");
      console.error("delete inventory error:", e);
    }
  }

  return (
    <Section title="Inventory">
      {error && <div className="text-red-400 mb-3 text-sm">{error}</div>}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="text-xs text-gray-400">Name</label>
          <Input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Category</label>
          <Input
            value={editing.category}
            onChange={(e) => setEditing({ ...editing, category: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Status</label>
          <Select
            value={editing.status}
            onChange={(e) =>
              setEditing({
                ...editing,
                status: e.target.value as InventoryItem["status"],
              })
            }
          >
            {["Available", "Out", "Repair"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-xs text-gray-400">Rate / day</label>
          <Input
            type="number"
            step="0.01"
            value={editing.ratePerDay ?? 0}
            onChange={(e) =>
              setEditing({ ...editing, ratePerDay: Number(e.target.value) })
            }
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={save}>Save Item</Button>
        <Button
          className="bg-gray-700 hover:bg-gray-600 text-white"
          onClick={() =>
            setEditing({ name: "", category: "", status: "Available", ratePerDay: 0 })
          }
        >
          Cancel
        </Button>
      </div>

      <ul className="mt-4 divide-y divide-gray-800">
        {items.map((it) => (
          <li key={it.id} className="py-2 flex items-center justify-between">
            <div>
              <div className="font-semibold">{it.name}</div>
              <div className="text-xs text-gray-400">
                {it.category} • {it.status} • ${it.ratePerDay?.toFixed(2)}/day
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-amber-500 hover:bg-amber-400"
                onClick={() => setEditing(it)}
              >
                Edit
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-500"
                onClick={() => it.id && del(it.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Sales (Firestore direct) ---------- */
function Sales() {
  const [rows, setRows] = React.useState<Sale[]>([]);
  const [editing, setEditing] = React.useState<Sale>({
    clientName: "",
    amount: 0,
    status: "Draft",
  });
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    const q = query(collection(db, "sales"), orderBy("createdAt"));
    return onSnapshot(q, (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, []);

  const reset = () => setEditing({ clientName: "", amount: 0, status: "Draft" });

  async function save() {
    setError("");
    try {
      const payload: Sale = {
        clientName: editing.clientName.trim(),
        amount: Number(editing.amount || 0),
        status: editing.status,
        updatedAt: serverTimestamp(),
      };
      if (!payload.clientName) throw new Error("Client Name is required.");
      if (editing.id) {
        await updateDoc(doc(db, "sales", editing.id), payload as any);
      } else {
        await addDoc(collection(db, "sales"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      reset();
    } catch (e: any) {
      setError(e?.message || "Failed to save sale.");
      console.error("save sale error:", e);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      await deleteDoc(doc(db, "sales", id));
      if (editing.id === id) reset();
    } catch (e: any) {
      setError(e?.message || "Delete failed (sale).");
      console.error("delete sale error:", e);
    }
  }

  return (
    <Section title="Sales">
      {error && <div className="text-red-400 mb-3 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-gray-400">Client Name</label>
          <Input
            value={editing.clientName}
            onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Amount</label>
          <Input
            type="number"
            step="0.01"
            value={editing.amount ?? 0}
            onChange={(e) =>
              setEditing({ ...editing, amount: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Status</label>
          <Select
            value={editing.status}
            onChange={(e) =>
              setEditing({ ...editing, status: e.target.value as Sale["status"] })
            }
          >
            {["Draft", "Sent", "Paid", "Void"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={save}>Save Sale</Button>
        <Button className="bg-gray-700 hover:bg-gray-600 text-white" onClick={reset}>
          Cancel
        </Button>
      </div>

      <ul className="mt-4 divide-y divide-gray-800">
        {rows.map((r) => (
          <li key={r.id} className="py-2 flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.clientName}</div>
              <div className="text-xs text-gray-400">
                ${Number(r.amount).toFixed(2)} • {r.status}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-amber-500 hover:bg-amber-400"
                onClick={() => setEditing(r)}
              >
                Edit
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-500"
                onClick={() => r.id && del(r.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- Scheduling (Firestore direct) ---------- */
function Scheduling() {
  const [rows, setRows] = React.useState<Booking[]>([]);
  const [editing, setEditing] = React.useState<Booking>({
    title: "",
    clientName: "",
    date: "",
  });
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    const q = query(collection(db, "bookings"), orderBy("date"));
    return onSnapshot(q, (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
  }, []);

  const reset = () => setEditing({ title: "", clientName: "", date: "" });

  async function save() {
    setError("");
    try {
      const payload: Booking = {
        title: editing.title.trim(),
        clientName: editing.clientName.trim(),
        date: editing.date,
        updatedAt: serverTimestamp(),
      };
      if (!payload.title) throw new Error("Title is required.");
      if (!payload.date) throw new Error("Date is required (yyyy-mm-dd).");

      if (editing.id) {
        await updateDoc(doc(db, "bookings", editing.id), payload as any);
      } else {
        await addDoc(collection(db, "bookings"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      reset();
    } catch (e: any) {
      setError(e?.message || "Failed to save booking.");
      console.error("save booking error:", e);
    }
  }

  async function del(id: string) {
    setError("");
    try {
      await deleteDoc(doc(db, "bookings", id));
      if (editing.id === id) reset();
    } catch (e: any) {
      setError(e?.message || "Delete failed (booking).");
      console.error("delete booking error:", e);
    }
  }

  return (
    <Section title="Scheduling">
      {error && <div className="text-red-400 mb-3 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-gray-400">Title</label>
          <Input
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Client Name</label>
          <Input
            value={editing.clientName}
            onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Date</label>
          <Input
            type="date"
            value={editing.date}
            onChange={(e) => setEditing({ ...editing, date: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={save}>Save Booking</Button>
        <Button className="bg-gray-700 hover:bg-gray-600 text-white" onClick={reset}>
          Cancel
        </Button>
      </div>

      <ul className="mt-4 divide-y divide-gray-800">
        {rows.map((r) => (
          <li key={r.id} className="py-2 flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.title}</div>
              <div className="text-xs text-gray-400">
                {r.clientName} • {r.date}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="bg-amber-500 hover:bg-amber-400"
                onClick={() => setEditing(r)}
              >
                Edit
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-500"
                onClick={() => r.id && del(r.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ---------- App container ---------- */
const App: React.FC = () => {
  const [user, setUser] = React.useState<User | null>(null);
  const [tab, setTab] = React.useState<"clients" | "inventory" | "sales" | "sched">(
    "clients"
  );

  React.useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  if (!user) return <Login />;

  return (
    <div className="min-h-screen text-gray-200 bg-[#121212]">
      <header className="border-b border-gray-800 p-4 flex items-center justify-between">
        <div className="font-bold text-xl">Jingjai</div>
        <div className="flex gap-2">
          <Button
            className={tab === "clients" ? "" : "bg-gray-700 hover:bg-gray-600 text-white"}
            onClick={() => setTab("clients")}
          >
            Clients
          </Button>
          <Button
            className={tab === "inventory" ? "" : "bg-gray-700 hover:bg-gray-600 text-white"}
            onClick={() => setTab("inventory")}
          >
            Inventory
          </Button>
          <Button
            className={tab === "sales" ? "" : "bg-gray-700 hover:bg-gray-600 text-white"}
            onClick={() => setTab("sales")}
          >
            Sales
          </Button>
          <Button
            className={tab === "sched" ? "" : "bg-gray-700 hover:bg-gray-600 text-white"}
            onClick={() => setTab("sched")}
          >
            Scheduling
          </Button>
        </div>
        <Button className="bg-gray-300 hover:bg-white" onClick={doSignOut}>
          Sign out
        </Button>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {tab === "clients" && <Clients />}
        {tab === "inventory" && <Inventory />}
        {tab === "sales" && <Sales />}
        {tab === "sched" && <Scheduling />}
      </main>
    </div>
  );
};

export default App;
