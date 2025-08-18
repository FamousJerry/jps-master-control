// functions/src/index.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

const ALLOWED_ROLES = new Set(["Admin", "Manager"]);
const STATUS = ["Prospect", "Active", "Inactive"];
const INDUSTRY = ["TV", "Film", "Music Video", "Commercial", "Other"];
const TIER = ["A", "B", "C"];

function assertRole(ctx: Parameters<ReturnType<typeof onCall>>[0]) {
  const role = (ctx.auth?.token?.role ?? "") as string;
  if (!role || !ALLOWED_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Requires Admin or Manager role.");
  }
  return role;
}

export const upsertClient = onCall({ region: "us-central1" }, async (req) => {
  // auth gate (clear message if you’re missing claims)
  assertRole(req);

  const d = req.data ?? {};
  const problems: string[] = [];

  const needStr = (k: string) => {
    const v = (d[k] ?? "").toString().trim();
    if (!v) problems.push(`${k} is required`);
    return v;
  };

  // required inputs
  const legalName = needStr("legalName");
  const tradingName = (d.tradingName ?? "").toString().trim();
  const industry = needStr("industry");
  const status = needStr("status");
  const tier = needStr("tier");
  const tagsRaw = (d.tags ?? "").toString();

  // enum validation
  if (!STATUS.includes(status)) problems.push(`status must be: ${STATUS.join(", ")}`);
  if (!INDUSTRY.includes(industry)) problems.push(`industry must be: ${INDUSTRY.join(", ")}`);
  if (!TIER.includes(tier)) problems.push(`tier must be: ${TIER.join(", ")}`);

  if (problems.length) {
    // this shows up in the UI as the exact message (no more “internal”)
    throw new HttpsError("failed-precondition", problems.join("; "));
  }

  const tagList = tagsRaw
    ? tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  try {
    const now = new Date();
    const uid = req.auth!.uid;

    // update vs create
    if (d.id) {
      const docRef = db.collection("clients").doc(d.id as string);
      await docRef.set(
        {
          legalName,
          tradingName,
          industry,
          status,
          tier,
          tags: tagList,
          updatedAt: now,
          updatedBy: uid,
        },
        { merge: true }
      );
      return { ok: true, id: docRef.id, mode: "update" };
    } else {
      // sequential CL- id via counters/client
      const counterRef = db.collection("counters").doc("client");
      const next = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        let n = 100001;
        if (snap.exists) n = (snap.data()!.current_value ?? 100000) + 1;
        tx.set(counterRef, { current_value: n }, { merge: true });
        return n;
      });

      const docRef = await db.collection("clients").add({
        legalName,
        tradingName,
        industry,
        status,
        tier,
        tags: tagList,
        clientId: `CL-${next}`,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      });
      return { ok: true, id: docRef.id, mode: "create" };
    }
  } catch (err: any) {
    console.error("upsertClient error", { uid: req.auth?.uid, data: req.data, err });
    // surface the actual message (still “internal” code, but readable message)
    throw new HttpsError("internal", err?.message || "Unexpected error while saving client.");
  }
});

export const deleteClient = onCall({ region: "us-central1" }, async (req) => {
  assertRole(req);
  const id = (req.data?.id ?? "").toString().trim();
  if (!id) throw new HttpsError("invalid-argument", "id is required.");
  try {
    await db.collection("clients").doc(id).delete();
    return { ok: true, id };
  } catch (err: any) {
    console.error("deleteClient error", { uid: req.auth?.uid, id, err });
    throw new HttpsError("internal", err?.message || "Unexpected error while deleting client.");
  }
});
