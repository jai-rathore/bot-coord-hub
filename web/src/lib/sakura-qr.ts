import QRCode from "qrcode";

/**
 * Palette for the sakura garden codes.
 *
 * Dark and light module colors are pinned to scanner-safe luminance: a phone
 * in a dim bar still has to read this, so the art is not allowed to drift
 * into mid-greys. Finder rings stay even darker / brighter than data tiles.
 */
export const SAKURA_QR = {
  dark: "#173f2e",
  darkDeep: "#10281d",
  darkBlossom: "#4a2432",
  light: "#fbf7ef",
  lightPure: "#fffdf8",
  plot: "#ebd6a4",
  cream: "#f6f1e7",
  stone: "#d4b056",
  bark: "#4a2c1a",
  barkDeep: "#2c1810",
  honey: "#c8922d",
  matcha: "#2f694a",
  matchaSoft: "#75a184",
  blossom: "#f3c1cc",
  blossomDeep: "#e8899e",
  blossomWhite: "#fff1f4",
  stamen: "#f3e0b8",
} as const;

/**
 * How the tree grows out of the matrix, matching tree.icqr.com:
 * dark modules near the centre become trunk, the mid-ring becomes canopy,
 * and the outer ring becomes grass. Light modules stay the dirt path.
 */
export const SAKURA_TREE = {
  trunkRadius: 2.6,
  canopyRadiusFactor: 0.46,
} as const;

export type SakuraTileKind = "finder" | "trunk" | "canopy" | "grass" | "plot";

export type SakuraStack = {
  row: number;
  col: number;
  layer: number;
  kind: "trunk" | "canopy";
  offsetX: number;
  offsetZ: number;
  scale: number;
};

export type SakuraQrMatrix = {
  size: number;
  version: number;
  dark: boolean[][];
  reserved: boolean[][];
  seed: number;
};

export type SakuraQrMountOptions = {
  url: string;
  reveal: boolean;
  reducedMotion: boolean;
  compact?: boolean;
};

export type SakuraQrMount = {
  setReveal: (reveal: boolean) => void;
  resize: () => void;
  capturePng: (mode?: "view" | "scan") => string;
  dispose: () => void;
};

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function encodeSakuraQr(url: string): SakuraQrMatrix {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const dark: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false),
  );

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      dark[row][col] = Boolean(qr.modules.get(row, col));
      reserved[row][col] = qr.modules.isReserved(row, col) !== 0;
    }
  }

  return {
    size,
    version: qr.version,
    dark,
    reserved,
    seed: hashSeed(url),
  };
}

export function isFinderModule(
  row: number,
  col: number,
  size: number,
): boolean {
  const inFinder = (localRow: number, localCol: number) =>
    localRow >= 0 && localRow < 7 && localCol >= 0 && localCol < 7;
  return (
    inFinder(row, col) ||
    inFinder(row, col - (size - 7)) ||
    inFinder(row - (size - 7), col)
  );
}

export function moduleDistanceFromCenter(
  row: number,
  col: number,
  size: number,
): number {
  const center = (size - 1) / 2;
  return Math.hypot(col - center, row - center);
}

export function classifySakuraTile(
  row: number,
  col: number,
  size: number,
  dark: boolean,
): SakuraTileKind {
  if (isFinderModule(row, col, size)) return "finder";
  if (!dark) return "plot";
  const dist = moduleDistanceFromCenter(row, col, size);
  if (dist < SAKURA_TREE.trunkRadius) return "trunk";
  if (dist < size * SAKURA_TREE.canopyRadiusFactor) return "canopy";
  return "grass";
}

export function planSakuraStacks(
  _matrix: SakuraQrMatrix,
  compact = false,
): SakuraStack[] {
  // Voxel stacks used to fill the air between the QR plot and the
  // canopy. The tree now sits on the matrix with a smooth trunk.
  void compact;
  return [];
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function relativeLuminance(hex: string): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") || canvas.getContext("webgl"),
    );
  } catch {
    return false;
  }
}
