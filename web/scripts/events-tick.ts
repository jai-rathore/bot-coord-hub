import "dotenv/config";
import { runEventsTick, purgeOldEventMessages } from "../src/lib/events/tick";
import {
  drainNotificationOutbox,
  emailConfigured,
  smsConfigured,
} from "../src/lib/events/notify";
import { eventsFeatureEnabled } from "../src/lib/events-feature";

async function main() {
  if (!eventsFeatureEnabled()) {
    console.log("Events are disabled (ENABLE_EVENTS). Nothing to do.");
    process.exit(0);
  }

  const tick = await runEventsTick();
  console.log(
    `events tick: scanned=${tick.scanned} locked=${tick.locked} expired=${tick.expired} reminders=${tick.remindersQueued}`,
  );

  const drain = await drainNotificationOutbox();
  console.log(
    `outbox: sent=${drain.sent} failed=${drain.failed} skipped=${drain.skipped}` +
      (emailConfigured() ? "" : " (email not configured — rows stay queued)") +
      (smsConfigured() ? "" : " (sms not configured — text rows stay queued)"),
  );

  const purged = await purgeOldEventMessages();
  if (purged > 0) console.log(`purged ${purged} old chat messages`);

  process.exit(0);
}

main().catch((error) => {
  console.error("events tick failed:", error);
  process.exit(1);
});
