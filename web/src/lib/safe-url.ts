import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Outbound webhook URL checks.
 *
 * Hostname string matching is not enough: IPv6-mapped literals
 * (`[::ffff:127.0.0.1]`) and DNS rebinding (safe at register, private at
 * fetch) both skip a prefix blocklist. Callers must resolve at fetch time.
 */

const LOOPBACK_V4 = [0x7f000000, 8] as const;
const RFC1918 = [
  [0x0a000000, 8],
  [0xac100000, 12],
  [0xc0a80000, 16],
] as const;
const LINK_LOCAL_V4 = [0xa9fe0000, 16] as const;
const CGNAT_V4 = [0x64400000, 10] as const;
const THIS_NETWORK = [0x00000000, 8] as const;
const TEST_NET = [
  [0xc0000200, 24],
  [0xc6336400, 24],
  [0xcb007100, 24],
] as const;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function inCidr(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function mappedIpv4(host: string): string | null {
  const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dotted) return dotted[1];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function isBlockedIpAddress(ip: string): boolean {
  const host = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = mappedIpv4(host);
  if (v4) return isBlockedIpAddress(v4);

  const kind = isIP(host);
  if (kind === 4) {
    const n = ipv4ToInt(host);
    if (n === null) return true;
    if (inCidr(n, LOOPBACK_V4[0], LOOPBACK_V4[1])) return true;
    if (inCidr(n, LINK_LOCAL_V4[0], LINK_LOCAL_V4[1])) return true;
    if (inCidr(n, CGNAT_V4[0], CGNAT_V4[1])) return true;
    if (inCidr(n, THIS_NETWORK[0], THIS_NETWORK[1])) return true;
    for (const [base, bits] of RFC1918) {
      if (inCidr(n, base, bits)) return true;
    }
    for (const [base, bits] of TEST_NET) {
      if (inCidr(n, base, bits)) return true;
    }
    return false;
  }
  if (kind === 6) {
    if (host === "::" || host === "::1") return true;
    if (host.startsWith("fe80:") || host.startsWith("feb")) return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    return false;
  }
  return true;
}

export function callbackUrlSyntaxAllowed(
  value: string,
  production = process.env.NODE_ENV === "production",
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (production && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return !production;
  }

  if (isIP(host) || mappedIpv4(host)) {
    if (isBlockedIpAddress(host)) return !production && isLoopbackOnly(host);
    return true;
  }
  return true;
}

function isLoopbackOnly(host: string): boolean {
  const v4 = mappedIpv4(host) ?? host;
  const n = ipv4ToInt(v4);
  if (n !== null) return inCidr(n, LOOPBACK_V4[0], LOOPBACK_V4[1]);
  return host === "::1" || host === "localhost";
}

export async function isSafeCallbackUrl(
  value: string,
  opts: {
    production?: boolean;
    resolve?: (hostname: string) => Promise<Array<{ address: string }>>;
  } = {},
): Promise<boolean> {
  const production = opts.production ?? process.env.NODE_ENV === "production";
  if (!callbackUrlSyntaxAllowed(value, production)) return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (isIP(host) || mappedIpv4(host)) {
    return !isBlockedIpAddress(host) || (!production && isLoopbackOnly(host));
  }

  try {
    const resolve = opts.resolve ?? ((name: string) => lookup(name, { all: true }));
    const addresses = await resolve(host);
    if (addresses.length === 0) return false;
    return addresses.every((row) => {
      if (isBlockedIpAddress(row.address)) {
        return !production && isLoopbackOnly(row.address);
      }
      return true;
    });
  } catch {
    return false;
  }
}
