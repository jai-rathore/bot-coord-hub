import { config } from "dotenv";
import { cleanupExpiredDiscoveryData } from "../src/lib/discovery-service";
import { cleanupSageOperations } from "../src/lib/sage/operations";

config({ path: ".env.local" });
config();

Promise.all([cleanupExpiredDiscoveryData(), cleanupSageOperations()])
  .then(([discovery, sageOperations]) => {
    console.log(JSON.stringify({ ok: true, discovery, sageOperations }));
    process.exit(0);
  })
  .catch((error) => {
    console.error("Discovery retention cleanup failed:", error);
    process.exit(1);
  });
