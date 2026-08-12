import { ALL_SCOPES, IDS, type HubData } from "./types.js";

export function seedData(): HubData {
  const ts = "2026-08-11T18:00:00.000Z";
  return {
    version: 1,
    users: [
      {
        userId: IDS.JAI_USER,
        agentId: IDS.JAI_AGENT,
        displayName: "Jai Rathore",
        email: "jaiadityarathore@gmail.com",
        timezone: "America/Los_Angeles",
      },
      {
        userId: IDS.RISHAV_USER,
        agentId: IDS.RISHAV_AGENT,
        displayName: "Rishav",
        email: "sharmarishav5540@gmail.com",
        handle: "@rishavsharma12",
        timezone: "America/Los_Angeles",
      },
    ],
    apiKeys: [
      {
        key: IDS.JAI_KEY,
        userId: IDS.JAI_USER,
        agentId: IDS.JAI_AGENT,
        label: "Jai Chief of Staff (dev)",
      },
      {
        key: IDS.RISHAV_KEY,
        userId: IDS.RISHAV_USER,
        agentId: IDS.RISHAV_AGENT,
        label: "Rishav Chief of Staff (dev)",
      },
    ],
    links: [],
    sessions: [],
    inbox: [],
    audit: [
      {
        id: "aud_seed",
        ts,
        type: "hub.seed",
        detail: "Seeded users Jai + Rishav with dev API keys",
      },
    ],
  };
}

export { ALL_SCOPES, IDS };
