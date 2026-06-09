/**
 * Manual SMTP smoke test — calls the same notifier the alert evaluator uses.
 *   docker compose exec backend npx tsx src/scripts/testEmail.ts
 */
import { sendEmail } from "../services/notifier.js";

const to = process.argv[2] ?? "siddharthsivanathan4141@gmail.com";
await sendEmail(
  to,
  "[Stock Alert TEST] OLAELEC.NS rose 10.47%",
  "This was sent via the same notifier the alert evaluator uses.\n" +
    "If you got this, the email path is healthy.",
);
console.log("notifier returned — check inbox + spam folder");
