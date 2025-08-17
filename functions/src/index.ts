import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
admin.initializeApp();

const db = admin.firestore();

const now = () => admin.firestore.FieldValue.serverTimestamp();

function toStr(v: any): string {
  return (v ?? "").toString().trim();
}
function normalizeTaxId(s?: string) {
  return toStr(s).toUpperCase();
}
/** Firestore doc IDs cannot contain "/" — sanitize the index key */
function sanitizeKey(s?: string) {
  return normalizeTaxId(s).replace(/\//g, "_");
}

export const upsertClient = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  }

  try {
    const payload = (data?.client || {}) as Record<string, any>;
    const editingId = (data?.id || null) as string | null;
    const userEmail = (context.auth.token.email as string) || null;

    // Coerce/clean inputs so we never write undefined
    const clean = {
      legalName: toStr(payload.legalName),
      tradingName: toStr(payload.tradingName),
      website: toStr(payload.website),
      industry: toStr(payload.industry),
      status: toStr(payload.status || "Prospect"),
      tier: toStr(payload.tier || "B"),
      tags: Array.isArray(payload.tags) ? payload.tags.map(toStr).filter(Boolean) : [],

      taxId: toStr(payload.taxId),
      vatRegistered: !!payload.vatRegistered,
      ndaOnFile: !!payload.ndaOnFile,
      vendorFormUrl: toStr(payload.vendorFormUrl),

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
      currency: toStr(payload.currency || "THB"),
      paymentTerms: toStr(payload.paymentTerms || "Net 30"),
      discountRate: Number.isFinite(Number(payload.discountRate))
        ? Number(payload.discountRate)
        : 0,
      poRequired: !!payload.poRequired,

      ownerEmail: toStr(payload.ownerEmail),
      watchers: Array.isArray(payload.watchers)
        ? payload.watchers.map(toStr).filter(Boolean)
        : [],

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

    // Business rule: if VAT registered, taxId is required
    if (clean.vatRegistered && !clean.taxId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Tax/VAT ID is required when VAT Registered is checked."
      );
    }

    const result = await db.runTransaction(async (tx) => {
      const newTaxKey = sanitizeKey(clean.taxId);
      const uniqueRef = newTaxKey ? db.collection("unique_taxIds").doc(newTaxKey) : null;

      if (editingId) {
        const clientRef = db.collection("clients").doc(editingId);
        const snap = await tx.get(clientRef);
        if (!snap.exists) {
          throw new functions.https.HttpsError("not-found", "Client does not exist.");
        }
        const prev = snap.data() || {};
        const prevTaxKey = sanitizeKey(prev.taxId);

        // Update unique index if taxId changed
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
        // Allocate sequential clientId: CL-100001+
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
    // If it's already an HttpsError, rethrow; otherwise wrap with a helpful message.
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError(
      "internal",
      err?.message || "Unexpected error while saving client."
    );
  }
});
