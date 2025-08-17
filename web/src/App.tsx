import React from "react";
import { auth, db, functions, signInGoogle, doSignOut } from "./lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/* ---------- Small UI helpers ---------- */
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-3 py-2 rounded bg-green-600 hover:bg-green-500 text-black font-semibold ${props.className || ""}`}
    />
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded bg-[#2F2F2F] border border-gray-700 px-3 py-2 text-sm ${props.className || ""}`}
    />
  );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded bg-[#2F2F2F] border border-gray-700 px-3 py-2 text-sm ${props.className || ""}`}
    />
  );
}
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-[#1f1f1f] rounded p-4 mb-8">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xl font-bold">{title}</h3>
    </div>
    {children}
  </div>
);

/* ---------- Login ---------- */
const Login: React.FC = () => {
  const [err, setErr] = React.useState<string>("");
  const doLogin = async () => {
    setErr("");
    try { await signInGoogle(); } catch (e: any) { setErr(e?.message || "Login failed"); }
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

/* ---------- Clients ---------- */
type Client = {
  id?: string;
  legalName: string;
  tradingName?: string;
  industry?: string;
  status?: "Prospect" | "Active" | "Inactive";
  tier?: "A" | "B" | "C";
  taxId?: string;
  vatRegistered?: boolean;
  discountRate?: number;
  tags?: string; // CSV in UI; backend stores array
};
const defaultClient: Client = { legalName: "", industry: "TV", status: "Prospect", tier: "B", vatRegistered: false, discountRate: 0 };

const Clients: React.FC = () => {
  const [list, setList] = React.useState<DocumentData[]>([]);
  const [editing, setEditing] = React.useState<Client | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, snap => setList(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const save = async () => {
    if (!editing) return;
    setError("");
    try {
      await httpsCallable(functions, "upsertClient")({ id: editing.id || null, client: editing });
      setEditing(null);
    } catch (e: any) {
      const msg = e?.message || e?.details || e?.code || "Failed to save client. Check Functions logs for upsertClient.";
      setError(String(msg));
    }
  };
  const del = async (id: string) => {
    if (!confirm("Delete this client?")) return;
    try { await httpsCallable(functions, "deleteClient")({ id }); }
    catch (e: any) { alert(e?.message || e?.details || e?.code || "Delete failed"); }
  };

  return (
    <Section title="Client Central">
      <div className="mb-4"><Button onClick={() => setEditing({ ...defaultClient })}>Add Client</Button></div>
      {editing && (
        <div className="border border-gray-700 rounded p-4 mb-6">
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400">Company Legal Name</label>
              <Input value={editing.legalName} onChange={e => setEditing({ ...editing, legalName: e.target.value })} />
            </div>
            <div><label className="text-xs text-gray-400">Trading Name</label>
              <Input value={editing.tradingName || ""} onChange={e => setEditing({ ...editing, tradingName: e.target.value })} />
            </div>
            <div><label className="text-xs text-gray-400">Industry</label>
              <Select value={editing.industry || "TV"} onChange={e => setEditing({ ...editing, industry: e.target.value })}>
                <option>TV</option><option>Film</option><option>Music Video</option><option>Commercial</option><option>Other</option>
              </Select>
            </div>
            <div><label className="text-xs text-gray-400">Status</label>
              <Select value={editing.status || "Prospect"} onChange={e => setEditing({ ...editing, status: e.target.value as any })}>
                <option>Prospect</option><option>Active</option><option>Inactive</option>
              </Select>
            </div>
            <div><label className="text-xs text-gray-400">Tier</label>
              <Select value={editing.tier || "B"} onChange={e => setEditing({ ...editing, tier: e.target.value as any })}>
                <option>A</option><option>B</option><option>C</option>
              </Select>
            </div>
            <div><label className="text-xs text-gray-400">Tags (comma separated)</label>
              <Input value={editing.tags || ""} onChange={e => setEditing({ ...editing, tags: e.target.value })} placeholder="vip, studio, key" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={save}>Save Client</Button>
            <button className="px-3 py-2 rounded bg-gray-700" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((c:any) => (
          <div key={c.id} className="bg-gray-800 p-3 rounded flex items-center justify-between">
            <div>
              <div className="font-semibold">{c.tradingName || c.legalName}</div>
              <div className="text-xs text-gray-400">{c.status} • {c.industry}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-gray-700" onClick={() => setEditing({
                id: c.id,
                legalName: c.legalName || "",
                tradingName: c.tradingName || "",
                industry: c.industry || "TV",
                status: c.status || "Prospect",
                tier: c.tier || "B",
                tags: Array.isArray(c.tags) ? c.tags.join(",") : (c.tags || "")
              })}>Edit</button>
              <button className="px-3 py-1 rounded bg-red-700" onClick={() => del(c.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!list.length && <div className="text-sm text-gray-400">No clients yet.</div>}
      </div>
    </Section>
  );
};

/* ---------- Inventory ---------- */
type Item = { id?: string; name: string; quantity?: number; rentalRate?: number; };
const defaultItem: Item = { name: "", quantity: 0, rentalRate: 0 };

const Inventory: React.FC = () => {
  const [list, setList] = React.useState<DocumentData[]>([]);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const save = async () => {
    if (!editing) return;
    setError("");
    try { 
      await httpsCallable(functions, "upsertInventory")({ id: editing.id || null, item: editing }); 
      setEditing(null);
    } catch (e: any) { setError(e?.message || e?.details || e?.code || "Failed to save inventory item."); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    try { await httpsCallable(functions, "deleteInventory")({ id }); }
    catch (e: any) { alert(e?.message || "Delete failed"); }
  };

  return (
    <Section title="Inventory">
      <div className="mb-4"><Button onClick={() => setEditing({ ...defaultItem })}>Add Item</Button></div>
      {editing && (
        <div className="border border-gray-700 rounded p-4 mb-6">
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-400">Name</label>
              <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div><label className="text-xs text-gray-400">Quantity</label>
              <Input type="number" value={editing.quantity ?? 0} onChange={e => setEditing({ ...editing, quantity: Number(e.target.value) })} />
            </div>
            <div><label className="text-xs text-gray-400">Rental Rate</label>
              <Input type="number" value={editing.rentalRate ?? 0} onChange={e => setEditing({ ...editing, rentalRate: Number(e.target.value) })} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={save}>Save Item</Button>
            <button className="px-3 py-2 rounded bg-gray-700" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((i:any) => (
          <div key={i.id} className="bg-gray-800 p-3 rounded flex items-center justify-between">
            <div>
              <div className="font-semibold">{i.name}</div>
              <div className="text-xs text-gray-400">Qty {i.quantity ?? 0} • Rate {i.rentalRate ?? 0}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-gray-700" onClick={() => setEditing({
                id: i.id, name: i.name || "", quantity: i.quantity || 0, rentalRate: i.rentalRate || 0
              })}>Edit</button>
              <button className="px-3 py-1 rounded bg-red-700" onClick={() => del(i.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!list.length && <div className="text-sm text-gray-400">No inventory yet.</div>}
      </div>
    </Section>
  );
};

/* ---------- Sales ---------- */
type Sale = { id?: string; name: string; amount?: number; stage?: string; };
const defaultSale: Sale = { name: "", amount: 0, stage: "Lead" };

const Sales: React.FC = () => {
  const [list, setList] = React.useState<DocumentData[]>([]);
  const [editing, setEditing] = React.useState<Sale | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const q = query(collection(db, "sales"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const save = async () => {
    if (!editing) return;
    setError("");
    try { 
      await httpsCallable(functions, "upsertSale")({ id: editing.id || null, sale: editing });
      setEditing(null);
    } catch (e: any) { setError(e?.message || e?.details || e?.code || "Failed to save sale."); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete this sale?")) return;
    try { await httpsCallable(functions, "deleteSale")({ id }); }
    catch (e: any) { alert(e?.message || "Delete failed"); }
  };

  return (
    <Section title="Sales">
      <div className="mb-4"><Button onClick={() => setEditing({ ...defaultSale })}>Add Opportunity</Button></div>
      {editing && (
        <div className="border border-gray-700 rounded p-4 mb-6">
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-400">Name</label>
              <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div><label className="text-xs text-gray-400">Amount</label>
              <Input type="number" value={editing.amount ?? 0} onChange={e => setEditing({ ...editing, amount: Number(e.target.value) })} />
            </div>
            <div><label className="text-xs text-gray-400">Stage</label>
              <Select value={editing.stage || "Lead"} onChange={e => setEditing({ ...editing, stage: e.target.value })}>
                <option>Lead</option><option>Qualified</option><option>Negotiation</option><option>Won</option><option>Lost</option>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={save}>Save</Button>
            <button className="px-3 py-2 rounded bg-gray-700" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((r:any) => (
          <div key={r.id} className="bg-gray-800 p-3 rounded flex items-center justify-between">
            <div>
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-gray-400">{r.stage} • {r.amount ?? 0}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-gray-700" onClick={() => setEditing({
                id: r.id, name: r.name || "", amount: r.amount || 0, stage: r.stage || "Lead"
              })}>Edit</button>
              <button className="px-3 py-1 rounded bg-red-700" onClick={() => del(r.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!list.length && <div className="text-sm text-gray-400">No opportunities yet.</div>}
      </div>
    </Section>
  );
};

/* ---------- Scheduling ---------- */
type Booking = { id?: string; title: string; start?: string; end?: string; status?: string; };
const defaultBooking: Booking = { title: "", start: "", end: "", status: "Tentative" };

const Scheduling: React.FC = () => {
  const [list, setList] = React.useState<DocumentData[]>([]);
  const [editing, setEditing] = React.useState<Booking | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const q = query(collection(db, "bookings"), orderBy("updatedAt", "desc"));
    return onSnapshot(q, s => setList(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const save = async () => {
    if (!editing) return;
    setError("");
    try { 
      await httpsCallable(functions, "upsertBooking")({ id: editing.id || null, booking: editing });
      setEditing(null);
    } catch (e: any) { setError(e?.message || e?.details || e?.code || "Failed to save booking."); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete this booking?")) return;
    try { await httpsCallable(functions, "deleteBooking")({ id }); }
    catch (e: any) { alert(e?.message || "Delete failed"); }
  };

  return (
    <Section title="Scheduling">
      <div className="mb-4"><Button onClick={() => setEditing({ ...defaultBooking })}>Add Booking</Button></div>
      {editing && (
        <div className="border border-gray-700 rounded p-4 mb-6">
          {error && <div className="text-red-400 text-sm mb-2">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-400">Title</label>
              <Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div><label className="text-xs text-gray-400">Start</label>
              <Input type="datetime-local" value={editing.start || ""} onChange={e => setEditing({ ...editing, start: e.target.value })} />
            </div>
            <div><label className="text-xs text-gray-400">End</label>
              <Input type="datetime-local" value={editing.end || ""} onChange={e => setEditing({ ...editing, end: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={save}>Save</Button>
            <button className="px-3 py-2 rounded bg-gray-700" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((b:any) => (
          <div key={b.id} className="bg-gray-800 p-3 rounded flex items-center justify-between">
            <div>
              <div className="font-semibold">{b.title}</div>
              <div className="text-xs text-gray-400">{b.start} → {b.end}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-gray-700" onClick={() => setEditing({
                id: b.id, title: b.title || "", start: b.start || "", end: b.end || ""
              })}>Edit</button>
              <button className="px-3 py-1 rounded bg-red-700" onClick={() => del(b.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!list.length && <div className="text-sm text-gray-400">No bookings yet.</div>}
      </div>
    </Section>
  );
};

/* ---------- Shell ---------- */
const Shell: React.FC<{ user: User }> = ({ user }) => {
  const [tab, setTab] = React.useState<"clients"|"inventory"|"sales"|"sched">("clients");
  return (
    <div>
      <header className="fixed top-0 left-0 right-0 bg-black z-50 p-4 md:px-8 flex justify-between items-center">
        <div className="flex items-center space-x-6">
          <h1 className="text-lg md:text-2xl font-bold logo-neon whitespace-nowrap">JP Master Control</h1>
          <nav className="hidden md:flex gap-4">
            <button className={`nav-link ${tab==="clients"?"active-nav":""}`} onClick={()=>setTab("clients")}>Client Central</button>
            <button className={`nav-link ${tab==="inventory"?"active-nav":""}`} onClick={()=>setTab("inventory")}>Inventory</button>
            <button className={`nav-link ${tab==="sales"?"active-nav":""}`} onClick={()=>setTab("sales")}>Sales</button>
            <button className={`nav-link ${tab==="sched"?"active-nav":""}`} onClick={()=>setTab("sched")}>Scheduling</button>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-semibold">{user.displayName || user.email}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
          <button className="text-xs text-gray-400 hover:text-white" onClick={doSignOut}>Logout</button>
        </div>
      </header>

      <main className="pt-24 px-4 md:px-8 max-w-6xl mx-auto">
        {tab==="clients" && <Clients/>}
        {tab==="inventory" && <Inventory/>}
        {tab==="sales" && <Sales/>}
        {tab==="sched" && <Scheduling/>}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = React.useState<User|null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(()=> onAuthStateChanged(auth, (u)=>{ setUser(u); setLoading(false); }),[]);
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  return user ? <Shell user={user}/> : <Login/>;
};

export default App;
