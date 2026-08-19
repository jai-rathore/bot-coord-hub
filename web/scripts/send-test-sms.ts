import "dotenv/config";
import { smsConfigured, sendTestSms } from "../src/lib/events/notify";

async function main() {
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error("Usage: npm run sms:test -- +15551234567");
    process.exit(1);
  }
  if (!smsConfigured()) {
    console.error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID).",
    );
    process.exit(2);
  }

  const id = await sendTestSms(to);
  console.log(`sent test text to ${to}${id ? ` (sid=${id})` : ""}`);
}

main().catch((error) => {
  console.error("sms test failed:", error);
  process.exit(1);
});
