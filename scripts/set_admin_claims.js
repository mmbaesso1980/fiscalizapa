const admin = require("firebase-admin");

admin.initializeApp({
  projectId: "fiscallizapa",
});

const uid = "X8cHski54Dd6FiHULRJSk3Mjbol2";

async function setAdmin() {
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    console.log(`Custom claims { admin: true } set for ${uid}`);
    process.exit(0);
  } catch (error) {
    console.error("Error setting custom claims:", error);
    process.exit(1);
  }
}

setAdmin();
