import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

setGlobalOptions({ region: "us-central1" }); // keep in sync with your web config
initializeApp();
const db = getFirestore();
const TS = () => FieldValue.serverTimestamp();

/* Helpers */
function requireAuth(ctx: { auth?: { uid: string } | null }) {
  if (!ctx.auth) throw new HttpsError("unauthenticated", "Sign in required.");
}
const sanitizeCsv = (v: any): string[] =>
  Array.isArray(v)
    ? v.map((x) => String(x).trim()).filter(Boolean)
    : String(v || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

const clampPct = (n: any) => {
  const v = Number(n ?? 0);
  return isNaN(v) ? 0 : Math.min(100, Math.max(0, v));
};

/* ===== Clients ===== */
const validateClient = (c: any) => {
  const fe: Record<string, string> = {};
  if (!String(c.legalName || "").trim()) fe.legalName = "Required.";
  if (c.vatRegistered && !String(c.taxId || "").trim())
    fe.taxId = "Required when VAT Registered.";
  if ((c.discountRate ?? 0) < 0 || (c.discountRate ?? 0) > 100)
    fe.discountRate = "0 - 100.";
  return fe;
};

export const upsertClient = onCall(async (req) => {
  requireAuth(req);
  const { id = null, client = {} } = req.data || {};
  const fieldErrors = validateClient(client);
  if (Object.keys(fieldErrors).length) {
    throw new HttpsError("invalid-argument", "Validation failed", { fieldErrors });
  }
  const payload = {
    legalName: String(client.legalName || ""),
    tradingName: String(client.tradingName || ""),
    website: String(client.website || ""),
    industry: client.industry || "TV",
    status: client.status || "Prospect",
    tier: client.tier || "B",
    tags: sanitizeCsv(client.tags),
    taxId: String(client.taxId || ""),
    vatRegistered: !!client.vatRegistered,
    ndaOnFile: !!client.ndaOnFile,
    vendorFormUrl: String(client.vendorFormUrl || ""),
    currency: client.currency || "THB",
    paymentTerms: client.paymentTerms || "Net 30",
    discountRate: clampPct(client.discountRate),
    poRequired: !!client.poRequired,
    billingEmails: sanitizeCsv(client.billingEmails),
    billingAddress: {
      line1: String(client?.billingAddress?.line1 || ""),
      line2: String(client?.billingAddress?.line2 || ""),
      city: String(client?.billingAddress?.city || ""),
      state: String(client?.billingAddress?.state || ""),
      postcode: String(client?.billingAddress?.postcode || ""),
      country: String(client?.billingAddress?.country || ""),
    },
    contacts: Array.isArray(client.contacts)
      ? client.contacts.map((c: any) => ({
          name: String(c?.name || ""),
          title: String(c?.title || ""),
          email: String(c?.email || ""),
          phone: String(c?.phone || ""),
          isPrimary: !!c?.isPrimary,
        }))
      : [],
    updatedAt: TS(),
  };

  if (id) {
    await db.collection("clients").doc(String(id)).set(payload, { merge: true });
    return { ok: true, id: String(id) };
  }

  const clientId = await db.runTransaction(async (trx) => {
    const ref = db.collection("counters").doc("client");
    const snap = await trx.get(ref);
    let current = 100000;
    if (snap.exists) current = Number(snap.get("current_value") || 100000);
    const next = current + 1;
    trx.set(ref, { current_value: next }, { merge: true });
    return `CL-${next}`;
  });

  const doc = await db.collection("clients").add({
    ...payload,
    clientId,
    createdAt: TS(),
  });
  return { ok: true, id: doc.id, clientId };
});

export const deleteClient = onCall(async (req) => {
  requireAuth(req);
  const { id } = req.data || {};
  if (!id) throw new HttpsError("invalid-argument", "id required");
  await db.collection("clients").doc(String(id)).delete();
  return { ok: true };
});

/* ===== Inventory ===== */
const validateItem = (i: any) => {
  const fe: Record<string, string> = {};
  if (!String(i.name || "").trim()) fe.name = "Required.";
  if ((i.quantity ?? 0) < 0) fe.quantity = ">= 0.";
  if ((i.unitCost ?? 0) < 0) fe.unitCost = ">= 0.";
  if ((i.rentalRate ?? 0) < 0) fe.rentalRate = ">= 0.";
  return fe;
};

export const upsertInventory = onCall(async (req) => {
  requireAuth(req);
  const { id = null, item = {} } = req.data || {};
  const fieldErrors = validateItem(item);
  if (Object.keys(fieldErrors).length) {
    throw new HttpsError("invalid-argument", "Validation failed", { fieldErrors });
  }
  const payload = {
    name: String(item.name || ""),
    sku: String(item.sku || ""),
    category: String(item.category || ""),
    location: String(item.location || ""),
    status: item.status || "Available",
    quantity: Number(item.quantity || 0),
    unitCost: Number(item.unitCost || 0),
    rentalRate: Number(item.rentalRate || 0),
    serialNumber: String(item.serialNumber || ""),
    tags: sanitizeCsv(item.tags),
    notes: String(item.notes || ""),
    updatedAt: TS(),
  };
  if (id) {
    await db.collection("inventory").doc(String(id)).set(payload, { merge: true });
    return { ok: true, id: String(id) };
  }
  const doc = await db.collection("inventory").add({ ...payload, createdAt: TS() });
  return { ok: true, id: doc.id };
});

export const deleteInventory = onCall(async (req) => {
  requireAuth(req);
  const { id } = req.data || {};
  if (!id) throw new HttpsError("invalid-argument", "id required");
  await db.collection("inventory").doc(String(id)).delete();
  return { ok: true };
});

/* ===== Sales ===== */
const validateSale = (s: any) => {
  const fe: Record<string, string> = {};
  if (!String(s.name || "").trim()) fe.name = "Required.";
  if ((s.amount ?? 0) < 0) fe.amount = ">= 0.";
  return fe;
};

export const upsertSale = onCall(async (req) => {
  requireAuth(req);
  const { id = null, sale = {} } = req.data || {};
  const fieldErrors = validateSale(sale);
  if (Object.keys(fieldErrors).length) {
    throw new HttpsError("invalid-argument", "Validation failed", { fieldErrors });
  }
  const payload = {
    name: String(sale.name || ""),
    clientId: String(sale.clientId || ""),
    stage: sale.stage || "Lead",
    amount: Number(sale.amount || 0),
    currency: sale.currency || "THB",
    closeDate: String(sale.closeDate || ""),
    ownerEmail: String(sale.ownerEmail || ""),
    tags: sanitizeCsv(sale.tags),
    notes: String(sale.notes || ""),
    updatedAt: TS(),
  };
  if (id) {
    await db.collection("sales").doc(String(id)).set(payload, { merge: true });
    return { ok: true, id: String(id) };
  }
  const doc = await db.collection("sales").add({ ...payload, createdAt: TS() });
  return { ok: true, id: doc.id };
});

export const deleteSale = onCall(async (req) => {
  requireAuth(req);
  const { id } = req.data || {};
  if (!id) throw new HttpsError("invalid-argument", "id required");
  await db.collection("sales").doc(String(id)).delete();
  return { ok: true };
});

/* ===== Bookings ===== */
const validateBooking = (b: any) => {
  const fe: Record<string, string> = {};
  if (!String(b.title || "").trim()) fe.title = "Required.";
  if (!String(b.start || "").trim()) fe.start = "Required.";
  if (!String(b.end || "").trim()) fe.end = "Required.";
  if (b.start && b.end && new Date(b.start).getTime() >= new Date(b.end).getTime())
    fe.end = "End must be after start.";
  return fe;
};

export const upsertBooking = onCall(async (req) => {
  requireAuth(req);
  const { id = null, booking = {} } = req.data || {};
  const fieldErrors = validateBooking(booking);
  if (Object.keys(fieldErrors).length) {
    throw new HttpsError("invalid-argument", "Validation failed", { fieldErrors });
  }
  const payload = {
    title: String(booking.title || ""),
    resourceName: String(booking.resourceName || ""),
    status: booking.status || "Tentative",
    start: String(booking.start || ""),
    end: String(booking.end || ""),
    clientId: String(booking.clientId || ""),
    location: String(booking.location || ""),
    notes: String(booking.notes || ""),
    updatedAt: TS(),
  };
  if (id) {
    await db.collection("bookings").doc(String(id)).set(payload, { merge: true });
    return { ok: true, id: String(id) };
  }
  const doc = await db.collection("bookings").add({ ...payload, createdAt: TS() });
  return { ok: true, id: doc.id };
});

export const deleteBooking = onCall(async (req) => {
  requireAuth(req);
  const { id } = req.data || {};
  if (!id) throw new HttpsError("invalid-argument", "id required");
  await db.collection("bookings").doc(String(id)).delete();
  return { ok: true };
});
