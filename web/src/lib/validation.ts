import { AgentApiError } from "@/lib/agent-errors";

export const LIMITS = {
  peersPerTask: 8,
  scheduleWindowDays: 14,
  titleLength: 120,
  notesLength: 2_000,
  descriptionLength: 2_000,
  payloadBytes: 8_192,
  guestResponseBytes: 4_096,
  guestChoices: 8,
  guestSlots: 32,
} as const;

export function boundedText(
  value: unknown,
  field: string,
  maxLength: number,
  opts: { required?: boolean } = {},
): string | undefined {
  if (value == null) {
    if (opts.required) throw new AgentApiError(400, `${field} is required`);
    return undefined;
  }
  if (typeof value !== "string") {
    throw new AgentApiError(400, `${field} must be text`);
  }
  const text = value.trim();
  if (!text && opts.required) {
    throw new AgentApiError(400, `${field} is required`);
  }
  if (text.length > maxLength) {
    throw new AgentApiError(
      400,
      `${field} must be ${maxLength} characters or fewer`,
    );
  }
  return text || undefined;
}

export function assertPayloadSize(
  value: unknown,
  maxBytes: number = LIMITS.payloadBytes,
  field = "payload",
): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch {
    throw new AgentApiError(400, `${field} must be valid JSON`);
  }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
    throw new AgentApiError(413, `${field} is too large`);
  }
}

export function parseScheduleWindow(
  windowStart: unknown,
  windowEnd: unknown,
): { start: Date; end: Date } {
  if (typeof windowStart !== "string" || typeof windowEnd !== "string") {
    throw new AgentApiError(400, "windowStart and windowEnd are required");
  }
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AgentApiError(400, "Scheduling window must use ISO datetimes");
  }
  if (end <= start) {
    throw new AgentApiError(400, "windowEnd must be after windowStart");
  }
  const maxMs = LIMITS.scheduleWindowDays * 24 * 60 * 60 * 1_000;
  if (end.getTime() - start.getTime() > maxMs) {
    throw new AgentApiError(
      400,
      `Scheduling window cannot exceed ${LIMITS.scheduleWindowDays} days`,
    );
  }
  return { start, end };
}

export function assertPeerCount(count: number): void {
  if (count < 1) {
    throw new AgentApiError(400, "At least one participant is required");
  }
  if (count > LIMITS.peersPerTask) {
    throw new AgentApiError(
      400,
      `A task can include at most ${LIMITS.peersPerTask} other people`,
    );
  }
}

export function assertUuid(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AgentApiError(400, `${field} must be a UUID`);
  }
  return value;
}
