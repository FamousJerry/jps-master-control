import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const now = () => admin.firestore.FieldValue.serverTimestamp();

function toStr(v: any): string {
  return (v ?? "").toString().trim();
}
function up(v: any): string {
  return toStr(v).toUpperCase();
}
function keyify(s?: string) {
  return up(s).replace(/\//g, "_");
}

const ALLOWED = {
  industry: ["TV", "FILM", "MUSIC VIDEO", "COMERCIAL", "OTHER"],
  status: ["PROSPECT", "ACTIVE", "INACTIVE"],
  tier: ["A", "B", "C"],
  currency: ["THB", "USD", "EUR", "GBP"],
  paymentTerms: ["NET 15", "NET 30", "NET 45", "DUE ON RECEIPT"],
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
function isEmail(s?: string) {
  const x = toStr(s);
  return !x || emailRe.test(x);
}

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

function cleanPayload(payload: any): CleanClient {
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
    discountRate: Number.isFinite(Number(payload.discountRate))
      ? Number(payload.discountRate)
      : 0,
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
  if (!ALLOWED.industry.includes(c.industry))
    fieldErrors.industry = "Invalid industry.";
  if (!ALLOWED.status.includes(c.status))
    fieldErrors.status = "Invalid status.";
  if (!ALLOWED.tier.includes(c.tier)) fieldErrors.tier = "Invalid tier.";

  if (c.vatRegistered && !c.taxId)
    fieldErrors.taxId = "Required when VAT Registered is checked.";

  if (c.discountRate < 0 || c.discountRate > 100)
    fieldErrors.discountRate = "Must be between 0 and 100.";

  if (!ALLOWED.currency.includes(c.currency))
    fieldErrors.currency = "Invalid currency.";
  if (!ALLOWED.paymentTerms.includes(c.paymentTerms))
    fieldErrors.paymentTerms = "Invalid terms.";

  for (const em of c.billingEmails) {
    if (!isEmail(em)) {
      fieldErrors.billingEmails = "One or more emails are invalid.";
      break;
    }
  }
  for (let i = 0; i < c.contacts.length; i++) {
    const em = c.contacts[i]?.email;
    if (em && !isEmail(em)) {
      fieldErrors[`contacts.${i}.email`] = "Invalid email.";
    }
  }

  return fieldErrors;
}

export const upsertClient = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }

  try {
    const raw = data?.client ?? {};
    const editingId = (data?.id || null) as string | null;
    const userEmail = (context.auth.token.email as string) || null;

    const clean = cleanPayload(raw);
    const fieldErrors = validateClient(clean);
    if (Object.keys(fieldErrors).length) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Validation failed.",
        { fieldErrors }
      );
    }

    const newTaxKey = keyify(clean.taxId);
    const uniqueRef = newTaxKey ? db.collection("unique_taxIds").doc(newTaxKey) : null;

    const result = await db.runTransaction(async (tx) => {
      if (editingId) {
        const clientRef = db.collection("clients").doc(editingId);
        const snap = await tx.get(clientRef);
        if (!snap.exists) {
          throw new functions.https.HttpsError("not-found", "Client does not exist.");
        }
        const prev = snap.data() || {};
        const prevTaxKey = keyify(prev.taxId);

        if (newTaxKey !== prevTaxKey) {
          if (newTaxKey && uniqueRef) {
            const uSnap = await tx.get(uniqueRef);
            if (uSnap.exists && uSnap.get("clientId") !== editingId) {
              throw new functions.https.HttpsError(
                "already-exists",
                "Tax/VAT ID is already in use by another client."
              );
            }
            tx.set(uniqueRef, { clientId: editingId, updatedAt: now() }, { merge: true });
          }
          if (prevTaxKey) {
            tx.delete(db.collection("unique_taxIds").doc(prevTaxKey));
          }
        }

        tx.update(clientRef, {
          ...clean,
          updatedAt: now(),
          updatedBy: userEmail,
        });
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
          if (uSnap.exists) {
            throw new functions.https.HttpsError(
              "already-exists",
              "Tax/VAT ID is already in use by another client."
            );
          }
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

/** Delete client and cleanup unique index */
export const deleteClient = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }
  try {
    const id = toStr(data?.id);
    if (!id) {
      throw new functions.https.HttpsError("invalid-argument", "Client id is required.");
    }

    await db.runTransaction(async (tx) => {
      const ref = db.collection("clients").doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new functions.https.HttpsError("not-found", "Client not found.");
      }
      const doc = snap.data() || {};
      const taxKey = keyify(doc.taxId);
      if (taxKey) {
        tx.delete(db.collection("unique_taxIds").doc(taxKey));
      }
      tx.delete(ref);
    });

    return { ok: true };
  } catch (err: any) {
    console.error("deleteClient failed:", err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError("internal", err?.message || "Unexpected error.");
  }
});
