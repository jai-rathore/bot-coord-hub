import { cache } from "react";
import { listEventsWithUpdates as loadEventsWithUpdates } from "@/lib/events/updates";

/** Request-scoped so /app layout and the dashboard share one load. */
export const listEventsWithUpdates = cache(loadEventsWithUpdates);
