import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const now = () => admin.firestore.FieldValue.serverTimestamp();
const toStr = (v: any) => (v ?? "").toString().trim();
const up = (v: any) => toStr(v).toUpperCase();
/** Firestore doc IDs and index keys cannot contain "/" */
const keyify = (s?: string) => up(s).replace(/\//g, "_");

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const isEmail = (s?: string) => {
  const x = toStr(s);
  return !x || emailRe.test(x);
};

const ALLOWED = {
  client: {
    industry: ["TV", "FILM", "MUSIC VIDEO", "COMERCIAL", "OTHER"],
    status: ["PROSPECT", "ACTIVE", "INACTIVE"],
    tier: ["A", "B", "C"],
    currency: ["THB", "USD", "EUR", "GBP"],
    paymentTerms: ["NET 15", "NET 30", "NET 45", "DUE ON RECEIPT"],
  },
  inventory: {
    status: ["AVAILABLE", "OUT", "MAINTENANCE", "RETIRED"],
  },
  sales: {
    stage: ["LEAD", "QUALIFIED", "QUOTED", "WON", "LOST"],
    currency: ["THB", "USD", "EUR", "GBP"],
  },
  booking: {
    status: ["TENTATIVE", "CONFIRMED", "HOLD", "CANCELLED"],
  },
};

/* -------------------- CLIENTS -------------------- */

type CleanClient = {
  legalName: string;
  tradingName: string;
  website: string;

  industry: string;
  status: string;
  tier: string;
  tags: string[];

  taxId: string;
  vatRegistered: boolean;
  ndaOnFile: boolean;
  vendorFormUrl: string;

  currency: string;
  paymentTerms: string;
  discountRate: number;
  poRequired: boolean;

  billingEmails: string[];
  billingAddress: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };

  contacts: Array<{
    name: string;
    title: string;
    email: string;
    phone: string;
    isPrimary: boolean;
  }>;
};

function cleanClient(payload: any): CleanClient {
  return {
    legalName: toStr(payload.legalName),
    tradingName: toStr(payload.tradingName),
    website: toStr(payload.website),

    industry: up(payload.industry || "TV"),
    status: up(payload.status || "PROSPECT"),
    tier: up(payload.tier || "B"),
    tags: Array.isArray(payload.tags) ? payload.tags.map(toStr).filter(Boolean) : [],

    taxId: toStr(payload.taxId),
    vatRegistered: !!payload.vatRegistered,
    ndaOnFile: !!payload.ndaOnFile,
    vendorFormUrl: toStr(payload.vendorFormUrl),

    currency: up(payload.currency || "THB"),
    paymentTerms: up(payload.paymentTerms || "NET 30"),
    discountRate: Number.isFinite(Number(payload.discountRate)) ? Number(payload.discountRate) : 0,
    poRequired: !!payload.poRequired,

    billingEmails: Array.isArray(payload.billingEmails)
      ? payload.billingEmails.map(toStr).filter(Boolean)
      : [],
    billingAddress: {
      line1: toStr(payload.billingAddress?.line1),
      line2: toStr(payload.billingAddress?.line2),
      city: toStr(payload.billingAddress?.city),
      state: toStr(payload.billingAddress?.state),
      postcode: toStr(payload.billingAddress?.postcode),
      country: toStr(payload.billingAddress?.country),
    },

    contacts: Array.isArray(payload.contacts)
      ? payload.contacts.map((c: any) => ({
          name: toStr(c?.name),
          title: toStr(c?.title),
          email: toStr(c?.email),
          phone: toStr(c?.phone),
          isPrimary: !!c?.isPrimary,
        }))
      : [],
  };
}

function validateClient(c: CleanClient) {
  const fieldErrors: Record<string, string> = {};
  if (!c.legalName) fieldErrors.legalName = "Required.";
  if (!ALLOWED.client.industry.includes(c.industry)) fieldErrors.industry = "Invalid.";
  if (!ALLOWED.client.status.includes(c.status)) fieldErrors.status = "Invalid.";
  if (!ALLOWED.client.tier.includes(c.tier)) fieldErrors.tier = "Invalid.";
  if (c.vatRegistered && !c.taxId) fieldErrors.taxId = "Required when VAT Registered.";
  if (c.discountRate < 0 || c.discountRate > 100) fieldErrors.discountRate = "0–100.";
  if (!ALLOWED.client.currency.includes(c.currency)) fieldErrors.currency = "Invalid.";
  if (!ALLOWED.client.paymentTerms.includes(c.paymentTerms)) fieldErrors.paymentTerms = "Invalid.";
  for (const em of c.billingEmails) {
    if (!isEmail(em)) {
      fieldErrors.billingEmails = "One or more emails are invalid.";
      break;
    }
  }
  c.contacts.forEach((ct, i) => {
    if (ct.email && !isEmail(ct.email)) fieldErrors[`contacts.${i}.email`] = "Invalid email.";
  });
  return fieldErrors;
}

export const upsertClient = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const raw = data?.client ?? {};
    const editingId = (data?.id || null) as string | null;
    const userEmail = (context.auth.token.email as string) || null;

    const clean = cleanClient(raw);
    const fieldErrors = validateClient(clean);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed.", { fieldErrors });
    }

    const newTaxKey = keyify(clean.taxId);
    const uniqueRef = newTaxKey ? db.collection("unique_taxIds").doc(newTaxKey) : null;

    const result = await db.runTransaction(async (tx) => {
      if (editingId) {
        const clientRef = db.collection("clients").doc(editingId);
        const snap = await tx.get(clientRef);
        if (!snap.exists) throw new functions.https.HttpsError("not-found", "Client does not exist.");
        const prev = snap.data() || {};
        const prevTaxKey = keyify(prev.taxId);

        if (newTaxKey !== prevTaxKey) {
          if (newTaxKey && uniqueRef) {
            const uSnap = await tx.get(uniqueRef);
            if (uSnap.exists && uSnap.get("clientId") !== editingId) {
              throw new functions.https.HttpsError("already-exists", "Tax/VAT ID already used.");
            }
            tx.set(uniqueRef, { clientId: editingId, updatedAt: now() }, { merge: true });
          }
          if (prevTaxKey) tx.delete(db.collection("unique_taxIds").doc(prevTaxKey));
        }

        tx.update(clientRef, { ...clean, updatedAt: now(), updatedBy: userEmail });
        return { id: editingId };
      } else {
        const counterRef = db.collection("counters").doc("client");
        const cSnap = await tx.get(counterRef);
        const current = cSnap.exists ? (cSnap.data() as any).current_value ?? 100000 : 100000;
        const next = current + 1;
        tx.set(counterRef, { current_value: next }, { merge: true });

        const clientRef = db.collection("clients").doc();

        if (newTaxKey && uniqueRef) {
          const uSnap = await tx.get(uniqueRef);
          if (uSnap.exists) throw new functions.https.HttpsError("already-exists", "Tax/VAT ID already used.");
          tx.set(uniqueRef, { clientId: clientRef.id, createdAt: now() });
        }

        tx.set(clientRef, {
          ...clean,
          clientId: `CL-${next}`,
          createdAt: now(),
          createdBy: userEmail,
          updatedAt: now(),
          updatedBy: userEmail,
        });

        return { id: clientRef.id };
      }
    });

    return result;
  } catch (err: any) {
    console.error("upsertClient failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

export const deleteClient = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const id = toStr(data?.id);
    if (!id) throw new functions.https.HttpsError("invalid-argument", "Client id is required.");

    await db.runTransaction(async (tx) => {
      const ref = db.collection("clients").doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new functions.https.HttpsError("not-found", "Client not found.");
      const doc = snap.data() || {};
      const taxKey = keyify(doc.taxId);
      if (taxKey) tx.delete(db.collection("unique_taxIds").doc(taxKey));
      tx.delete(ref);
    });

    return { ok: true };
  } catch (err: any) {
    console.error("deleteClient failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

/* -------------------- INVENTORY -------------------- */

type CleanInventory = {
  name: string;
  sku: string;
  category: string;
  location: string;
  status: string; // AVAILABLE | OUT | MAINTENANCE | RETIRED
  quantity: number;
  unitCost: number;
  rentalRate: number;
  serialNumber: string;
  tags: string[];
  notes: string;
};

function cleanInventory(p: any): CleanInventory {
  return {
    name: toStr(p.name),
    sku: toStr(p.sku),
    category: toStr(p.category),
    location: toStr(p.location),
    status: up(p.status || "AVAILABLE"),
    quantity: Number.isFinite(Number(p.quantity)) ? Number(p.quantity) : 0,
    unitCost: Number.isFinite(Number(p.unitCost)) ? Number(p.unitCost) : 0,
    rentalRate: Number.isFinite(Number(p.rentalRate)) ? Number(p.rentalRate) : 0,
    serialNumber: toStr(p.serialNumber),
    tags: Array.isArray(p.tags) ? p.tags.map(toStr).filter(Boolean) : [],
    notes: toStr(p.notes),
  };
}

function validateInventory(i: CleanInventory) {
  const fe: Record<string, string> = {};
  if (!i.name) fe.name = "Required.";
  if (!ALLOWED.inventory.status.includes(i.status)) fe.status = "Invalid.";
  if (i.quantity < 0) fe.quantity = ">= 0.";
  if (i.unitCost < 0) fe.unitCost = ">= 0.";
  if (i.rentalRate < 0) fe.rentalRate = ">= 0.";
  return fe;
}

export const upsertInventory = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const raw = data?.item ?? {};
    const editingId = (data?.id || null) as string | null;
    const userEmail = (context.auth.token.email as string) || null;

    const clean = cleanInventory(raw);
    const fieldErrors = validateInventory(clean);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed.", { fieldErrors });
    }

    const skuKey = keyify(clean.sku);
    const skuRef = skuKey ? db.collection("unique_skus").doc(skuKey) : null;

    const res = await db.runTransaction(async (tx) => {
      if (editingId) {
        const ref = db.collection("inventory").doc(editingId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new functions.https.HttpsError("not-found", "Item not found.");
        const prev = snap.data() || {};
        const prevSkuKey = keyify(prev.sku);

        if (skuKey !== prevSkuKey) {
          if (skuKey && skuRef) {
            const u = await tx.get(skuRef);
            if (u.exists && u.get("itemId") !== editingId) {
              throw new functions.https.HttpsError("already-exists", "SKU already in use.");
            }
            tx.set(skuRef, { itemId: editingId, updatedAt: now() }, { merge: true });
          }
          if (prevSkuKey) tx.delete(db.collection("unique_skus").doc(prevSkuKey));
        }

        tx.update(ref, { ...clean, updatedAt: now(), updatedBy: userEmail });
        return { id: editingId };
      } else {
        const ref = db.collection("inventory").doc();
        if (skuKey && skuRef) {
          const u = await tx.get(skuRef);
          if (u.exists) throw new functions.https.HttpsError("already-exists", "SKU already in use.");
          tx.set(skuRef, { itemId: ref.id, createdAt: now() });
        }
        tx.set(ref, {
          ...clean,
          createdAt: now(),
          createdBy: userEmail,
          updatedAt: now(),
          updatedBy: userEmail,
        });
        return { id: ref.id };
      }
    });

    return res;
  } catch (err: any) {
    console.error("upsertInventory failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

export const deleteInventory = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const id = toStr(data?.id);
    if (!id) throw new functions.https.HttpsError("invalid-argument", "Item id is required.");
    await db.runTransaction(async (tx) => {
      const ref = db.collection("inventory").doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new functions.https.HttpsError("not-found", "Item not found.");
      const doc = snap.data() || {};
      const skuKey = keyify(doc.sku);
      if (skuKey) tx.delete(db.collection("unique_skus").doc(skuKey));
      tx.delete(ref);
    });
    return { ok: true };
  } catch (err: any) {
    console.error("deleteInventory failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

/* -------------------- SALES -------------------- */

type CleanSale = {
  name: string;
  clientId: string; // reference by id (string)
  stage: string; // LEAD|QUALIFIED|QUOTED|WON|LOST
  amount: number;
  currency: string;
  closeDate: admin.firestore.Timestamp | null;
  ownerEmail: string;
  tags: string[];
  notes: string;
};

function parseDateToTimestamp(v: any): admin.firestore.Timestamp | null {
  const s = toStr(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(d);
}

function cleanSale(p: any): CleanSale {
  return {
    name: toStr(p.name),
    clientId: toStr(p.clientId),
    stage: up(p.stage || "LEAD"),
    amount: Number.isFinite(Number(p.amount)) ? Number(p.amount) : 0,
    currency: up(p.currency || "THB"),
    closeDate: parseDateToTimestamp(p.closeDate),
    ownerEmail: toStr(p.ownerEmail),
    tags: Array.isArray(p.tags) ? p.tags.map(toStr).filter(Boolean) : [],
    notes: toStr(p.notes),
  };
}

function validateSale(s: CleanSale) {
  const fe: Record<string, string> = {};
  if (!s.name) fe.name = "Required.";
  if (!ALLOWED.sales.stage.includes(s.stage)) fe.stage = "Invalid stage.";
  if (s.amount < 0) fe.amount = ">= 0.";
  if (!ALLOWED.sales.currency.includes(s.currency)) fe.currency = "Invalid.";
  return fe;
}

export const upsertSale = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const raw = data?.sale ?? {};
    const editingId = (data?.id || null) as string | null;
    const userEmail = (context.auth.token.email as string) || null;

    const clean = cleanSale(raw);
    const fieldErrors = validateSale(clean);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed.", { fieldErrors });
    }

    if (editingId) {
      await db.collection("sales").doc(editingId).set(
        { ...clean, updatedAt: now(), updatedBy: userEmail },
        { merge: true }
      );
      return { id: editingId };
    } else {
      const ref = db.collection("sales").doc();
      await ref.set({
        ...clean,
        createdAt: now(),
        createdBy: userEmail,
        updatedAt: now(),
        updatedBy: userEmail,
      });
      return { id: ref.id };
    }
  } catch (err: any) {
    console.error("upsertSale failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

export const deleteSale = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const id = toStr(data?.id);
    if (!id) throw new functions.https.HttpsError("invalid-argument", "Sale id is required.");
    await db.collection("sales").doc(id).delete();
    return { ok: true };
  } catch (err: any) {
    console.error("deleteSale failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

/* -------------------- SCHEDULING (BOOKINGS) -------------------- */

type CleanBooking = {
  title: string;
  resourceName: string;
  status: string; // TENTATIVE|CONFIRMED|HOLD|CANCELLED
  start: admin.firestore.Timestamp | null;
  end: admin.firestore.Timestamp | null;
  clientId: string;
  location: string;
  notes: string;
};

function cleanBooking(p: any): CleanBooking {
  return {
    title: toStr(p.title),
    resourceName: toStr(p.resourceName),
    status: up(p.status || "TENTATIVE"),
    start: parseDateToTimestamp(p.start),
    end: parseDateToTimestamp(p.end),
    clientId: toStr(p.clientId),
    location: toStr(p.location),
    notes: toStr(p.notes),
  };
}

function validateBooking(b: CleanBooking) {
  const fe: Record<string, string> = {};
  if (!b.title) fe.title = "Required.";
  if (!ALLOWED.booking.status.includes(b.status)) fe.status = "Invalid status.";
  if (!b.start) fe.start = "Start is required.";
  if (!b.end) fe.end = "End is required.";
  if (b.start && b.end && b.start.toMillis() >= b.end.toMillis())
    fe.end = "End must be after start.";
  return fe;
}

export const upsertBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const raw = data?.booking ?? {};
    const editingId = (data?.id || null) as string | null;
    const userEmail = (context.auth.token.email as string) || null;

    const clean = cleanBooking(raw);
    const fieldErrors = validateBooking(clean);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed.", { fieldErrors });
    }

    if (editingId) {
      await db.collection("bookings").doc(editingId).set(
        { ...clean, updatedAt: now(), updatedBy: userEmail },
        { merge: true }
      );
      return { id: editingId };
    } else {
      const ref = db.collection("bookings").doc();
      await ref.set({
        ...clean,
        createdAt: now(),
        createdBy: userEmail,
        updatedAt: now(),
        updatedBy: userEmail,
      });
      return { id: ref.id };
    }
  } catch (err: any) {
    console.error("upsertBooking failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});

export const deleteBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  try {
    const id = toStr(data?.id);
    if (!id) throw new functions.https.HttpsError("invalid-argument", "Booking id is required.");
    await db.collection("bookings").doc(id).delete();
    return { ok: true };
  } catch (err: any) {
    console.error("deleteBooking failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});
