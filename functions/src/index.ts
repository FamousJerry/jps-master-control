import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

/** --- helpers --- */
function requireAuth(ctx: functions.https.CallableContext) {
  if (!ctx.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }
}

function cleanTagsCSV(csv?: string): string[] {
  if (!csv) return [];
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

const passthroughCodes = new Set([
  "invalid-argument",
  "unauthenticated",
  "permission-denied",
  "failed-precondition",
]);

function wrapCallable<T>(
  handler: (data: any, ctx: functions.https.CallableContext) => Promise<T>
) {
  return async (data: any, ctx: functions.https.CallableContext) => {
    try {
      requireAuth(ctx);
      return await handler(data, ctx);
    } catch (err: any) {
      // Log full details to Functions logs
      functions.logger.error("Callable failed", {
        error: err?.stack || err?.message || String(err),
        data: JSON.stringify(data ?? {}, null, 2).slice(0, 2000),
      });

      // Surface a useful message to the UI
      const msg =
        err?.message || err?.details || String(err) || "Unknown error";

      const code = passthroughCodes.has(err?.code)
        ? (err.code as functions.https.FunctionsErrorCode)
        : "internal";

      throw new functions.https.HttpsError(code, msg);
    }
  };
}

/** ================= Clients ================= */
export const upsertClient = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id, client } = data as { id?: string | null; client: any };
      if (!client || typeof client !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "client object is required"
        );
      }
      if (!client.legalName) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "legalName is required"
        );
      }

      const payload = {
        legalName: String(client.legalName),
        tradingName: client.tradingName ? String(client.tradingName) : "",
        industry: client.industry ? String(client.industry) : "TV",
        status: client.status ? String(client.status) : "Prospect",
        tier: client.tier ? String(client.tier) : "B",
        taxId: client.taxId ? String(client.taxId) : "",
        vatRegistered: !!client.vatRegistered,
        discountRate:
          client.discountRate === undefined
            ? 0
            : Number(client.discountRate || 0),
        tags: Array.isArray(client.tags) ? client.tags : cleanTagsCSV(client.tags),
        updatedAt: now,
      };

      if (id) {
        await db.collection("clients").doc(id).set(payload, { merge: true });
        return { ok: true, id };
      } else {
        const doc = await db.collection("clients").add({
          ...payload,
          createdAt: now,
        });
        return { ok: true, id: doc.id };
      }
    })
  );

export const deleteClient = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id } = data as { id: string };
      if (!id) {
        throw new functions.https.HttpsError("invalid-argument", "id required");
      }
      await db.collection("clients").doc(id).delete();
      return { ok: true };
    })
  );

/** ================= Inventory ================= */
export const upsertInventory = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id, item } = data as { id?: string | null; item: any };
      if (!item || typeof item !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "item object is required"
        );
      }
      if (!item.name) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "name is required"
        );
      }

      const payload = {
        name: String(item.name),
        quantity:
          item.quantity === undefined ? 0 : Number(item.quantity || 0),
        rentalRate:
          item.rentalRate === undefined ? 0 : Number(item.rentalRate || 0),
        updatedAt: now,
      };

      if (id) {
        await db.collection("inventory").doc(id).set(payload, { merge: true });
        return { ok: true, id };
      } else {
        const doc = await db.collection("inventory").add({
          ...payload,
          createdAt: now,
        });
        return { ok: true, id: doc.id };
      }
    })
  );

export const deleteInventory = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id } = data as { id: string };
      if (!id) {
        throw new functions.https.HttpsError("invalid-argument", "id required");
      }
      await db.collection("inventory").doc(id).delete();
      return { ok: true };
    })
  );

/** ================= Sales ================= */
export const upsertSale = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id, sale } = data as { id?: string | null; sale: any };
      if (!sale || typeof sale !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "sale object is required"
        );
      }
      if (!sale.name) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "name is required"
        );
      }

      const payload = {
        name: String(sale.name),
        amount: sale.amount === undefined ? 0 : Number(sale.amount || 0),
        stage: sale.stage ? String(sale.stage) : "Lead",
        updatedAt: now,
      };

      if (id) {
        await db.collection("sales").doc(id).set(payload, { merge: true });
        return { ok: true, id };
      } else {
        const doc = await db.collection("sales").add({
          ...payload,
          createdAt: now,
        });
        return { ok: true, id: doc.id };
      }
    })
  );

export const deleteSale = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id } = data as { id: string };
      if (!id) {
        throw new functions.https.HttpsError("invalid-argument", "id required");
      }
      await db.collection("sales").doc(id).delete();
      return { ok: true };
    })
  );

/** ================= Bookings ================= */
export const upsertBooking = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id, booking } = data as { id?: string | null; booking: any };
      if (!booking || typeof booking !== "object") {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "booking object is required"
        );
      }
      if (!booking.title) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "title is required"
        );
      }

      const payload = {
        title: String(booking.title),
        start: booking.start ? String(booking.start) : "",
        end: booking.end ? String(booking.end) : "",
        status: booking.status ? String(booking.status) : "Tentative",
        updatedAt: now,
      };

      if (id) {
        await db.collection("bookings").doc(id).set(payload, { merge: true });
        return { ok: true, id };
      } else {
        const doc = await db.collection("bookings").add({
          ...payload,
          createdAt: now,
        });
        return { ok: true, id: doc.id };
      }
    })
  );

export const deleteBooking = functions
  .region("us-central1")
  .https.onCall(
    wrapCallable(async (data) => {
      const { id } = data as { id: string };
      if (!id) {
        throw new functions.https.HttpsError("invalid-argument", "id required");
      }
      await db.collection("bookings").doc(id).delete();
      return { ok: true };
    })
  );
