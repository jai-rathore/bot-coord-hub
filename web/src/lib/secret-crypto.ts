import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const PREFIX = "enc:v1";

function encryptionKey(): Buffer {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (configured) {
    if (/^[0-9a-f]{64}$/i.test(configured)) {
      return Buffer.from(configured, "hex");
    }
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
    return createHash("sha256").update(configured).digest();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
  }
  return createHash("sha256")
    .update(
      process.env.CLERK_SECRET_KEY ??
        "honeymatcha-development-token-encryption-key",
    )
    .digest();
}

export function encryptSecret(value: string): string {
  if (!value) return value;
  if (value.startsWith(`${PREFIX}:`)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  if (!value) return value;
  if (!value.startsWith(`${PREFIX}:`)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Unencrypted integration credential found; reconnect the integration",
      );
    }
    return value;
  }
  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("Encrypted credential is malformed");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(value: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  const parsed: unknown = JSON.parse(decryptSecret(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Encrypted JSON payload is malformed");
  }
  return parsed as Record<string, unknown>;
}
