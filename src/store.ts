/**
 * JSON file persistence under data/. Survives restarts.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HubData } from "./types.js";
import { seedData } from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = join(__dirname, "..", "data");

export function getDataDir(): string {
  return process.env.BOT_COORD_DATA_DIR ?? DEFAULT_DATA_DIR;
}

export function getStorePath(): string {
  return join(getDataDir(), "store.json");
}

let cache: HubData | null = null;

function ensureDir(): void {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadStore(): HubData {
  if (cache) return cache;
  ensureDir();
  const storePath = getStorePath();
  if (!existsSync(storePath)) {
    cache = seedData();
    persistStore(cache);
    return cache;
  }
  const raw = readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw) as HubData;
  if (!parsed.version || !parsed.users?.length) {
    cache = seedData();
    persistStore(cache);
    return cache;
  }
  const seeded = seedData();
  for (const u of seeded.users) {
    if (!parsed.users.some((x) => x.userId === u.userId)) {
      parsed.users.push(u);
    }
  }
  for (const k of seeded.apiKeys) {
    if (!parsed.apiKeys.some((x) => x.key === k.key)) {
      parsed.apiKeys.push(k);
    }
  }
  cache = parsed;
  return cache;
}

export function persistStore(data: HubData = loadStore()): void {
  ensureDir();
  const storePath = getStorePath();
  const tmp = `${storePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, storePath);
  cache = data;
}

export function resetStore(): HubData {
  cache = seedData();
  persistStore(cache);
  return cache;
}

export function clearStoreCache(): void {
  cache = null;
}

export function mutateStore(fn: (data: HubData) => void): HubData {
  const data = loadStore();
  fn(data);
  persistStore(data);
  return data;
}

/** @deprecated use getDataDir/getStorePath */
export const DATA_DIR = DEFAULT_DATA_DIR;
export const STORE_PATH = join(DEFAULT_DATA_DIR, "store.json");
