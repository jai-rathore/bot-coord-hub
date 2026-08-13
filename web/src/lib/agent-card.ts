import { PRODUCT_VERSION } from "@/lib/discovery";

export function getAgentCard(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    name: "HoneyMatcha",
    description:
      "Helps agents handle cross-person coordination, private guest requests, and human-approved actions.",
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
    securityRequirements: [
      {
        schemes: {
          honeymatchaBearer: { list: [] },
        },
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
