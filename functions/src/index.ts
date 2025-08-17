import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();
const TS = admin.firestore.FieldValue.serverTimestamp;
const REGION = "us-central1";

/** Helpers */
function requireAuth(ctx: functions.https.CallableContext) {
  if (!ctx.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }
}

function sanitizeCsv(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string")
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function clampPct(n: any): number {
  const v = Number(n ?? 0);
  if (isNaN(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

function validateClient(input: any) {
  const fe: Record<string, string> = {};
  if (!String(input.legalName || "").trim()) fe.legalName = "Required.";
  if (input.vatRegistered && !String(input.taxId || "").trim())
    fe.taxId = "Required when VAT Registered.";
  if ((input.discountRate ?? 0) < 0 || (input.discountRate ?? 0) > 100)
    fe.discountRate = "0 - 100.";
  return fe;
}

/** CLIENTS */
export const upsertClient = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id = null, client = {} } = data || {};
    const fieldErrors = validateClient(client);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed", { fieldErrors });
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
      contacts: Array.isArray(client.contacts) ? client.contacts.map((c: any) => ({
        name: String(c?.name || ""),
        title: String(c?.title || ""),
        email: String(c?.email || ""),
        phone: String(c?.phone || ""),
        isPrimary: !!c?.isPrimary,
      })) : [],
      updatedAt: TS(),
    };

    if (id) {
      await db.collection("clients").doc(id).set(payload, { merge: true });
      return { ok: true, id };
    }

    // allocate sequential clientId CL-100001, CL-100002, ...
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

export const deleteClient = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id } = data || {};
    if (!id) throw new functions.https.HttpsError("invalid-argument", "id required");
    await db.collection("clients").doc(String(id)).delete();
    return { ok: true };
  });

/** INVENTORY */
function validateItem(input: any) {
  const fe: Record<string, string> = {};
  if (!String(input.name || "").trim()) fe.name = "Required.";
  if ((input.quantity ?? 0) < 0) fe.quantity = ">= 0.";
  if ((input.unitCost ?? 0) < 0) fe.unitCost = ">= 0.";
  if ((input.rentalRate ?? 0) < 0) fe.rentalRate = ">= 0.";
  return fe;
}

export const upsertInventory = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id = null, item = {} } = data || {};
    const fieldErrors = validateItem(item);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed", { fieldErrors });
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
      await db.collection("inventory").doc(id).set(payload, { merge: true });
      return { ok: true, id };
    }
    const doc = await db.collection("inventory").add({ ...payload, createdAt: TS() });
    return { ok: true, id: doc.id };
  });

export const deleteInventory = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id } = data || {};
    if (!id) throw new functions.https.HttpsError("invalid-argument", "id required");
    await db.collection("inventory").doc(String(id)).delete();
    return { ok: true };
  });

/** SALES */
function validateSale(input: any) {
  const fe: Record<string, string> = {};
  if (!String(input.name || "").trim()) fe.name = "Required.";
  if ((input.amount ?? 0) < 0) fe.amount = ">= 0.";
  return fe;
}

export const upsertSale = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id = null, sale = {} } = data || {};
    const fieldErrors = validateSale(sale);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed", { fieldErrors });
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
      await db.collection("sales").doc(id).set(payload, { merge: true });
      return { ok: true, id };
    }
    const doc = await db.collection("sales").add({ ...payload, createdAt: TS() });
    return { ok: true, id: doc.id };
  });

export const deleteSale = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id } = data || {};
    if (!id) throw new functions.https.HttpsError("invalid-argument", "id required");
    await db.collection("sales").doc(String(id)).delete();
    return { ok: true };
  });

/** BOOKINGS (Scheduling) */
function validateBooking(input: any) {
  const fe: Record<string, string> = {};
  if (!String(input.title || "").trim()) fe.title = "Required.";
  if (!String(input.start || "").trim()) fe.start = "Required.";
  if (!String(input.end || "").trim()) fe.end = "Required.";
  if (input.start && input.end && new Date(input.start).getTime() >= new Date(input.end).getTime()) {
    fe.end = "End must be after start.";
  }
  return fe;
}

export const upsertBooking = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id = null, booking = {} } = data || {};
    const fieldErrors = validateBooking(booking);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError("invalid-argument", "Validation failed", { fieldErrors });
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
      await db.collection("bookings").doc(id).set(payload, { merge: true });
      return { ok: true, id };
    }
    const doc = await db.collection("bookings").add({ ...payload, createdAt: TS() });
    return { ok: true, id: doc.id };
  });

export const deleteBooking = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    requireAuth(context);
    const { id } = data || {};
    if (!id) throw new functions.https.HttpsError("invalid-argument", "id required");
    await db.collection("bookings").doc(String(id)).delete();
    return { ok: true };
  });
