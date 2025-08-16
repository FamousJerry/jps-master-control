import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { z } from "zod";

admin.initializeApp();
const db = admin.firestore();

// Helpers
const requireAuth = (ctx: functions.https.CallableContext) => {
  if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Auth required");
  if (ctx.auth.token.email_verified !== true) throw new functions.https.HttpsError("permission-denied", "Email not verified");
  return ctx.auth;
};
const requireRole = (ctx: functions.https.CallableContext, roles: string[]) => {
  const auth = requireAuth(ctx);
  const userRole = (auth.token as any).role;
  if (!roles.includes(userRole)) throw new functions.https.HttpsError("permission-denied", "Insufficient role");
  return auth;
};
const audit = async (actorUid: string, action: string, target: any) => {
  try { await db.collection("audits").add({ actorUid, action, target, at: admin.firestore.FieldValue.serverTimestamp() }); } catch {}
};

// Shared counter allocator
async function reserveNextClientId(): Promise<string> {
  const ref = db.collection("counters").doc("client");
  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data()!.current_value as number) : 100000;
    const n = current + 1;
    tx.set(ref, { current_value: n }, { merge: true });
    return n;
  });
  return `CL-${next}`;
}

// Callable: allocate a new client ID (Admin/Sales)
export const allocateClientId = functions.https.onCall(async (_data, ctx) => {
  requireRole(ctx, ["Admin", "Sales"]);
  const clientId = await reserveNextClientId();
  await audit(ctx.auth!.uid, "allocateClientId", { clientId });
  return { clientId };
});

// Callable: create/update client with validation
const ClientSchema = z.object({
  id: z.string().optional(),
  legalName: z.string().min(1),
  tradingName: z.string().optional(),
  industry: z.enum(["TV", "Film", "Events", "Corporate"]).default("Film"),
  taxId: z.string().optional(),
  contacts: z.array(z.object({
    name: z.string().min(1),
    title: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  })).default([]),
});

export const upsertClient = functions.https.onCall(async (data, ctx) => {
  const auth = requireRole(ctx, ["Admin", "Sales"]);
  const parsed = ClientSchema.safeParse(data);
  if (!parsed.success) {
    throw new functions.https.HttpsError("invalid-argument", JSON.stringify(parsed.error.issues));
  }
  const payload = parsed.data;
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (payload.id) {
    const { id, ...rest } = payload as any;
    await db.collection("clients").doc(id).set({ ...rest, updatedAt: now }, { merge: true });
    await audit(auth.uid, "client.update", { id });
    return { id };
  } else {
    const clientId = await reserveNextClientId();
    const doc = await db.collection("clients").add({ ...payload, clientId, createdAt: now, updatedAt: now, ownerUid: auth.uid });
    await audit(auth.uid, "client.create", { id: doc.id, clientId });
    return { id: doc.id, clientId };
  }
});

// Admin-only: set a user's role
export const setUserRole = functions.https.onCall(async (data, ctx) => {
  requireRole(ctx, ["Admin"]);
  const schema = z.object({ uid: z.string().min(10), role: z.enum(["Admin","Sales","Scheduler","Tech","Warehouse Manager","Warehouse Staff"]) });
  const { uid, role } = schema.parse(data);
  await admin.auth().setCustomUserClaims(uid, { role });
  await audit(ctx.auth!.uid, "user.setRole", { uid, role });
  return { ok: true };
});
