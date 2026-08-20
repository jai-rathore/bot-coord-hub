import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { LookupAddress, LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";

/**
 * Outbound webhook URL checks.
 *
 * Hostname string matching is not enough: IPv6-mapped literals
 * (`[::ffff:127.0.0.1]`) and DNS rebinding (safe at register, private at
 * fetch) both skip a prefix blocklist. Resolve once, then connect with a
 * lookup pinned to those addresses so `fetch` cannot ask DNS a second time.
 */

export type PinnedAddress = { address: string; family: 4 | 6 };

export type ResolvedCallback = {
  url: URL;
  addresses: PinnedAddress[];
};

const LOOPBACK_V4 = [0x7f000000, 8] as const;
const RFC1918 = [
  [0x0a000000, 8],
  [0xac100000, 12],
  [0xc0a80000, 16],
] as const;
const LINK_LOCAL_V4 = [0xa9fe0000, 16] as const;
const CGNAT_V4 = [0x64400000, 10] as const;
const THIS_NETWORK = [0x00000000, 8] as const;

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

function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, "");
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
  const host = normalizeHostname(ip);
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

  const host = normalizeHostname(parsed.hostname);
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

function addressAllowed(
  address: string,
  production: boolean,
): boolean {
  if (isBlockedIpAddress(address)) {
    return !production && isLoopbackOnly(address);
  }
  return true;
}

function toPinned(address: string): PinnedAddress | null {
  const host = normalizeHostname(address);
  const v4 = mappedIpv4(host) ?? host;
  const kind = isIP(v4);
  if (kind !== 4 && kind !== 6) return null;
  return { address: v4, family: kind };
}

export async function resolveSafeCallbackUrl(
  value: string,
  opts: {
    production?: boolean;
    resolve?: (hostname: string) => Promise<Array<{ address: string }>>;
  } = {},
): Promise<ResolvedCallback | null> {
  const production = opts.production ?? process.env.NODE_ENV === "production";
  if (!callbackUrlSyntaxAllowed(value, production)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const host = normalizeHostname(parsed.hostname);
  if (isIP(host) || mappedIpv4(host)) {
    if (!addressAllowed(host, production)) return null;
    const pinned = toPinned(host);
    return pinned ? { url: parsed, addresses: [pinned] } : null;
  }

  try {
    const resolve =
      opts.resolve ?? ((name: string) => lookup(name, { all: true }));
    const records = await resolve(host);
    const addresses: PinnedAddress[] = [];
    for (const row of records) {
      if (!addressAllowed(row.address, production)) return null;
      const pinned = toPinned(row.address);
      if (!pinned) return null;
      addresses.push(pinned);
    }
    if (addresses.length === 0) return null;
    return { url: parsed, addresses };
  } catch {
    return null;
  }
}

export async function isSafeCallbackUrl(
  value: string,
  opts: {
    production?: boolean;
    resolve?: (hostname: string) => Promise<Array<{ address: string }>>;
  } = {},
): Promise<boolean> {
  return Boolean(await resolveSafeCallbackUrl(value, opts));
}

/**
 * DNS lookup that never asks the network. Delivery must use this so a
 * hostname that was public at resolve time cannot rebound to a private IP.
 */
export function pinnedLookup(addresses: PinnedAddress[]) {
  return (
    hostname: string,
    options: LookupOptions | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void),
    callback?: (
      err: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    const cb =
      typeof options === "function"
        ? options
        : (callback as (
            err: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family?: number,
          ) => void);
    if (addresses.length === 0) {
      const err = Object.assign(
        new Error(`ENOTFOUND ${hostname}`),
        { code: "ENOTFOUND" },
      ) as NodeJS.ErrnoException;
      cb(err, "", 4);
      return;
    }
    if (typeof options !== "function" && options.all) {
      cb(
        null,
        addresses.map((row) => ({
          address: row.address,
          family: row.family,
        })),
      );
      return;
    }
    cb(null, addresses[0].address, addresses[0].family);
  };
}

export async function fetchResolvedCallback(
  resolved: ResolvedCallback,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  } = {},
): Promise<Response> {
  const lib = resolved.url.protocol === "https:" ? https : http;
  return await new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      resolved.url,
      {
        method: init.method ?? "GET",
        headers: init.headers,
        lookup: pinnedLookup(resolved.addresses),
        signal: init.signal,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              headers: res.headers as HeadersInit,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
