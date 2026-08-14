import { config } from "dotenv";
import { cleanupExpiredDiscoveryData } from "../src/lib/discovery-service";

config({ path: ".env.local" });
config();

cleanupExpiredDiscoveryData()
  .then((result) => {
    console.log(JSON.stringify({ ok: true, ...result }));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Discovery retention cleanup failed:", error);
    process.exit(1);
  });
