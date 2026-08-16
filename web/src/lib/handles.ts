export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;
export const HANDLE_PATTERN = /^[a-z][a-z0-9-]{2,29}$/;

/** First-party routes and product words that must never become public handles. */
export const RESERVED_HANDLES = new Set([
  "about",
  "activity",
  "admin",
  "a2a",
  "agent",
  "agents",
  "api",
  "app",
  "assets",
  "attention",
  "auth",
  "blog",
  "callback",
  "connect",
  "dashboard",
  "discovery",
  "docs",
  "favicon",
  "guest",
  "health",
  "help",
  "home",
  "honeymatcha",
  "inbox",
  "index",
  "intents",
  "invite",
  "join",
  "keys",
  "legal",
  "llms",
  "login",
  "mcp",
  "me",
  "openapi",
  "people",
  "privacy",
  "private",
  "profile",
  "profiles",
  "public",
  "register",
  "robots",
  "root",
  "safety",
  "schedule",
  "settings",
  "setup",
  "sign-in",
  "sign-up",
  "signin",
  "signup",
  "static",
  "status",
  "support",
  "tasks",
  "terms",
  "well-known",
  "www",
]);

/** Handles assigned to existing accounts and never claimable by anyone else. */
export const ASSIGNED_HANDLES: Record<string, string> = {
  jai: "jaiadityarathore@gmail.com",
};

export function normalizeHandle(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(normalizeHandle(handle));
}

export function assignedEmailForHandle(handle: string): string | null {
  return ASSIGNED_HANDLES[normalizeHandle(handle)] ?? null;
}

export function canClaimAssignedHandle(
  handle: string,
  email: string | null | undefined,
): boolean {
  const assigned = assignedEmailForHandle(handle);
  if (!assigned) return true;
  return (email ?? "").trim().toLowerCase() === assigned;
}

export function parseHandle(value: unknown): string | null {
  const handle = normalizeHandle(value);
  if (!HANDLE_PATTERN.test(handle)) return null;
  if (isReservedHandle(handle)) return null;
  return handle;
}

export function handleError(value: unknown, email?: string | null): string | null {
  const handle = normalizeHandle(value);
  if (!handle) return "Choose a handle";
  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return `Use ${HANDLE_MIN_LENGTH}–${HANDLE_MAX_LENGTH} characters`;
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return "Start with a letter. Use lowercase letters, numbers, or hyphens.";
  }
  if (isReservedHandle(handle)) {
    return "That handle is reserved by HoneyMatcha";
  }
  if (!canClaimAssignedHandle(handle, email)) {
    return "That handle is already reserved";
  }
  return null;
}

export function suggestHandle(source: string | null | undefined): string {
  const raw = (source ?? "")
    .trim()
    .toLowerCase()
    .split("@")[0]
    ?.replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, HANDLE_MAX_LENGTH);
  if (raw && HANDLE_PATTERN.test(raw) && !isReservedHandle(raw)) return raw;
  return "";
}

export function profileUrlForHandle(origin: string, handle: string): string {
  return `${origin.replace(/\/$/, "")}/${encodeURIComponent(handle)}`;
}

export function isPublicHandlePath(pathname: string): boolean {
  const segment = pathname.replace(/^\/+|\/+$/g, "");
  if (!segment || segment.includes("/")) return false;
  return parseHandle(segment) !== null;
}
