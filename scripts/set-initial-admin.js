/* Run locally or in Cloud Shell with a service account key:
   export GOOGLE_APPLICATION_CREDENTIALS=/abs/path/service-account.json
   node scripts/set-initial-admin.js <UID>
*/
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
(async () => {
  const uid = process.argv[2];
  if (!uid) { console.error("Usage: node scripts/set-initial-admin.js <uid>"); process.exit(1); }
  await admin.auth().setCustomUserClaims(uid, { role: "Admin" });
  console.log(`Set role=Admin for uid=${uid}`);
})();
