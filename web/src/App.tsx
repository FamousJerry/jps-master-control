import React from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./lib/firebase";

/* ------------ helpers ------------ */
const csvToArray = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const arrayToCsv = (arr?: string[]) => (arr || []).join(", ");
const cls = (...xs: (string | false | null | undefined)[]) =>
  xs.filter(Boolean).join(" ");

/* ------------ types ------------ */
type Client = {
  id?: string;
  clientId?: string;
  legalName: string;
  tradingName: string;
  website?: string;
  industry?: "TV" | "Film" | "Music Video" | "Comercial" | "Other";
  status?: "Prospect" | "Active" | "Inactive";
  tier?: "A" | "B" | "C";
  tags?: string[];
  taxId?: string;
  vatRegistered?: boolean;
  ndaOnFile?: boolean;
  vendorFormUrl?: string;
  currency?: "THB" | "USD" | "EUR" | "GBP";
  paymentTerms?: "Net 15" | "Net 30" | "Net 45" | "Due on Receipt";
  discountRate?: number;
  poRequired?: boolean;
  billingEmails?: string[];
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  contacts?: Array<{
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    isPrimary?: boolean;
  }>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type InventoryItem = {
  id?: string;
  name: string;
  sku?: string;
  category?: string;
  location?: string;
  status?: "Available" | "Out" | "Maintenance" | "Retired";
  quantity?: number;
  unitCost?: number;
  rentalRate?: number;
  serialNumber?: string;
  tags?: string[];
  notes?: string;
  createdAt?: Timestamp;
};

type Sale = {
  id?: string;
  name: string;
  clientId?: string;
  stage?: "Lead" | "Qualified" | "Quoted" | "Won" | "Lost";
  amount?: number;
  currency?: "THB" | "USD" | "EUR" | "GBP";
  closeDate?: string; // yyyy-mm-dd
  ownerEmail?: string;
  tags?: string[];
  notes?: string;
  createdAt?: Timestamp;
};

type Booking = {
  id?: string;
  title: string;
  resourceName?: string;
  status?: "Tentative" | "Confirmed" | "Hold" | "Cancelled";
  start?: string; // datetime-local
  end?: string; // datetime-local
  clientId?: string;
  location?: string;
  notes?: string;
  createdAt?: Timestamp;
};

/* ------------ auth views ------------ */
function SignInView() {
  const [err, setErr] = React.useState("");
  const signIn = async () => {
    setErr("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: any) {
      setErr(e?.message || "Failed to sign in.");
    }
  };
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="w-full max-w-sm p-6 rounded-xl border border-neutral-800 bg-neutral-900">
        <h1 className="text-xl font-semibold text-[#39FF14] mb-2">Jingjai</h1>
        <p className="text-sm text-neutral-300 mb-4">Sign in to continue</p>
        {err && (
          <div className="text-xs text-red-400 border border-red-500/40 p-2 mb-3 rounded">
            {err}
          </div>
        )}
        <button
          onClick={signIn}
          className="w-full py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function TopBar({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-10 bg-black/80 backdrop-blur border-b border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <nav className="flex items-center gap-4 text-sm">
          <a href="#client-central" className="text-neutral-300 hover:text-white">
            Client Central
          </a>
          <a href="#inventory" className="text-neutral-300 hover:text-white">
            Inventory
          </a>
          <a href="#sales" className="text-neutral-300 hover:text-white">
            Sales
          </a>
          <a href="#scheduling" className="text-neutral-300 hover:text-white">
            Scheduling
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium">
              {user.displayName || user.email}
            </div>
            <div className="text-[11px] text-neutral-400">Signed in</div>
          </div>
          <button
            className="text-xs text-neutral-400 hover:text-white"
            onClick={() => signOut(auth)}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

/* ------------ Client Central (list + modal + delete) ------------ */

function ClientModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const empty: Client = {
    legalName: "",
    tradingName: "",
    website: "",
    industry: "TV",
    status: "Prospect",
    tier: "B",
    tags: [],
    taxId: "",
    vatRegistered: false,
    ndaOnFile: false,
    vendorFormUrl: "",
    currency: "THB",
    paymentTerms: "Net 30",
    discountRate: 0,
    poRequired: false,
    billingEmails: [],
    billingAddress: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postcode: "",
      country: "",
    },
    contacts: [{ name: "", title: "", email: "", phone: "", isPrimary: true }],
  };

  const [form, setForm] = React.useState<Client>(initial || empty);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError("");
      setFieldErrors({});
      setForm(initial || empty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const update = (patch: Partial<Client>) =>
    setForm((f) => ({ ...f, ...patch }));

  const updateBillingAddress = (
    patch: Partial<NonNullable<Client["billingAddress"]>>
  ) =>
    setForm((f) => ({
      ...f,
      billingAddress: { ...(f.billingAddress || {}), ...patch },
    }));

  const updateContact = (
    idx: number,
    patch: Partial<NonNullable<Client["contacts"]>[number]>
  ) =>
    setForm((f) => {
      const arr = [...(f.contacts || [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...f, contacts: arr };
    });

  const addContact = () =>
    setForm((f) => ({
      ...f,
      contacts: [
        ...(f.contacts || []),
        { name: "", title: "", email: "", phone: "", isPrimary: false },
      ],
    }));

  const removeContact = (idx: number) =>
    setForm((f) => {
      const arr = [...(f.contacts || [])];
      arr.splice(idx, 1);
      return { ...f, contacts: arr };
    });

  const localValidate = (values: Client) => {
    const fe: Record<string, string> = {};
    if (!values.legalName?.trim()) fe.legalName = "Required.";
    if (values.vatRegistered && !values.taxId?.trim())
      fe.taxId = "Required when VAT Registered.";
    if ((values.discountRate ?? 0) < 0 || (values.discountRate ?? 0) > 100)
      fe.discountRate = "0 - 100.";
    return fe;
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const payload: Client = {
        ...form,
        tags: csvToArray(arrayToCsv(form.tags)),
        billingEmails: csvToArray(arrayToCsv(form.billingEmails)),
        discountRate: Number(form.discountRate || 0),
      };

      const clientSide = localValidate(payload);
      if (Object.keys(clientSide).length) {
        setFieldErrors(clientSide);
        setSaving(false);
        return;
      }

      const call = httpsCallable(functions, "upsertClient");
      await call({ id: initial?.id || null, client: payload });

      onSaved();
      onClose();
    } catch (e: any) {
      setFieldErrors((e?.details && e.details.fieldErrors) || {});
      const message =
        e?.message ||
        e?.details ||
        e?.code ||
        "Failed to save client. Check Functions logs for upsertClient.";
      setError(String(message));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = (name: string) =>
    cls(
      "w-full bg-neutral-800 border rounded px-3 py-2",
      fieldErrors[name] ? "border-red-500" : "border-neutral-700"
    );

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-neutral-900 text-white rounded-xl border border-neutral-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {initial?.id ? "Edit Client" : "Add Client"}
          </div>
          <button
            className="text-neutral-400 hover:text-white text-sm"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="text-red-400 text-sm border border-red-500/40 rounded p-2">
              {error}
            </div>
          )}

          <section>
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">
              Identity
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Company Legal Name
                </label>
                <input
                  className={inputClass("legalName")}
                  value={form.legalName}
                  onChange={(e) => update({ legalName: e.target.value })}
                />
                {fieldErrors.legalName && (
                  <p className="text-xs text-red-400 mt-1">
                    {fieldErrors.legalName}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Trading Name
                </label>
                <input
                  className={inputClass("tradingName")}
                  value={form.tradingName}
                  onChange={(e) => update({ tradingName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Industry
                </label>
                <select
                  className={inputClass("industry")}
                  value={form.industry || "TV"}
                  onChange={(e) =>
                    update({ industry: e.target.value as Client["industry"] })
                  }
                >
                  <option>TV</option>
                  <option>Film</option>
                  <option>Music Video</option>
                  <option>Comercial</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Website
                </label>
                <input
                  className={inputClass("website")}
                  value={form.website || ""}
                  onChange={(e) => update({ website: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Status
                </label>
                <select
                  className={inputClass("status")}
                  value={form.status || "Prospect"}
                  onChange={(e) =>
                    update({ status: e.target.value as Client["status"] })
                  }
                >
                  <option>Prospect</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Tier
                </label>
                <select
                  className={inputClass("tier")}
                  value={form.tier || "B"}
                  onChange={(e) =>
                    update({ tier: e.target.value as Client["tier"] })
                  }
                >
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs mb-1 text-neutral-400">
                  Tags (comma separated)
                </label>
                <input
                  className={inputClass("tags")}
                  value={arrayToCsv(form.tags)}
                  onChange={(e) => update({ tags: csvToArray(e.target.value) })}
                  placeholder="vip, studio, agency"
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">
              Compliance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Tax / VAT ID
                </label>
                <input
                  className={inputClass("taxId")}
                  value={form.taxId || ""}
                  onChange={(e) => update({ taxId: e.target.value })}
                />
                {fieldErrors.taxId && (
                  <p className="text-xs text-red-400 mt-1">
                    {fieldErrors.taxId}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Vendor Form URL
                </label>
                <input
                  className={inputClass("vendorFormUrl")}
                  value={form.vendorFormUrl || ""}
                  onChange={(e) => update({ vendorFormUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={!!form.vatRegistered}
                    onChange={(e) =>
                      update({ vatRegistered: e.target.checked })
                    }
                  />
                  VAT Registered
                </label>
                <label className="text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={!!form.ndaOnFile}
                    onChange={(e) => update({ ndaOnFile: e.target.checked })}
                  />
                  NDA on file
                </label>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">
              Billing
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Currency
                </label>
                <select
                  className={inputClass("currency")}
                  value={form.currency || "THB"}
                  onChange={(e) =>
                    update({ currency: e.target.value as any })
                  }
                >
                  <option>THB</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Payment Terms
                </label>
                <select
                  className={inputClass("paymentTerms")}
                  value={form.paymentTerms || "Net 30"}
                  onChange={(e) =>
                    update({ paymentTerms: e.target.value as any })
                  }
                >
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Due on Receipt</option>
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Discount Rate (%)
                </label>
                <input
                  type="number"
                  className={inputClass("discountRate")}
                  value={form.discountRate ?? 0}
                  onChange={(e) =>
                    update({ discountRate: Number(e.target.value) })
                  }
                />
                {fieldErrors.discountRate && (
                  <p className="text-xs text-red-400 mt-1">
                    {fieldErrors.discountRate}
                  </p>
                )}
              </div>
              <div className="flex items-center">
                <label className="text-xs text-neutral-300">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={!!form.poRequired}
                    onChange={(e) => update({ poRequired: e.target.checked })}
                  />
                  PO required
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs mb-1 text-neutral-400">
                  Billing Email(s)
                </label>
                <input
                  className={inputClass("billingEmails")}
                  value={arrayToCsv(form.billingEmails)}
                  onChange={(e) =>
                    update({ billingEmails: csvToArray(e.target.value) })
                  }
                  placeholder="ap@client.com, finance@client.com"
                />
                {fieldErrors.billingEmails && (
                  <p className="text-xs text-red-400 mt-1">
                    {fieldErrors.billingEmails}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Address Line 1
                </label>
                <input
                  className={inputClass("billingAddress.line1")}
                  value={form.billingAddress?.line1 || ""}
                  onChange={(e) =>
                    updateBillingAddress({ line1: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Line 2
                </label>
                <input
                  className={inputClass("billingAddress.line2")}
                  value={form.billingAddress?.line2 || ""}
                  onChange={(e) =>
                    updateBillingAddress({ line2: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  City
                </label>
                <input
                  className={inputClass("billingAddress.city")}
                  value={form.billingAddress?.city || ""}
                  onChange={(e) =>
                    updateBillingAddress({ city: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  State/Province
                </label>
                <input
                  className={inputClass("billingAddress.state")}
                  value={form.billingAddress?.state || ""}
                  onChange={(e) =>
                    updateBillingAddress({ state: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Postcode
                </label>
                <input
                  className={inputClass("billingAddress.postcode")}
                  value={form.billingAddress?.postcode || ""}
                  onChange={(e) =>
                    updateBillingAddress({ postcode: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">
                  Country
                </label>
                <input
                  className={inputClass("billingAddress.country")}
                  value={form.billingAddress?.country || ""}
                  onChange={(e) =>
                    updateBillingAddress({ country: e.target.value })
                  }
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">
              Contacts
            </h3>
            <div className="space-y-3">
              {(form.contacts || []).map((c, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-neutral-800/50 border border-neutral-700 rounded p-3"
                >
                  <input
                    className={inputClass(`contacts.${idx}.name`)}
                    placeholder="Name"
                    value={c.name || ""}
                    onChange={(e) => updateContact(idx, { name: e.target.value })}
                  />
                  <input
                    className={inputClass(`contacts.${idx}.title`)}
                    placeholder="Title"
                    value={c.title || ""}
                    onChange={(e) =>
                      updateContact(idx, { title: e.target.value })
                    }
                  />
                  <input
                    className={inputClass(`contacts.${idx}.email`)}
                    placeholder="Email"
                    value={c.email || ""}
                    onChange={(e) =>
                      updateContact(idx, { email: e.target.value })
                    }
                  />
                  <input
                    className={inputClass(`contacts.${idx}.phone`)}
                    placeholder="Phone"
                    value={c.phone || ""}
                    onChange={(e) =>
                      updateContact(idx, { phone: e.target.value })
                    }
                  />
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-neutral-300">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={!!c.isPrimary}
                        onChange={(e) =>
                          updateContact(idx, { isPrimary: e.target.checked })
                        }
                      />
                      Primary
                    </label>
                    <button
                      className="text-xs text-red-400 hover:text-red-300"
                      onClick={() => removeContact(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                className="text-sm text-[#39FF14] hover:opacity-80"
                onClick={addContact}
              >
                + Add Contact
              </button>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientCentral() {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Client | null>(null);
  const [clients, setClients] = React.useState<Client[]>([]);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setClients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setModalOpen(true);
  };

  const doDelete = async (id: string) => {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    try {
      const call = httpsCallable(functions, "deleteClient");
      await call({ id });
    } catch (e: any) {
      alert(e?.message || e?.details || e?.code || "Delete failed.");
    }
  };

  return (
    <section id="client-central" className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Client Central</h2>
        <button
          onClick={openAdd}
          className="px-3 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90"
        >
          Add Client
        </button>
      </div>
      {err && (
        <div className="text-sm text-red-400 border border-red-500/40 p-2 rounded mb-3">
          {err}
        </div>
      )}
      <div className="grid gap-3">
        {clients.map((c) => (
          <div
            key={c.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-semibold text-white">
                {c.tradingName || c.legalName}{" "}
                <span className="text-xs text-neutral-400 ml-2">
                  {c.clientId}
                </span>
              </div>
              <div className="text-xs text-neutral-400">
                {c.industry} • {c.status} • Tier {c.tier}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-sm text-neutral-200 hover:text-white px-2 py-1 border border-neutral-700 rounded"
                onClick={() => openEdit(c)}
              >
                Edit
              </button>
              <button
                className="text-sm text-red-400 hover:text-red-300 px-2 py-1 border border-red-500/40 rounded"
                onClick={() => doDelete(c.id!)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <div className="text-neutral-400 text-sm">No clients yet.</div>
        )}
      </div>

      <ClientModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {}}
      />
    </section>
  );
}

/* ------------ Inventory ------------ */

function InventoryModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const empty: InventoryItem = {
    name: "",
    sku: "",
    category: "",
    location: "",
    status: "Available",
    quantity: 0,
    unitCost: 0,
    rentalRate: 0,
    serialNumber: "",
    tags: [],
    notes: "",
  };
  const [form, setForm] = React.useState<InventoryItem>(initial || empty);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError("");
      setFieldErrors({});
      setForm(initial || empty);
    }
  }, [open, initial?.id]);

  const update = (p: Partial<InventoryItem>) =>
    setForm((f) => ({ ...f, ...p }));

  const localValidate = (v: InventoryItem) => {
    const fe: Record<string, string> = {};
    if (!v.name?.trim()) fe.name = "Required.";
    if ((v.quantity ?? 0) < 0) fe.quantity = ">= 0.";
    if ((v.unitCost ?? 0) < 0) fe.unitCost = ">= 0.";
    if ((v.rentalRate ?? 0) < 0) fe.rentalRate = ">= 0.";
    return fe;
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity || 0),
        unitCost: Number(form.unitCost || 0),
        rentalRate: Number(form.rentalRate || 0),
        tags: csvToArray(arrayToCsv(form.tags)),
        status: form.status || "Available",
      };
      const fe = localValidate(payload);
      if (Object.keys(fe).length) {
        setFieldErrors(fe);
        setSaving(false);
        return;
      }
      const call = httpsCallable(functions, "upsertInventory");
      await call({ id: initial?.id || null, item: payload });
      onSaved();
      onClose();
    } catch (e: any) {
      setFieldErrors((e?.details && e.details.fieldErrors) || {});
      const message =
        e?.message ||
        e?.details ||
        e?.code ||
        "Failed to save item. Check Functions logs for upsertInventory.";
      setError(String(message));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  const inputClass = (n: string) =>
    cls(
      "w-full bg-neutral-800 border rounded px-3 py-2",
      fieldErrors[n] ? "border-red-500" : "border-neutral-700"
    );

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-neutral-900 text-white rounded-xl border border-neutral-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {initial?.id ? "Edit Item" : "Add Item"}
          </div>
          <button
            className="text-neutral-400 hover:text-white text-sm"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="text-red-400 text-sm border border-red-500/40 rounded p-2">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-neutral-400">Name</label>
              <input
                className={inputClass("name")}
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">SKU</label>
              <input
                className={inputClass("sku")}
                value={form.sku || ""}
                onChange={(e) => update({ sku: e.target.value })}
              />
              {fieldErrors.sku && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.sku}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Category
              </label>
              <input
                className={inputClass("category")}
                value={form.category || ""}
                onChange={(e) => update({ category: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Location
              </label>
              <input
                className={inputClass("location")}
                value={form.location || ""}
                onChange={(e) => update({ location: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Status
              </label>
              <select
                className={inputClass("status")}
                value={form.status || "Available"}
                onChange={(e) =>
                  update({ status: e.target.value as InventoryItem["status"] })
                }
              >
                <option>Available</option>
                <option>Out</option>
                <option>Maintenance</option>
                <option>Retired</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Quantity
              </label>
              <input
                type="number"
                className={inputClass("quantity")}
                value={form.quantity ?? 0}
                onChange={(e) => update({ quantity: Number(e.target.value) })}
              />
              {fieldErrors.quantity && (
                <p className="text-xs text-red-400 mt-1">
                  {fieldErrors.quantity}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Unit Cost
              </label>
              <input
                type="number"
                className={inputClass("unitCost")}
                value={form.unitCost ?? 0}
                onChange={(e) => update({ unitCost: Number(e.target.value) })}
              />
              {fieldErrors.unitCost && (
                <p className="text-xs text-red-400 mt-1">
                  {fieldErrors.unitCost}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Rental Rate
              </label>
              <input
                type="number"
                className={inputClass("rentalRate")}
                value={form.rentalRate ?? 0}
                onChange={(e) =>
                  update({ rentalRate: Number(e.target.value) })
                }
              />
              {fieldErrors.rentalRate && (
                <p className="text-xs text-red-400 mt-1">
                  {fieldErrors.rentalRate}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">
                Serial Number
              </label>
              <input
                className={inputClass("serialNumber")}
                value={form.serialNumber || ""}
                onChange={(e) => update({ serialNumber: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">
                Tags (comma separated)
              </label>
              <input
                className={inputClass("tags")}
                value={arrayToCsv(form.tags)}
                onChange={(e) => update({ tags: csvToArray(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">
                Notes
              </label>
              <textarea
                className={inputClass("notes")}
                value={form.notes || ""}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Item"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InventorySection() {
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<InventoryItem | null>(null);

  React.useEffect(() => {
    const q = query(collection(db, "inventory"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, []);

  const doDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      await httpsCallable(functions, "deleteInventory")({ id });
    } catch (e: any) {
      alert(e?.message || e?.details || e?.code || "Delete failed.");
    }
  };

  return (
    <section id="inventory" className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-white">Inventory</h2>
        <button
          className="px-3 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add Item
        </button>
      </div>
      {err && (
        <div className="text-sm text-red-400 border border-red-500/40 p-2 rounded mb-3">
          {err}
        </div>
      )}
      <div className="grid gap-3">
        {items.map((it) => (
          <div
            key={it.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-semibold text-white">
                {it.name}{" "}
                {it.sku ? (
                  <span className="text-xs text-neutral-400 ml-2">
                    SKU {it.sku}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-neutral-400">
                {it.status} • Qty {it.quantity ?? 0} • THB{it.rentalRate ?? 0}
/day
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-sm text-neutral-200 hover:text-white px-2 py-1 border border-neutral-700 rounded"
                onClick={() => {
                  setEditing(it);
                  setOpen(true);
                }}
              >
                Edit
              </button>
              <button
                className="text-sm text-red-400 hover:text-red-300 px-2 py-1 border border-red-500/40 rounded"
                onClick={() => doDelete(it.id!)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-neutral-400 text-sm">No items yet.</div>
        )}
      </div>
      <InventoryModal
        open={open}
        initial={editing}
        onClose={() => setOpen(false)}
        onSaved={() => {}}
      />
    </section>
  );
}

/* ------------ Sales ------------ */

function SalesModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Sale | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const empty: Sale = {
    name: "",
    clientId: "",
    stage: "Lead",
    amount: 0,
    currency: "THB",
    closeDate: "",
    ownerEmail: "",
    tags: [],
    notes: "",
  };
  const [form, setForm] = React.useState<Sale>(initial || empty);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError("");
      setFieldErrors({});
      setForm(initial || empty);
    }
  }, [open, initial?.id]);

  const update = (p: Partial<Sale>) => setForm((f) => ({ ...f, ...p }));

  const localValidate = (v: Sale) => {
    const fe: Record<string, string> = {};
    if (!v.name?.trim()) fe.name = "Required.";
    if ((v.amount ?? 0) < 0) fe.amount = ">= 0.";
    return fe;
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const payload = {
        ...form,
        amount: Number(form.amount || 0),
        tags: csvToArray(arrayToCsv(form.tags)),
      };
      const fe = localValidate(payload);
      if (Object.keys(fe).length) {
        setFieldErrors(fe);
        setSaving(false);
        return;
      }
      await httpsCallable(functions, "upsertSale")({
        id: initial?.id || null,
        sale: payload,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setFieldErrors((e?.details && e.details.fieldErrors) || {});
      const message =
        e?.message ||
        e?.details ||
        e?.code ||
        "Failed to save sale. Check Functions logs for upsertSale.";
      setError(String(message));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  const inputClass = (n: string) =>
    cls(
      "w-full bg-neutral-800 border rounded px-3 py-2",
      fieldErrors[n] ? "border-red-500" : "border-neutral-700"
    );

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-neutral-900 text-white rounded-xl border border-neutral-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {initial?.id ? "Edit Sale" : "Add Sale"}
          </div>
          <button
            className="text-neutral-400 hover:text-white text-sm"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="text-red-400 text-sm border border-red-500/40 rounded p-2">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-neutral-400">Name</label>
              <input
                className={inputClass("name")}
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              {fieldErrors.name && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Client ID (optional)
              </label>
              <input
                className={inputClass("clientId")}
                value={form.clientId || ""}
                onChange={(e) => update({ clientId: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">Stage</label>
              <select
                className={inputClass("stage")}
                value={form.stage || "Lead"}
                onChange={(e) =>
                  update({ stage: e.target.value as Sale["stage"] })
                }
              >
                <option>Lead</option>
                <option>Qualified</option>
                <option>Quoted</option>
                <option>Won</option>
                <option>Lost</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">Amount</label>
              <input
                type="number"
                className={inputClass("amount")}
                value={form.amount ?? 0}
                onChange={(e) => update({ amount: Number(e.target.value) })}
              />
              {fieldErrors.amount && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.amount}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Currency
              </label>
              <select
                className={inputClass("currency")}
                value={form.currency || "THB"}
                onChange={(e) =>
                  update({ currency: e.target.value as any })
                }
              >
                <option>THB</option>
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Close Date
              </label>
              <input
                type="date"
                className={inputClass("closeDate")}
                value={form.closeDate || ""}
                onChange={(e) => update({ closeDate: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">
                Owner Email
              </label>
              <input
                className={inputClass("ownerEmail")}
                value={form.ownerEmail || ""}
                onChange={(e) => update({ ownerEmail: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">Tags</label>
              <input
                className={inputClass("tags")}
                value={arrayToCsv(form.tags)}
                onChange={(e) => update({ tags: csvToArray(e.target.value) })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">Notes</label>
              <textarea
                className={inputClass("notes")}
                value={form.notes || ""}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Sale"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SalesSection() {
  const [rows, setRows] = React.useState<Sale[]>([]);
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Sale | null>(null);

  React.useEffect(() => {
    const q = query(collection(db, "sales"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, []);

  const doDelete = async (id: string) => {
    if (!confirm("Delete this sale?")) return;
    try {
      await httpsCallable(functions, "deleteSale")({ id });
    } catch (e: any) {
      alert(e?.message || e?.details || e?.code || "Delete failed.");
    }
  };

  return (
    <section id="sales" className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-white">Sales</h2>
        <button
          className="px-3 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add Sale
        </button>
      </div>
      {err && (
        <div className="text-sm text-red-400 border border-red-500/40 p-2 rounded mb-3">
          {err}
        </div>
      )}
      <div className="grid gap-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-semibold text-white">
                {r.name}{" "}
                <span className="text-xs text-neutral-400 ml-2">
                  {r.stage}
                </span>
              </div>
              <div className="text-xs text-neutral-400">
                {r.currency} {r.amount ?? 0}{" "}
                {r.closeDate ? `• Close ${r.closeDate}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-sm text-neutral-200 hover:text-white px-2 py-1 border border-neutral-700 rounded"
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
              >
                Edit
              </button>
              <button
                className="text-sm text-red-400 hover:text-red-300 px-2 py-1 border border-red-500/40 rounded"
                onClick={() => doDelete(r.id!)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-neutral-400 text-sm">No sales yet.</div>
        )}
      </div>
      <SalesModal
        open={open}
        initial={editing}
        onClose={() => setOpen(false)}
        onSaved={() => {}}
      />
    </section>
  );
}

/* ------------ Scheduling ------------ */

function BookingModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial?: Booking | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const empty: Booking = {
    title: "",
    resourceName: "",
    status: "Tentative",
    start: "",
    end: "",
    clientId: "",
    location: "",
    notes: "",
  };
  const [form, setForm] = React.useState<Booking>(initial || empty);

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError("");
      setFieldErrors({});
      setForm(initial || empty);
    }
  }, [open, initial?.id]);

  const update = (p: Partial<Booking>) => setForm((f) => ({ ...f, ...p }));

  const localValidate = (v: Booking) => {
    const fe: Record<string, string> = {};
    if (!v.title?.trim()) fe.title = "Required.";
    if (!v.start) fe.start = "Required.";
    if (!v.end) fe.end = "Required.";
    if (v.start && v.end && new Date(v.start).getTime() >= new Date(v.end).getTime())
      fe.end = "End must be after start.";
    return fe;
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const payload = { ...form };
      const fe = localValidate(payload);
      if (Object.keys(fe).length) {
        setFieldErrors(fe);
        setSaving(false);
        return;
      }
      await httpsCallable(functions, "upsertBooking")({
        id: initial?.id || null,
        booking: payload,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setFieldErrors((e?.details && e.details.fieldErrors) || {});
      const message =
        e?.message ||
        e?.details ||
        e?.code ||
        "Failed to save booking. Check Functions logs for upsertBooking.";
      setError(String(message));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = (n: string) =>
    cls(
      "w-full bg-neutral-800 border rounded px-3 py-2",
      fieldErrors[n] ? "border-red-500" : "border-neutral-700"
    );

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-neutral-900 text-white rounded-xl border border-neutral-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-lg font-semibold">
            {initial?.id ? "Edit Booking" : "Add Booking"}
          </div>
          <button
            className="text-neutral-400 hover:text-white text-sm"
            onClick={onClose}
            disabled={saving}
          >
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="text-red-400 text-sm border border-red-500/40 rounded p-2">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Title
              </label>
              <input
                className={inputClass("title")}
                value={form.title}
                onChange={(e) => update({ title: e.target.value })}
              />
              {fieldErrors.title && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.title}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Resource
              </label>
              <input
                className={inputClass("resourceName")}
                value={form.resourceName || ""}
                onChange={(e) => update({ resourceName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Status
              </label>
              <select
                className={inputClass("status")}
                value={form.status || "Tentative"}
                onChange={(e) =>
                  update({ status: e.target.value as Booking["status"] })
                }
              >
                <option>Tentative</option>
                <option>Confirmed</option>
                <option>Hold</option>
                <option>Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">
                Start
              </label>
              <input
                type="datetime-local"
                className={inputClass("start")}
                value={form.start || ""}
                onChange={(e) => update({ start: e.target.value })}
              />
              {fieldErrors.start && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.start}</p>
              )}
            </div>
            <div>
              <label className="block text-xs mb-1 text-neutral-400">End</label>
              <input
                type="datetime-local"
                className={inputClass("end")}
                value={form.end || ""}
                onChange={(e) => update({ end: e.target.value })}
              />
              {fieldErrors.end && (
                <p className="text-xs text-red-400 mt-1">{fieldErrors.end}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">
                Client ID (optional)
              </label>
              <input
                className={inputClass("clientId")}
                value={form.clientId || ""}
                onChange={(e) => update({ clientId: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">
                Location
              </label>
              <input
                className={inputClass("location")}
                value={form.location || ""}
                onChange={(e) => update({ location: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1 text-neutral-400">Notes</label>
              <textarea
                className={inputClass("notes")}
                value={form.notes || ""}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90 disabled:opacity-50"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SchedulingSection() {
  const [rows, setRows] = React.useState<Booking[]>([]);
  const [err, setErr] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Booking | null>(null);

  React.useEffect(() => {
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, []);

  const doDelete = async (id: string) => {
    if (!confirm("Delete this booking?")) return;
    try {
      await httpsCallable(functions, "deleteBooking")({ id });
    } catch (e: any) {
      alert(e?.message || e?.details || e?.code || "Delete failed.");
    }
  };

  return (
    <section id="scheduling" className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold text-white">Scheduling</h2>
        <button
          className="px-3 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add Booking
        </button>
      </div>
      {err && (
        <div className="text-sm text-red-400 border border-red-500/40 p-2 rounded mb-3">
          {err}
        </div>
      )}
      <div className="grid gap-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-semibold text-white">
                {r.title}{" "}
                <span className="text-xs text-neutral-400 ml-2">
                  {r.status}
                </span>
              </div>
              <div className="text-xs text-neutral-400">
                {r.start} → {r.end} {r.location ? `• ${r.location}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="text-sm text-neutral-200 hover:text-white px-2 py-1 border border-neutral-700 rounded"
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
              >
                Edit
              </button>
              <button
                className="text-sm text-red-400 hover:text-red-300 px-2 py-1 border border-red-500/40 rounded"
                onClick={() => doDelete(r.id!)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-neutral-400 text-sm">No bookings yet.</div>
        )}
      </div>
      <BookingModal
        open={open}
        initial={editing}
        onClose={() => setOpen(false)}
        onSaved={() => {}}
      />
    </section>
  );
}

/* ------------ App root ------------ */

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);
  if (loading)
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading…
      </div>
    );
  if (!user) return <SignInView />;

  return (
    <div className="bg-black min-h-screen text-white">
      <TopBar user={user} />
      <main>
        <ClientCentral />
        <InventorySection />
        <SalesSection />
        <SchedulingSection />
      </main>
    </div>
  );
}
