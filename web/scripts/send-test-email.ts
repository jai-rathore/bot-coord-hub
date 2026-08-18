import "dotenv/config";
import { emailConfigured, sendTestEmail } from "../src/lib/events/notify";

async function main() {
  const to = process.argv[2]?.trim();
  if (!to || !to.includes("@")) {
    console.error("Usage: npm run email:test -- you@example.com");
    process.exit(1);
  }
  if (!emailConfigured()) {
    console.error("RESEND_API_KEY is not set. Add it and retry.");
    process.exit(2);
  }

  const id = await sendTestEmail(to);
  console.log(`sent test email to ${to}${id ? ` (id=${id})` : ""}`);
}

main().catch((error) => {
  console.error("email test failed:", error);
  process.exit(1);
});
