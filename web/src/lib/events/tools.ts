/**
 * Tool schemas and the role authorization matrix.
 *
 * Authorization is enforced here and in turn.ts against the caller's real
 * role, before any write. A model that emits an organizer-only tool inside a
 * participant turn gets a rejected call and a logged anomaly — the prompt is
 * never what stops it.
 */

import type { LlmToolDef } from "@/lib/llm";

export type EventToolRole = "participant" | "organizer";

export const PARTICIPANT_TOOLS = [
  "set_option_preference",
  "set_attendance",
  "propose_option",
  "ask_organizer",
  "reply",
] as const;

export const ORGANIZER_TOOLS = [
  "add_option",
  "extend_deadline",
  "reply",
] as const;

/** Tools no agent may ever call — they are the human's own buttons. */
export const HUMAN_ONLY_ACTIONS = [
  "lock_event",
  "cancel_event",
  "confirm_event",
  "book_calendar",
  "rotate_share_link",
] as const;

export function allowedToolsFor(role: EventToolRole): readonly string[] {
  return role === "organizer" ? ORGANIZER_TOOLS : PARTICIPANT_TOOLS;
}

export function isToolAllowed(role: EventToolRole, name: string): boolean {
  return allowedToolsFor(role).includes(name);
}

const REPLY: LlmToolDef = {
  name: "reply",
  description:
    "Say something back to the person. Two or three sentences at most. Always call this.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "What to say." },
    },
    required: ["text"],
  },
};

export function participantToolDefs(allowProposals: boolean): LlmToolDef[] {
  const tools: LlmToolDef[] = [
    {
      name: "set_option_preference",
      description:
        "Record this person's preference for one option. Use the exact option id from the context.",
      parameters: {
        type: "object",
        properties: {
          optionId: { type: "string", description: "The option id." },
          value: {
            type: "string",
            enum: ["yes", "no", "maybe"],
            description: "Their preference.",
          },
        },
        required: ["optionId", "value"],
      },
    },
    {
      name: "set_attendance",
      description:
        "Record whether this person is coming at all, independent of any specific option.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string", enum: ["yes", "no", "maybe"] },
        },
        required: ["value"],
      },
    },
    {
      name: "ask_organizer",
      description:
        "Pass a question to the organizer when you cannot answer it from the event itself.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question, in their words." },
        },
        required: ["question"],
      },
    },
    REPLY,
  ];

  if (allowProposals) {
    tools.splice(2, 0, {
      name: "propose_option",
      description:
        "Suggest another time when none of the listed options work. Only for times the person actually named. Give startsAt for a time, or label for a place.",
      parameters: {
        type: "object",
        properties: {
          startsAt: {
            type: "string",
            description: "ISO 8601 start time, e.g. 2026-09-01T18:00:00Z.",
          },
          label: { type: "string", description: "Label, for a place suggestion." },
        },
      },
    });
  }

  return tools;
}

export function organizerToolDefs(): LlmToolDef[] {
  return [
    {
      name: "add_option",
      description:
        "Add another time or place to the event. Give startsAt for a time, or label for a place.",
      parameters: {
        type: "object",
        properties: {
          startsAt: { type: "string", description: "ISO 8601 start time." },
          label: { type: "string", description: "Label, for a place option." },
        },
      },
    },
    {
      name: "extend_deadline",
      description: "Move the response deadline to a later time.",
      parameters: {
        type: "object",
        properties: {
          deadlineAt: { type: "string", description: "ISO 8601 timestamp." },
        },
        required: ["deadlineAt"],
      },
    },
    REPLY,
  ];
}
