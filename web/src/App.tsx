import React from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./lib/firebase";

/* Types */
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

const csvToArray = (s: string) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const arrayToCsv = (arr?: string[]) => (arr || []).join(", ");

/* ---------- Auth ---------- */

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
        {err && <div className="text-xs text-red-400 border border-red-500/40 p-2 mb-3 rounded">{err}</div>}
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
        <span className="text-[#39FF14] font-bold">JP Master Control</span>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium">{user.displayName || user.email}</div>
            <div className="text-[11px] text-neutral-400">Signed in</div>
          </div>
          <button className="text-xs text-neutral-400 hover:text-white" onClick={() => signOut(auth)}>
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- Client Modal (Add/Edit) ---------- */

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

  const [form, setForm] = React.useState<Client>(() => {
    return (
      initial || {
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
        billingAddress: { line1: "", line2: "", city: "", state: "", postcode: "", country: "" },
        contacts: [{ name: "", title: "", email: "", phone: "", isPrimary: true }],
      }
    );
  });

  React.useEffect(() => {
    if (open) {
      setSaving(false);
      setError("");
      setFieldErrors({});
      setForm(
        initial || {
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
          billingAddress: { line1: "", line2: "", city: "", state: "", postcode: "", country: "" },
          contacts: [{ name: "", title: "", email: "", phone: "", isPrimary: true }],
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const update = (patch: Partial<Client>) => setForm((f) => ({ ...f, ...patch }));
  const updateBillingAddress = (patch: Partial<Client["billingAddress"]>) =>
    setForm((f) => ({ ...f, billingAddress: { ...(f.billingAddress || {}), ...patch } }));
  const updateContact = (idx: number, patch: Partial<NonNullable<Client["contacts"]>[number]>) =>
    setForm((f) => {
      const arr = [...(f.contacts || [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...f, contacts: arr };
    });

  const addContact = () =>
    setForm((f) => ({ ...f, contacts: [...(f.contacts || []), { name: "", title: "", email: "", phone: "" }] }));
  const removeContact = (idx: number) =>
    setForm((f) => {
      const arr = [...(f.contacts || [])];
      arr.splice(idx, 1);
      return { ...f, contacts: arr };
    });

  // Simple client-side validation mirrors backend keys
  function localValidate(values: Client) {
    const errors: Record<string, string> = {};
    if (!values.legalName?.trim()) errors.legalName = "Required.";
    if (values.vatRegistered && !values.taxId?.trim()) errors.taxId = "Required when VAT Registered.";
    if (values.discountRate! < 0 || values.discountRate! > 100) errors.discountRate = "0 - 100.";
    // (We rely on server to validate enums/ emails too)
    return errors;
  }

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
      // Pull fieldErrors from callable if present
      const fe = (e?.details && e.details.fieldErrors) || {};
      setFieldErrors(fe);

      const message =
        e?.message || e?.details || e?.code || "Failed to save client. Check Functions logs for upsertClient.";
      setError(String(message));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = (name: string) =>
    `w-full bg-neutral-800 border rounded px-3 py-2 ${
      fieldErrors[name] ? "border-red-500" : "border-neutral-700"
    }`;

  return (
    <div className="fixed inset-0 z-20 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-neutral-900 text-white rounded-xl border border-neutral-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="text-lg font-semibold">{initial?.id ? "Edit Client" : "Add Client"}</div>
          <button className="text-neutral-400 hover:text-white text-sm" onClick={onClose} disabled={saving}>
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && <div className="text-red-400 text-sm border border-red-500/40 rounded p-2">{error}</div>}

          <section>
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Identity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Company Legal Name</label>
                <input
                  className={inputClass("legalName")}
                  value={form.legalName}
                  onChange={(e) => update({ legalName: e.target.value })}
                />
                {fieldErrors.legalName && <p className="text-xs text-red-400 mt-1">{fieldErrors.legalName}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Trading Name</label>
                <input
                  className={inputClass("tradingName")}
                  value={form.tradingName}
                  onChange={(e) => update({ tradingName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Industry</label>
                <select
                  className={inputClass("industry")}
                  value={form.industry || "TV"}
                  onChange={(e) => update({ industry: e.target.value as any })}
                >
                  <option>TV</option>
                  <option>Film</option>
                  <option>Music Video</option>
                  <option>Comercial</option>
                  <option>Other</option>
                </select>
                {fieldErrors.industry && <p className="text-xs text-red-400 mt-1">{fieldErrors.industry}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Website</label>
                <input
                  className={inputClass("website")}
                  value={form.website || ""}
                  onChange={(e) => update({ website: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Status</label>
                <select
                  className={inputClass("status")}
                  value={form.status || "Prospect"}
                  onChange={(e) => update({ status: e.target.value as any })}
                >
                  <option>Prospect</option>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
                {fieldErrors.status && <p className="text-xs text-red-400 mt-1">{fieldErrors.status}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Tier</label>
                <select
                  className={inputClass("tier")}
                  value={form.tier || "B"}
                  onChange={(e) => update({ tier: e.target.value as any })}
                >
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                </select>
                {fieldErrors.tier && <p className="text-xs text-red-400 mt-1">{fieldErrors.tier}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs mb-1 text-neutral-400">Tags (comma separated)</label>
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
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Compliance</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Tax / VAT ID</label>
                <input
                  className={inputClass("taxId")}
                  value={form.taxId || ""}
                  onChange={(e) => update({ taxId: e.target.value })}
                />
                {fieldErrors.taxId && <p className="text-xs text-red-400 mt-1">{fieldErrors.taxId}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Vendor Form URL</label>
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
                    onChange={(e) => update({ vatRegistered: e.target.checked })}
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
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Billing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Currency</label>
                <select
                  className={inputClass("currency")}
                  value={form.currency || "THB"}
                  onChange={(e) => update({ currency: e.target.value as any })}
                >
                  <option>THB</option>
                  <option>USD</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
                {fieldErrors.currency && <p className="text-xs text-red-400 mt-1">{fieldErrors.currency}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Payment Terms</label>
                <select
                  className={inputClass("paymentTerms")}
                  value={form.paymentTerms || "Net 30"}
                  onChange={(e) => update({ paymentTerms: e.target.value as any })}
                >
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Due on Receipt</option>
                </select>
                {fieldErrors.paymentTerms && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.paymentTerms}</p>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Discount Rate (%)</label>
                <input
                  type="number"
                  className={inputClass("discountRate")}
                  value={form.discountRate ?? 0}
                  onChange={(e) => update({ discountRate: Number(e.target.value) })}
                />
                {fieldErrors.discountRate && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.discountRate}</p>
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
                <label className="block text-xs mb-1 text-neutral-400">Billing Email(s)</label>
                <input
                  className={inputClass("billingEmails")}
                  value={arrayToCsv(form.billingEmails)}
                  onChange={(e) => update({ billingEmails: csvToArray(e.target.value) })}
                  placeholder="ap@client.com, finance@client.com"
                />
                {fieldErrors.billingEmails && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.billingEmails}</p>
                )}
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Address Line 1</label>
                <input
                  className={inputClass("billingAddress.line1")}
                  value={form.billingAddress?.line1 || ""}
                  onChange={(e) => updateBillingAddress({ line1: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Line 2</label>
                <input
                  className={inputClass("billingAddress.line2")}
                  value={form.billingAddress?.line2 || ""}
                  onChange={(e) => updateBillingAddress({ line2: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">City</label>
                <input
                  className={inputClass("billingAddress.city")}
                  value={form.billingAddress?.city || ""}
                  onChange={(e) => updateBillingAddress({ city: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">State/Province</label>
                <input
                  className={inputClass("billingAddress.state")}
                  value={form.billingAddress?.state || ""}
                  onChange={(e) => updateBillingAddress({ state: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Postcode</label>
                <input
                  className={inputClass("billingAddress.postcode")}
                  value={form.billingAddress?.postcode || ""}
                  onChange={(e) => updateBillingAddress({ postcode: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1 text-neutral-400">Country</label>
                <input
                  className={inputClass("billingAddress.country")}
                  value={form.billingAddress?.country || ""}
                  onChange={(e) => updateBillingAddress({ country: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Contacts</h3>
            <div className="space-y-3">
              {(form.contacts || []).map((c, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-neutral-800/50 border border-neutral-700 rounded p-3">
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
                    onChange={(e) => updateContact(idx, { title: e.target.value })}
                  />
                  <input
                    className={inputClass(`contacts.${idx}.email`)}
                    placeholder="Email"
                    value={c.email || ""}
                    onChange={(e) => updateContact(idx, { email: e.target.value })}
                  />
                  <input
                    className={inputClass(`contacts.${idx}.phone`)}
                    placeholder="Phone"
                    value={c.phone || ""}
                    onChange={(e) => updateContact(idx, { phone: e.target.value })}
                  />
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-neutral-300">
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={!!c.isPrimary}
                        onChange={(e) => updateContact(idx, { isPrimary: e.target.checked })}
                      />
                      Primary
                    </label>
                    <button className="text-xs text-red-400 hover:text-red-300" onClick={() => removeContact(idx)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button className="text-sm text-[#39FF14] hover:opacity-80" onClick={addContact}>
                + Add Contact
              </button>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800" disabled={saving}>
            Cancel
          </button>
          <button onClick={save} className="px-4 py-2 rounded bg-[#39FF14] text-black font-semibold hover:opacity-90 disabled:opacity-50" disabled={saving}>
            {saving ? "Saving…" : "Save Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Client Central (list + delete) ---------- */

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
      const call = httpsCallable(functions, "deleteClient"
