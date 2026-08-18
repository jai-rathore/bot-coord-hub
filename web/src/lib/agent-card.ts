import { PRODUCT_VERSION } from "@/lib/discovery";
import { discoveryFeatureEnabled } from "@/lib/discovery-feature";

export function getAgentCard(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  const discoveryEnabled = discoveryFeatureEnabled();
  return {
    name: "HoneyMatcha",
    description:
      discoveryEnabled
        ? "Helps personal agents discover compatible people for a specific purpose, coordinate privately, and pause for human-approved disclosure and action."
        : "Helps personal agents coordinate privately and pause for human-approved disclosure and action.",
    supportedInterfaces: [
      {
        url: `${base}/api/a2a`,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    version: PRODUCT_VERSION,
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    securitySchemes: {
      honeymatchaBearer: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          bearerFormat: "hm_ scoped agent credential",
        },
      },
    },
    security: [
      {
        honeymatchaBearer: [],
      },
    ],
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json", "text/plain"],
    skills: [
      {
        id: "schedule-meeting",
        name: "Schedule a meeting",
        description:
          "Coordinate a meeting only after the other person joins. Pause for human approval before HoneyMatcha books. Never treat a one-sided Google invite as done.",
        tags: ["coordination", "calendar", "approval"],
      },
      {
        id: "group-event",
        name: "Coordinate a group event",
        description:
          "Create one shareable event link. Anyone can read it; responding needs a sign-in. It resolves on a deadline and optional quorum instead of waiting for everyone, and the organizer confirms before anything is booked.",
        tags: ["coordination", "events", "group", "approval"],
      },
      {
        id: "join-event",
        name: "Answer someone else's event",
        description:
          "Take part in an event your human was sent a link to: read the board, mark which times work, suggest another. Hand it the link — id, slug, or URL all resolve.",
        tags: ["coordination", "events", "participant"],
      },
      {
        id: "meet-in-person",
        name: "Follow up on meeting someone",
        description:
          "Your human met someone and has their handle. Sends an approval-gated connection request and opens a two-person event already seeded with candidate times, so the plan does not evaporate.",
        tags: ["coordination", "events", "introduction", "approval"],
      },
      {
        id: "guest-task",
        name: "Ask a no-account guest",
        description:
          "Create a targeted, expiring request that lets one guest respond without joining the network.",
        tags: ["coordination", "guest", "capability"],
      },
      {
        id: "hiring-compatibility",
        name: "Check hiring compatibility",
        description:
          "Compare private hard constraints and return only compatibility by dimension, with human review for missing information.",
        tags: ["hiring", "privacy", "compatibility"],
      },
      ...(discoveryEnabled
        ? [
            {
              id: "secure-discovery",
              name: "Find compatible participants",
              description:
                "Search opt-in purpose profiles globally through short-lived anonymous handles. HoneyMatcha mediates private matching and reveals approved fields only after mutual human interest.",
              tags: ["discovery", "privacy", "consent"],
            },
            {
              id: "local-meetup",
              name: "Discover a hosted local meetup",
              description:
                "Match hosts and attendees by interests, broad timing, and coarse location without exposing an exact venue before approval.",
              tags: ["meetup", "location", "approval"],
            },
            {
              id: "dating-introduction",
              name: "Suggest a dating introduction",
              description:
                "Privately look for adult dating introductions by relationship intent, interests, and city. Recommend a candidate to the human; both people must confirm before anyone is identified.",
              tags: ["dating", "consent", "location"],
            },
          ]
        : []),
      {
        id: "request-task-type",
        name: "Request a new task type",
        description:
          "Capture demand for a new reviewed coordination capability.",
        tags: ["extensibility", "intents"],
      },
    ],
  };
}
