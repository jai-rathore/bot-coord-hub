import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  classifySakuraTile,
  encodeSakuraQr,
  hexToRgb,
  mulberry32,
  planSakuraStacks,
  sakuraDisplayScale,
  sakuraFlattenStages,
  SAKURA_QR,
  SAKURA_SCAN,
  type SakuraQrMatrix,
  type SakuraQrMount,
  type SakuraQrMountOptions,
  type SakuraTileKind,
} from "./sakura-qr";

const QUIET = SAKURA_SCAN.quietModules + 0.45;
const ISO_YAW = Math.PI / 4;
const ISO_ELEV = Math.atan(1 / Math.sqrt(2));

type Tile = {
  index: number;
  row: number;
  col: number;
  dark: boolean;
  finder: boolean;
  kind: SakuraTileKind;
  height: number;
  color: THREE.Color;
  mergeColor: THREE.Color;
  scanColor: THREE.Color;
};

type Card = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  phase: number;
  spin: number;
  rx: number;
  ry: number;
  rz: number;
  billboard: boolean;
  color: THREE.Color;
  targetX: number;
  targetZ: number;
  mergeDelay: number;
};

type Petal = {
  x: number;
  y: number;
  z: number;
  bornX: number;
  bornY: number;
  bornZ: number;
  speed: number;
  drift: number;
  rx: number;
  ry: number;
  rz: number;
  spin: number;
  phase: number;
  scale: number;
};

function smoothstep(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function rgbColor(hex: string): THREE.Color {
  const [r, g, b] = hexToRgb(hex);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

function varyColor(color: THREE.Color, amount: number, rng: () => number): THREE.Color {
  const next = color.clone();
  const delta = (rng() - 0.5) * amount;
  next.offsetHSL(delta * 0.08, delta * 0.12, delta);
  next.r = Math.min(1, Math.max(0, next.r));
  next.g = Math.min(1, Math.max(0, next.g));
  next.b = Math.min(1, Math.max(0, next.b));
  return next;
}

function makeTexture(
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 256,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    paint(ctx, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function paintPetal(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size * 0.52);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.38);
  ctx.bezierCurveTo(size * 0.38, size * 0.12, size * 0.28, -size * 0.28, 0, -size * 0.08);
  ctx.bezierCurveTo(-size * 0.28, -size * 0.28, -size * 0.38, size * 0.12, 0, size * 0.38);
  const fill = ctx.createLinearGradient(0, -size * 0.3, 0, size * 0.38);
  fill.addColorStop(0, "#fff8f9");
  fill.addColorStop(0.45, "#ffd6e0");
  fill.addColorStop(1, "#f4a8b8");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 137, 158, 0.35)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.04);
  ctx.quadraticCurveTo(4, size * 0.12, 0, size * 0.3);
  ctx.stroke();
}

function paintFlower(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let i = 0; i < 5; i += 1) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i / 5) * Math.PI * 2 - Math.PI / 2);
    const gradient = ctx.createRadialGradient(0, -size * 0.18, 2, 0, -size * 0.18, size * 0.28);
    gradient.addColorStop(0, "#fff7f8");
    gradient.addColorStop(0.5, "#f7c4d0");
    gradient.addColorStop(1, "rgba(232, 148, 168, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.2, size * 0.11, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#f3e0b8";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.055, 0, Math.PI * 2);
  ctx.fill();
}

function paintLeaf(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.35);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.42);
  ctx.bezierCurveTo(size * 0.28, -size * 0.1, size * 0.22, size * 0.22, 0, size * 0.42);
  ctx.bezierCurveTo(-size * 0.22, size * 0.22, -size * 0.28, -size * 0.1, 0, -size * 0.42);
  const fill = ctx.createLinearGradient(-20, 0, 20, 0);
  fill.addColorStop(0, "#4e8a63");
  fill.addColorStop(0.5, "#8fbf96");
  fill.addColorStop(1, "#2f694a");
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "rgba(23, 63, 46, 0.35)";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.36);
  ctx.lineTo(0, size * 0.36);
  ctx.stroke();
}

function paintBlade(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.06);
  ctx.bezierCurveTo(size * 0.72, size * 0.4, size * 0.7, size * 0.75, size * 0.58, size * 0.96);
  ctx.lineTo(size * 0.42, size * 0.96);
  ctx.bezierCurveTo(size * 0.3, size * 0.75, size * 0.28, size * 0.4, size * 0.5, size * 0.06);
  const fill = ctx.createLinearGradient(0, 0, 0, size);
  fill.addColorStop(0, "#8fbf7a");
  fill.addColorStop(0.55, "#3d7a4e");
  fill.addColorStop(1, "#1f4a32");
  ctx.fillStyle = fill;
  ctx.fill();
}

function spriteMaterial(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    alphaTest: 0.18,
    toneMapped: false,
  });
}

function tileOrigin(size: number): number {
  return -(size - 1) / 2;
}

function addCard(
  cards: Card[],
  x: number,
  y: number,
  z: number,
  rng: () => number,
  color: THREE.Color,
): void {
  cards.push({
    x,
    y,
    z,
    sx: 0.72 + rng() * 0.7,
    sy: 0.82 + rng() * 0.75,
    phase: rng() * Math.PI * 2,
    spin: rng() * Math.PI * 2,
    rx: (rng() - 0.5) * 1.4,
    ry: rng() * Math.PI * 2,
    rz: (rng() - 0.5) * 1.2,
    billboard: rng() > 0.72,
    color,
    targetX: x,
    targetZ: z,
    mergeDelay: 0,
  });
}

function offsetFromSite(
  site: THREE.Vector3,
  rng: () => number,
  radius: number,
): { x: number; y: number; z: number } {
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(2 * rng() - 1);
  const r = radius * Math.pow(rng(), 0.55);
  return {
    x: site.x + r * Math.sin(phi) * Math.cos(theta),
    y: site.y + r * Math.cos(phi) * 0.55,
    z: site.z + r * Math.sin(phi) * Math.sin(theta),
  };
}

function sampleCanopy(
  rng: () => number,
  counts: { petals: number; flowers: number; leaves: number },
  sites: THREE.Vector3[],
  tips: THREE.Vector3[],
  petalColors: THREE.Color[],
  leafColors: THREE.Color[],
): { petals: Card[]; flowers: Card[]; leaves: Card[] } {
  const petals: Card[] = [];
  const flowers: Card[] = [];
  const leaves: Card[] = [];
  const along = sites.length ? sites : [new THREE.Vector3(0, 4, 0)];
  const ends = tips.length ? tips : along;

  function place(pool: THREE.Vector3[], radius: number) {
    return offsetFromSite(pool[Math.floor(rng() * pool.length)], rng, radius);
  }

  for (let i = 0; i < counts.petals; i += 1) {
    const p = place(i % 5 === 0 ? along : ends, 0.16 + rng() * 0.22);
    addCard(petals, p.x, p.y, p.z, rng, varyColor(petalColors[i % petalColors.length], 0.07, rng));
  }
  for (let i = 0; i < counts.flowers; i += 1) {
    const p = place(ends, 0.08 + rng() * 0.14);
    addCard(flowers, p.x, p.y, p.z, rng, varyColor(petalColors[(i + 2) % petalColors.length], 0.05, rng));
  }
  for (let i = 0; i < counts.leaves; i += 1) {
    const p = place(along, 0.07 + rng() * 0.13);
    addCard(leaves, p.x, p.y, p.z, rng, varyColor(leafColors[i % leafColors.length], 0.08, rng));
  }
  return { petals, flowers, leaves };
}

function assignMergeTargets(
  cards: Card[],
  tiles: Tile[],
  origin: number,
  treeScale: number,
  rng: () => number,
): void {
  const targets = tiles.filter((tile) => tile.dark && !tile.finder);
  if (targets.length === 0) return;
  const offset = Math.floor(rng() * targets.length);
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const tile = targets[(i * 37 + offset) % targets.length];
    card.targetX = (origin + tile.col) / treeScale;
    card.targetZ = (origin + tile.row) / treeScale;
    // A small deterministic stagger turns the crown into streams instead of
    // shrinking every blossom in a single mechanical pulse.
    card.mergeDelay = rng() * 0.22;
  }
}

function buildTrunk(
  rng: () => number,
  grid: number,
  high: boolean,
): {
  trunk: THREE.BufferGeometry;
  branches: THREE.BufferGeometry;
  tips: THREE.Vector3[];
  sites: THREE.Vector3[];
  height: number;
  crownY: number;
} {
  const trunkPieces: THREE.BufferGeometry[] = [];
  const branchPieces: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const root = new THREE.Group();
  const tipNodes: THREE.Object3D[] = [];
  const trunkRadius = Math.max(0.85, grid * 0.05);
  const trunkHeight = grid * 0.42;
  const radial = high ? 32 : 12;
  const branchRadial = high ? 16 : 8;

  let y = 0;
  let radius = trunkRadius;
  for (let i = 0; i < 12; i += 1) {
    const height = trunkHeight / 12;
    const nextRadius = radius * 0.88;
    dummy.position.set(Math.sin(i * 0.28) * 0.18, y + height / 2, Math.cos(i * 0.24) * 0.12);
    dummy.rotation.set((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.08);
    dummy.updateMatrix();
    const geo = new THREE.CylinderGeometry(nextRadius, radius, height, radial);
    geo.applyMatrix4(dummy.matrix);
    trunkPieces.push(geo);
    y += height * 0.96;
    radius = nextRadius;
  }
  const crownY = y;

  function grow(
    parent: THREE.Object3D,
    length: number,
    branchRadius: number,
    depth: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(branchRadius * 0.55, branchRadius, length, branchRadial),
    );
    mesh.position.y = length / 2;
    parent.add(mesh);
    const tip = new THREE.Group();
    tip.position.y = length;
    parent.add(tip);
    if (depth >= 6 || length < 0.55) {
      tipNodes.push(tip);
      return;
    }
    const count = depth < 2 ? 4 : depth < 4 ? 3 : rng() > 0.2 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const child = new THREE.Group();
      child.rotation.z = (i - (count - 1) / 2) * (0.42 + depth * 0.1) + (rng() - 0.5) * 0.12;
      child.rotation.y = rng() * Math.PI * 2;
      child.rotation.x = depth === 0 ? 0.42 + rng() * 0.28 : 0.48 + rng() * 0.7;
      tip.add(child);
      grow(child, length * (0.68 + rng() * 0.14), branchRadius * 0.74, depth + 1);
    }
  }

  const crown = new THREE.Group();
  crown.position.y = crownY;
  root.add(crown);
  grow(crown, trunkHeight * 0.34, trunkRadius * 0.46, 0);
  root.updateMatrixWorld(true);
  const tips = tipNodes.map((node) =>
    new THREE.Vector3().setFromMatrixPosition(node.matrixWorld),
  );
  const sites: THREE.Vector3[] = [];
  root.traverse((object: THREE.Object3D) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      geometry.translate(0, -crownY, 0);
      branchPieces.push(geometry);
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox;
      if (box) {
        for (let i = 0; i <= 5; i += 1) {
          const point = new THREE.Vector3(
            0,
            THREE.MathUtils.lerp(box.min.y, box.max.y, i / 5),
            0,
          );
          point.applyMatrix4(object.matrixWorld);
          sites.push(point);
        }
      }
      object.geometry.dispose();
    }
  });
  for (const tip of tips) sites.push(tip.clone());
  const trunk = mergeGeometries(trunkPieces) ?? new THREE.CylinderGeometry(0.2, 0.3, 1, radial);
  const branches = mergeGeometries(branchPieces) ?? new THREE.CylinderGeometry(0.12, 0.18, 1, branchRadial);
  for (const piece of trunkPieces) piece.dispose();
  for (const piece of branchPieces) piece.dispose();
  const height = tips.reduce((max, tip) => Math.max(max, tip.y), trunkHeight);
  return { trunk, branches, tips, sites, height, crownY };
}

function tileHeight(kind: SakuraTileKind, dark: boolean): number {
  if (kind === "finder") return dark ? 0.36 : 0.14;
  if (kind === "trunk") return 0.7;
  if (kind === "canopy") return 0.34;
  if (kind === "grass") return 0.44;
  return 0.12;
}

function gardenColor(
  kind: SakuraTileKind,
  dark: boolean,
  rng: () => number,
): THREE.Color {
  if (kind === "finder") {
    return varyColor(rgbColor(dark ? SAKURA_QR.darkDeep : SAKURA_QR.lightPure), 0.02, rng);
  }
  if (kind === "trunk") return varyColor(rgbColor(SAKURA_QR.bark), 0.04, rng);
  if (kind === "canopy") return varyColor(rgbColor(SAKURA_QR.darkBlossom), 0.05, rng);
  if (kind === "grass") return varyColor(rgbColor(SAKURA_QR.dark), 0.035, rng);
  return varyColor(rgbColor(SAKURA_QR.plot), 0.03, rng);
}

function buildTiles(matrix: SakuraQrMatrix, rng: () => number): Tile[] {
  const darkDeep = rgbColor(SAKURA_QR.darkDeep);
  const darkBlossom = rgbColor(SAKURA_QR.darkBlossom);
  const lightPure = rgbColor(SAKURA_QR.lightPure);
  const blossomLight = rgbColor(SAKURA_QR.blossomWhite);
  const tiles: Tile[] = [];
  let index = 0;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      const isDark = matrix.dark[row][col];
      const kind = classifySakuraTile(row, col, matrix.size, isDark);
      const finder = kind === "finder";
      tiles.push({
        index,
        row,
        col,
        dark: isDark,
        finder,
        kind,
        height: tileHeight(kind, isDark),
        color: gardenColor(kind, isDark, rng),
        mergeColor: isDark
          ? varyColor(finder ? darkDeep : darkBlossom, 0.04, rng)
          : varyColor(finder ? lightPure : blossomLight, 0.02, rng),
        scanColor: isDark ? darkDeep.clone() : lightPure.clone(),
      });
      index += 1;
    }
  }
  return tiles;
}

function buildRoots(
  tiles: Tile[],
  origin: number,
  rng: () => number,
): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const trunkTiles = tiles.filter((tile) => tile.kind === "trunk");
  const anchors = trunkTiles.length
    ? trunkTiles
    : tiles.filter((tile) => tile.kind === "canopy").slice(0, 8);

  for (const tile of anchors) {
    const x = origin + tile.col;
    const z = origin + tile.row;
    const length = Math.max(0.55, Math.hypot(x, z));
    dummy.position.set(x * 0.45, 0.16, z * 0.45);
    dummy.lookAt(x, 0.05, z);
    dummy.rotateX(Math.PI / 2);
    dummy.updateMatrix();
    const geo = new THREE.CylinderGeometry(0.1, 0.28, length, 6);
    geo.applyMatrix4(dummy.matrix);
    pieces.push(geo);
  }

  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + rng() * 0.4;
    const length = 1.4 + rng() * 1.8;
    dummy.position.set(Math.cos(angle) * 0.35, 0.12, Math.sin(angle) * 0.35);
    dummy.lookAt(Math.cos(angle) * length, 0.02, Math.sin(angle) * length);
    dummy.rotateX(Math.PI / 2);
    dummy.updateMatrix();
    const geo = new THREE.CylinderGeometry(0.05, 0.18, length, 5);
    geo.applyMatrix4(dummy.matrix);
    pieces.push(geo);
  }

  const flare = new THREE.ConeGeometry(1.15, 1.05, 8);
  flare.translate(0, 0.35, 0);
  pieces.push(flare);
  const merged = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return merged ?? new THREE.ConeGeometry(1.15, 1.05, 8);
}

function writeCards(
  mesh: THREE.InstancedMesh,
  cards: Card[],
  dummy: THREE.Object3D,
  camera: THREE.Camera,
  euler: THREE.Euler,
  time: number,
  live: number,
  wind: number,
  sink = 0,
  targetY = 0.14,
) {
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const staggered = smoothstep(
      (sink - card.mergeDelay) / Math.max(0.01, 1 - card.mergeDelay),
    );
    const sway =
      Math.sin(time * 1.85 + card.phase) * 0.08 * wind * (1 - staggered);
    dummy.position.set(
      THREE.MathUtils.lerp(card.x, card.targetX, staggered) + sway,
      THREE.MathUtils.lerp(
        card.y + Math.sin(time * 2.35 + card.phase * 1.2) * 0.04 * wind,
        targetY,
        staggered,
      ),
      THREE.MathUtils.lerp(card.z, card.targetZ, staggered) + sway * 0.45,
    );
    if (card.billboard) {
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(card.spin + Math.sin(time * 2.6 + card.phase) * 0.4 * wind);
    } else {
      euler.set(
        card.rx + Math.sin(time * 2.2 + card.phase) * 0.28 * wind,
        card.ry,
        card.rz + Math.cos(time * 1.9 + card.phase) * 0.34 * wind,
      );
      dummy.quaternion.setFromEuler(euler);
    }
    const shrink = live * THREE.MathUtils.lerp(1, 0.16, staggered);
    dummy.scale.set(card.sx * shrink, card.sy * shrink, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  if (cards.length === 0) {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export async function mountSakuraQrScene(
  canvas: HTMLCanvasElement,
  options: SakuraQrMountOptions,
): Promise<SakuraQrMount> {
  const matrix = encodeSakuraQr(options.url);
  const rng = mulberry32(matrix.seed);
  const n = matrix.size;
  const origin = tileOrigin(n);
  const compact = Boolean(options.compact);
  const high = !compact;
  const treeScale = compact ? 0.78 : 0.88;
  const tiles = buildTiles(matrix, rng);
  const stacks = planSakuraStacks(matrix, compact);
  const reduced = options.reducedMotion;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: high ? "high-performance" : "default",
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.setClearColor(rgbColor(SAKURA_QR.sky), 1);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = null;

  const spanBase = n / 2 + QUIET;
  const camera = new THREE.OrthographicCamera(-spanBase, spanBase, spanBase, -spanBase, 0.1, n * 12);
  const look = new THREE.Vector3();
  const euler = new THREE.Euler();
  let viewWidth = 1;
  let viewHeight = 1;

  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x4a6754, 1.15));
  const sun = new THREE.DirectionalLight(0xffe4b8, 2.15);
  sun.position.set(n * 0.85, n * 1.2, n * 0.4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xf4c4d0, 0.55);
  fill.position.set(-n * 0.6, n * 0.35, -n * 0.25);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xf7f1e6, 0.22));

  // A restrained set of stepped garden terraces gives the tree a world to
  // inhabit without competing with the matrix. Every plane follows the same
  // isometric ground axis and fades away before the exact scan plate appears.
  const backdrop = new THREE.Group();
  const backdropGeometries: THREE.BufferGeometry[] = [];
  const backdropMaterials: THREE.MeshStandardMaterial[] = [];
  const addTerrace = (
    width: number,
    height: number,
    y: number,
    color: string,
    roughness: number,
  ) => {
    const geometry = new RoundedBoxGeometry(width, height, width, high ? 3 : 1, 0.42);
    const material = new THREE.MeshStandardMaterial({
      color: rgbColor(color),
      roughness,
      metalness: 0,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    backdrop.add(mesh);
    backdropGeometries.push(geometry);
    backdropMaterials.push(material);
  };
  addTerrace(n + 12, 0.34, -1.12, SAKURA_QR.water, 0.48);
  addTerrace(n + 8.5, 0.5, -0.78, SAKURA_QR.terraceEdge, 0.76);
  addTerrace(n + 6.5, 0.54, -0.4, SAKURA_QR.terrace, 0.88);
  scene.add(backdrop);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(n * 0.32, 24),
    new THREE.MeshBasicMaterial({
      color: rgbColor(SAKURA_QR.dark),
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  scene.add(shadow);

  const tileGeo = new RoundedBoxGeometry(0.94, 1, 0.94, high ? 3 : 1, 0.12);
  const tileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02,
  });
  const tileMesh = new THREE.InstancedMesh(tileGeo, tileMat, tiles.length);
  tileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(tileMesh);

  const dummy = new THREE.Object3D();
  const mix = new THREE.Color();
  const clearColor = rgbColor(SAKURA_QR.sky);
  const scanClearColor = rgbColor(SAKURA_QR.lightPure);
  const clearMix = new THREE.Color();

  // Decorative rounded modules are allowed during the garden view. The final
  // frame swaps to a separate, perfectly square matrix with an opaque four-
  // module quiet zone, so low-end cameras do not have to interpret the art.
  const scanPlateGeo = new THREE.PlaneGeometry(
    n + SAKURA_SCAN.quietModules * 2,
    n + SAKURA_SCAN.quietModules * 2,
  );
  const scanPlateMat = new THREE.MeshBasicMaterial({
    color: rgbColor(SAKURA_QR.lightPure),
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const scanPlate = new THREE.Mesh(scanPlateGeo, scanPlateMat);
  scanPlate.rotation.x = -Math.PI / 2;
  scanPlate.position.y = 1.02;
  scanPlate.renderOrder = 20;
  scanPlate.visible = false;
  scene.add(scanPlate);

  const scanModuleGeo = new THREE.PlaneGeometry(1.002, 1.002);
  const scanModuleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const scanModuleMesh = new THREE.InstancedMesh(
    scanModuleGeo,
    scanModuleMat,
    tiles.length,
  );
  scanModuleMesh.renderOrder = 21;
  scanModuleMesh.visible = false;
  for (const tile of tiles) {
    dummy.position.set(origin + tile.col, 1.04, origin + tile.row);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    scanModuleMesh.setMatrixAt(tile.index, dummy.matrix);
    scanModuleMesh.setColorAt(tile.index, tile.scanColor);
  }
  scanModuleMesh.instanceMatrix.needsUpdate = true;
  if (scanModuleMesh.instanceColor) {
    scanModuleMesh.instanceColor.needsUpdate = true;
  }
  scene.add(scanModuleMesh);
  const stackGeo = new RoundedBoxGeometry(0.86, 1, 0.86, high ? 2 : 1, 0.12);
  const stackMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.02,
  });
  const stackMesh = new THREE.InstancedMesh(
    stackGeo,
    stackMat,
    Math.max(1, stacks.length),
  );
  stackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const trunkBark = rgbColor(SAKURA_QR.bark);
  const trunkBarkDeep = rgbColor(SAKURA_QR.barkDeep);
  const canopyPinks = [
    rgbColor(SAKURA_QR.blossom),
    rgbColor(SAKURA_QR.blossomDeep),
    rgbColor("#ffe8ee"),
    rgbColor("#f6d0c6"),
  ];
  stacks.forEach((stack, index) => {
    stackMesh.setColorAt(
      index,
      stack.kind === "trunk"
        ? varyColor(stack.layer > 5 ? trunkBarkDeep : trunkBark, 0.05, rng)
        : varyColor(canopyPinks[index % canopyPinks.length], 0.06, rng),
    );
  });
  if (stackMesh.instanceColor) stackMesh.instanceColor.needsUpdate = true;
  scene.add(stackMesh);

  function writeTiles(amount: number, scan: boolean) {
    for (const tile of tiles) {
      const height = THREE.MathUtils.lerp(tile.height, tile.dark ? 0.18 : 0.08, amount);
      dummy.position.set(origin + tile.col, height / 2, origin + tile.row);
      dummy.scale.set(1, height, 1);
      dummy.quaternion.identity();
      dummy.updateMatrix();
      tileMesh.setMatrixAt(tile.index, dummy.matrix);
      const colorT =
        tile.kind === "trunk" ? Math.min(1, amount * 1.35) : amount;
      mix.copy(tile.color).lerp(scan ? tile.scanColor : tile.mergeColor, colorT);
      tileMesh.setColorAt(tile.index, mix);
    }
    tileMesh.instanceMatrix.needsUpdate = true;
    if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
  }

  function writeStacks(amount: number, scan: boolean) {
    const live = scan ? 0 : Math.max(0, 1 - amount);
    stackMesh.visible = stacks.length > 0 && live > 0.04;
    if (!stackMesh.visible) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      stackMesh.setMatrixAt(0, dummy.matrix);
      stackMesh.instanceMatrix.needsUpdate = true;
      return;
    }
    for (let i = 0; i < stacks.length; i += 1) {
      const stack = stacks[i];
      const rise = (0.28 + stack.layer * 0.86) * live;
      dummy.position.set(
        origin + stack.col + stack.offsetX,
        rise,
        origin + stack.row + stack.offsetZ,
      );
      dummy.scale.set(
        stack.scale,
        Math.max(0.04, stack.scale * 0.84 * live),
        stack.scale,
      );
      dummy.quaternion.identity();
      dummy.updateMatrix();
      stackMesh.setMatrixAt(i, dummy.matrix);
    }
    stackMesh.instanceMatrix.needsUpdate = true;
  }

  function writeScan(amount: number, force: boolean) {
    const scanAmount = force ? 1 : THREE.MathUtils.clamp(amount, 0, 1);
    const artAmount = 1 - scanAmount;
    scanPlate.visible = scanAmount > 0.002;
    scanModuleMesh.visible = scanAmount > 0.002;
    scanPlateMat.opacity = scanAmount;
    scanModuleMat.opacity = scanAmount;
    tileMesh.visible = !force && scanAmount < 0.999;
    backdrop.visible = artAmount > 0.002;
    backdrop.scale.setScalar(0.985 + artAmount * 0.015);
    for (const material of backdropMaterials) {
      material.opacity = artAmount;
    }
    clearMix.copy(clearColor).lerp(scanClearColor, scanAmount);
    renderer.setClearColor(clearMix, 1);
  }

  const blades: { x: number; z: number; sx: number; sy: number; rot: number; tilt: number; phase: number }[] = [];
  const tuftFlowers: Card[] = [];
  const flowerColors = [
    rgbColor("#fff4f6"),
    rgbColor(SAKURA_QR.blossom),
    rgbColor(SAKURA_QR.blossomDeep),
  ];
  for (const tile of tiles) {
    if (tile.kind !== "grass") continue;
    const x = origin + tile.col;
    const z = origin + tile.row;
    const bunch = compact ? 4 : 7;
    for (let i = 0; i < bunch; i += 1) {
      blades.push({
        x: x + (rng() - 0.5) * 0.72,
        z: z + (rng() - 0.5) * 0.72,
        sx: 0.28 + rng() * 0.22,
        sy: 0.7 + rng() * 0.85,
        rot: rng() * Math.PI,
        tilt: (rng() - 0.5) * 0.45,
        phase: rng() * Math.PI * 2,
      });
    }
    if (rng() > 0.55) {
      addCard(
        tuftFlowers,
        x + (rng() - 0.5) * 0.4,
        0.55 + rng() * 0.35,
        z + (rng() - 0.5) * 0.4,
        rng,
        varyColor(flowerColors[Math.floor(rng() * flowerColors.length)], 0.05, rng),
      );
    }
  }

  const bladeTex = makeTexture(paintBlade, high ? 1024 : 128);
  const bladeMat = spriteMaterial(bladeTex);
  const bladeGeo = new THREE.PlaneGeometry(1, 1);
  bladeGeo.translate(0, 0.5, 0);
  const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, Math.max(1, blades.length));
  grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(grassMesh);

  const { trunk, branches, tips, sites, height: treeHeight, crownY } = buildTrunk(rng, n, high);
  const tree = new THREE.Group();
  const barkMat = new THREE.MeshStandardMaterial({
    color: rgbColor(SAKURA_QR.bark),
    roughness: 0.68,
    metalness: 0.04,
    transparent: true,
  });
  const branchBarkMat = barkMat.clone();
  const trunkMesh = new THREE.Mesh(trunk, barkMat);
  tree.add(trunkMesh);
  const roots = buildRoots(tiles, origin, rng);
  const rootMat = new THREE.MeshStandardMaterial({
    color: rgbColor(SAKURA_QR.barkDeep),
    roughness: 0.74,
    metalness: 0.03,
    transparent: true,
  });
  const rootMesh = new THREE.Mesh(roots, rootMat);
  tree.add(rootMesh);
  const crown = new THREE.Group();
  crown.position.y = crownY;
  const branchMesh = new THREE.Mesh(branches, branchBarkMat);
  crown.add(branchMesh);

  const petalColors = [
    rgbColor("#fff6f7"),
    rgbColor(SAKURA_QR.blossom),
    rgbColor(SAKURA_QR.blossomDeep),
    rgbColor("#f6d0c6"),
    rgbColor("#ffe8ee"),
  ];
  const leafColors = [rgbColor(SAKURA_QR.matcha), rgbColor(SAKURA_QR.matchaSoft), rgbColor("#5c8f68")];
  const counts = compact
    ? { petals: 1550, flowers: 420, leaves: 240 }
    : { petals: 3200, flowers: 760, leaves: 480 };
  const crownSites = sites.filter((site) => site.y > treeHeight * 0.16);
  const canopy = sampleCanopy(
    rng,
    counts,
    crownSites.length ? crownSites : sites,
    tips,
    petalColors,
    leafColors,
  );
  for (const card of [...canopy.petals, ...canopy.flowers, ...canopy.leaves]) {
    card.y -= crownY;
  }
  assignMergeTargets(canopy.petals, tiles, origin, treeScale, rng);
  assignMergeTargets(canopy.flowers, tiles, origin, treeScale, rng);
  assignMergeTargets(canopy.leaves, tiles, origin, treeScale, rng);

  const petalTex = makeTexture(paintPetal, high ? 1024 : 128);
  const flowerTex = makeTexture(paintFlower, high ? 1024 : 128);
  const leafTex = makeTexture(paintLeaf, high ? 1024 : 128);
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  for (const tex of [bladeTex, petalTex, flowerTex, leafTex]) {
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
  }
  const petalMat = spriteMaterial(petalTex);
  const flowerMat = spriteMaterial(flowerTex);
  const leafMat = spriteMaterial(leafTex);

  const petalMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.35, 1.55), petalMat, Math.max(1, canopy.petals.length));
  const flowerMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 1.4), flowerMat, Math.max(1, canopy.flowers.length));
  const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.45), leafMat, Math.max(1, canopy.leaves.length));
  const tuftMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    flowerMat.clone(),
    Math.max(1, tuftFlowers.length),
  );
  for (const mesh of [petalMesh, flowerMesh, leafMesh, tuftMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  canopy.petals.forEach((card, i) => petalMesh.setColorAt(i, card.color));
  canopy.flowers.forEach((card, i) => flowerMesh.setColorAt(i, card.color));
  canopy.leaves.forEach((card, i) => leafMesh.setColorAt(i, card.color));
  tuftFlowers.forEach((card, i) => tuftMesh.setColorAt(i, card.color));
  for (const mesh of [petalMesh, flowerMesh, leafMesh]) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    crown.add(mesh);
  }
  if (tuftMesh.instanceColor) tuftMesh.instanceColor.needsUpdate = true;
  tree.add(crown);
  scene.add(tuftMesh);
  tree.scale.set(treeScale, treeScale, treeScale);
  scene.add(tree);
  tree.updateMatrixWorld(true);

  const groundPetals: Card[] = [];
  const groundCount = compact ? 6 : 10;
  for (let i = 0; i < groundCount; i += 1) {
    const theta = rng() * Math.PI * 2;
    const r = 1.6 + rng() * 3.4;
    addCard(
      groundPetals,
      Math.cos(theta) * r,
      0.28 + rng() * 0.08,
      Math.sin(theta) * r,
      rng,
      varyColor(petalColors[i % petalColors.length], 0.06, rng),
    );
    const card = groundPetals[i];
    card.billboard = false;
    card.rx = -Math.PI / 2 + (rng() - 0.5) * 0.5;
    card.rz = rng() * Math.PI;
  }
  const groundMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.55, 0.7),
    petalMat.clone(),
    Math.max(1, groundPetals.length),
  );
  groundMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  groundPetals.forEach((card, i) => groundMesh.setColorAt(i, card.color));
  if (groundMesh.instanceColor) groundMesh.instanceColor.needsUpdate = true;
  scene.add(groundMesh);

  const spawnScratch = new THREE.Vector3();
  function spawnFromBranch(petal: Petal) {
    const source =
      tips[Math.floor(rng() * Math.max(1, tips.length))] ??
      new THREE.Vector3(0, treeHeight, 0);
    spawnScratch.copy(source);
    tree.localToWorld(spawnScratch);
    const out = 0.18 + rng() * 0.35;
    petal.x = spawnScratch.x + (rng() - 0.5) * out;
    petal.z = spawnScratch.z + (rng() - 0.5) * out;
    petal.y = spawnScratch.y - 0.08 - rng() * 0.22;
    petal.bornX = petal.x;
    petal.bornY = petal.y;
    petal.bornZ = petal.z;
  }

  const petalCount = reduced ? 0 : compact ? 24 : 42;
  const petals: Petal[] = Array.from({ length: petalCount }, () => {
    const petal: Petal = {
      x: 0,
      y: 0,
      z: 0,
      bornX: 0,
      bornY: 0,
      bornZ: 0,
      speed: 0.28 + rng() * 0.32,
      drift: 0.34 + rng() * 0.42,
      rx: rng() * Math.PI,
      ry: rng() * Math.PI,
      rz: rng() * Math.PI,
      spin: (rng() - 0.5) * 2.4,
      phase: rng() * Math.PI * 2,
      scale: 0.7 + rng() * 0.34,
    };
    spawnFromBranch(petal);
    petal.y -= rng() * Math.max(1.2, petal.y * 0.45);
    return petal;
  });
  const fallingMat = spriteMaterial(petalTex);
  fallingMat.alphaTest = 0.02;
  fallingMat.depthWrite = false;
  fallingMat.depthTest = false;
  fallingMat.opacity = 0.96;
  const fallingMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.92, 1.08),
    fallingMat,
    Math.max(1, petalCount),
  );
  fallingMesh.renderOrder = 4;
  petals.forEach((_, i) =>
    fallingMesh.setColorAt(i, varyColor(petalColors[i % petalColors.length], 0.05, rng)),
  );
  if (fallingMesh.instanceColor) fallingMesh.instanceColor.needsUpdate = true;
  fallingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(fallingMesh);

  const fallingLeafCount = reduced ? 0 : compact ? 8 : 14;
  const fallingLeaves: Petal[] = Array.from(
    { length: fallingLeafCount },
    () => {
      const leaf: Petal = {
        x: 0,
        y: 0,
        z: 0,
        bornX: 0,
        bornY: 0,
        bornZ: 0,
        speed: 0.2 + rng() * 0.22,
        drift: 0.42 + rng() * 0.48,
        rx: rng() * Math.PI,
        ry: rng() * Math.PI,
        rz: rng() * Math.PI,
        spin: (rng() - 0.5) * 3.2,
        phase: rng() * Math.PI * 2,
        scale: 0.72 + rng() * 0.32,
      };
      spawnFromBranch(leaf);
      leaf.y -= rng() * Math.max(1.2, leaf.y * 0.45);
      return leaf;
    },
  );
  const fallingLeafMat = spriteMaterial(leafTex);
  fallingLeafMat.alphaTest = 0.03;
  fallingLeafMat.depthWrite = false;
  fallingLeafMat.depthTest = false;
  fallingLeafMat.opacity = 0.94;
  const fallingLeafMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.86, 1.18),
    fallingLeafMat,
    Math.max(1, fallingLeafCount),
  );
  fallingLeafMesh.renderOrder = 5;
  fallingLeaves.forEach((_, i) =>
    fallingLeafMesh.setColorAt(
      i,
      varyColor(leafColors[i % leafColors.length], 0.06, rng),
    ),
  );
  if (fallingLeafMesh.instanceColor) {
    fallingLeafMesh.instanceColor.needsUpdate = true;
  }
  fallingLeafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(fallingLeafMesh);

  let targetReveal = options.reveal ? 1 : 0;
  let reveal = targetReveal;
  let frame = 0;
  let disposed = false;
  let elapsed = 0;
  let lastTick = performance.now();

  function placeCamera(amount: number) {
    const elev = THREE.MathUtils.lerp(ISO_ELEV, Math.PI / 2 - 0.018, amount);
    const yaw = THREE.MathUtils.lerp(ISO_YAW, 0, amount);
    const distance = n * 2.7;
    const worldTree = treeHeight * treeScale;
    const aspect = viewWidth / Math.max(1, viewHeight);
    const fitX = THREE.MathUtils.lerp(n * 0.64 + 2.4, spanBase + 0.45, amount);
    const fitY = THREE.MathUtils.lerp(
      Math.max(n * 0.55, worldTree * 1.05) + (compact ? 4.4 : 7.2),
      spanBase + 0.55,
      amount,
    );
    const span = Math.max(fitY, fitX / Math.max(aspect, 0.35));
    camera.left = -span * aspect;
    camera.right = span * aspect;
    camera.top = span;
    camera.bottom = -span;
    camera.position.set(
      Math.cos(elev) * Math.sin(yaw) * distance,
      Math.sin(elev) * distance,
      Math.cos(elev) * Math.cos(yaw) * distance,
    );
    look.set(0, THREE.MathUtils.lerp(worldTree * 0.08, 0, amount), 0);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  }

  function writeGrass(time: number, amount: number) {
    const live = 1 - amount;
    const wind = reduced ? 0 : live;
    grassMesh.visible = live > 0.01;
    for (let i = 0; i < blades.length; i += 1) {
      const blade = blades[i];
      dummy.position.set(blade.x, 0.12, blade.z);
      dummy.rotation.set(
        blade.tilt + Math.sin(time * 2.4 + blade.phase) * 0.12 * wind,
        blade.rot,
        Math.sin(time * 2.8 + blade.phase) * 0.18 * wind,
      );
      dummy.scale.set(blade.sx, blade.sy * Math.max(0, live), 1);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(i, dummy.matrix);
    }
    if (blades.length === 0) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      grassMesh.setMatrixAt(0, dummy.matrix);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
  }

  function writeFallingPool(
    mesh: THREE.InstancedMesh,
    pool: Petal[],
    delta: number,
    time: number,
    amount: number,
    leafMotion = false,
  ) {
    const live = 1 - amount;
    if (pool.length === 0 || live < 0.06) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    for (let i = 0; i < pool.length; i += 1) {
      const petal = pool[i];
      if (amount < 0.18) {
        petal.y -= petal.speed * delta;
      } else {
        petal.y -= petal.speed * delta * live;
      }
      const range = Math.max(2.2, petal.bornY * 0.82);
      const travel = (petal.bornY - petal.y) / range;
      const sweep = petal.drift * (0.45 + travel * 0.9);
      petal.x =
        petal.bornX +
        Math.sin(time * 1.18 + petal.phase + travel * 4.2) * sweep;
      petal.z =
        petal.bornZ +
        Math.cos(time * 0.84 + petal.phase + travel * 3.1) * sweep * 0.72;
      let fade = travel < 0.68 ? 1 : Math.max(0, 1 - (travel - 0.68) / 0.32);
      if (fade <= 0.03 || petal.y < 0.18) {
        spawnFromBranch(petal);
        fade = 1;
      }
      petal.rx += delta * 1.8 * live;
      petal.ry += delta * petal.spin * live;
      petal.rz += delta * (leafMotion ? 3.2 : 2.4) * live;
      dummy.position.set(petal.x, petal.y, petal.z);
      euler.set(petal.rx, petal.ry, petal.rz);
      dummy.quaternion.setFromEuler(euler);
      dummy.scale.set(
        petal.scale * Math.max(leafMotion ? 0.7 : 0.55, fade) * Math.max(0.4, live),
        petal.scale * fade * Math.max(0.4, live),
        1,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function writePetals(delta: number, time: number, amount: number) {
    writeFallingPool(fallingMesh, petals, delta, time, amount);
    writeFallingPool(
      fallingLeafMesh,
      fallingLeaves,
      delta,
      time,
      amount,
      true,
    );
  }

  function applyPose(time: number, amount: number, delta: number, scan = false) {
    const stages = sakuraFlattenStages(scan ? 1 : amount);
    writeTiles(stages.tiles, scan);
    writeStacks(stages.trunk, scan);
    writeGrass(time, scan ? 1 : stages.canopy);
    placeCamera(stages.camera);
    writeScan(stages.scan, scan);
    const live = 1 - amount;
    const wind = reduced || scan ? 0 : 1 - stages.canopy;
    tree.rotation.set(0, 0, 0);
    tree.scale.set(treeScale, treeScale, treeScale);
    crown.rotation.z = Math.sin(time * 0.85) * 0.038 * wind;
    crown.rotation.x = Math.cos(time * 0.62) * 0.016 * wind;
    if (scan) {
      tree.visible = false;
    } else {
      crown.position.y = crownY * (1 - stages.canopy);
      crown.scale.setScalar(1);
      const branchFade = 1 - smoothstep((stages.canopy - 0.58) / 0.42);
      branchMesh.scale.set(
        THREE.MathUtils.lerp(1, 0.72, stages.canopy),
        Math.max(0.02, 1 - stages.canopy),
        THREE.MathUtils.lerp(1, 0.72, stages.canopy),
      );
      branchMesh.visible = branchFade > 0.01;
      branchBarkMat.opacity = branchFade;
      const trunkFade = 1 - smoothstep((stages.trunk - 0.62) / 0.38);
      const spread = THREE.MathUtils.lerp(1, 0.54, stages.trunk);
      trunkMesh.scale.set(spread, Math.max(0.015, 1 - stages.trunk), spread);
      trunkMesh.position.y = 0;
      barkMat.opacity = trunkFade;
      trunkMesh.visible = trunkFade > 0.01;
      rootMesh.scale.set(
        THREE.MathUtils.lerp(1, 0.72, stages.trunk),
        Math.max(0.015, 1 - stages.trunk),
        THREE.MathUtils.lerp(1, 0.72, stages.trunk),
      );
      rootMesh.position.y = 0;
      rootMat.opacity = trunkFade;
      rootMesh.visible = trunkFade > 0.01;
      tree.visible = stages.scan < 0.995;
    }
    const canopyPresence = 1 - smoothstep((stages.canopy - 0.82) / 0.18);
    shadow.scale.setScalar(Math.max(0.12, 1 - stages.trunk * 0.88));
    shadow.visible = !scan && stages.scan < 0.98;
    writeCards(
      petalMesh,
      canopy.petals,
      dummy,
      camera,
      euler,
      time,
      canopyPresence,
      wind,
      stages.canopy,
      0.18 / treeScale,
    );
    writeCards(
      flowerMesh,
      canopy.flowers,
      dummy,
      camera,
      euler,
      time,
      canopyPresence,
      wind,
      stages.canopy,
      0.18 / treeScale,
    );
    writeCards(
      leafMesh,
      canopy.leaves,
      dummy,
      camera,
      euler,
      time,
      canopyPresence,
      wind,
      stages.canopy,
      0.18 / treeScale,
    );
    writeCards(tuftMesh, tuftFlowers, dummy, camera, euler, time, live, wind, stages.canopy);
    writeCards(groundMesh, groundPetals, dummy, camera, euler, time, live, 0, stages.tiles);
    const smallArtVisible = !scan && stages.scan < 0.995;
    tuftMesh.visible = smallArtVisible;
    groundMesh.visible = smallArtVisible;
    writePetals(delta, time, scan ? 1 : stages.canopy);
  }

  function resize() {
    const parent = canvas.parentElement;
    const box = parent?.getBoundingClientRect();
    viewWidth = Math.max(1, box?.width || canvas.clientWidth || 240);
    viewHeight = Math.max(1, box?.height || canvas.clientHeight || viewWidth);
    const scale = sakuraDisplayScale(high);
    const maxEdge = 4096;
    const capped = Math.min(scale, maxEdge / Math.max(viewWidth, viewHeight));
    renderer.setPixelRatio(capped);
    renderer.setSize(viewWidth, viewHeight, false);
    placeCamera(sakuraFlattenStages(reveal).camera);
  }

  function render() {
    const now = performance.now();
    const delta = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;
    elapsed += delta;
    const time = elapsed;
    reveal = reduced
      ? targetReveal
      : THREE.MathUtils.damp(reveal, targetReveal, 3.6, delta);
    if (Math.abs(targetReveal - reveal) < 0.002) reveal = targetReveal;
    applyPose(time, reveal, reduced ? 0 : delta);
    renderer.render(scene, camera);
  }

  function loop() {
    if (disposed) return;
    frame = window.requestAnimationFrame(loop);
    render();
  }

  const onResize = () => {
    resize();
    applyPose(elapsed, reveal, 0);
    renderer.render(scene, camera);
  };

  resize();
  applyPose(0, reveal, 0);
  renderer.render(scene, camera);
  loop();

  window.addEventListener("resize", onResize);
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", onResize);
  viewport?.addEventListener("scroll", onResize);
  const observer =
    typeof ResizeObserver !== "undefined" && canvas.parentElement
      ? new ResizeObserver(onResize)
      : null;
  if (canvas.parentElement && observer) observer.observe(canvas.parentElement);

  return {
    setReveal(next) {
      targetReveal = next ? 1 : 0;
      if (reduced) {
        reveal = targetReveal;
        applyPose(elapsed, reveal, 0);
        renderer.render(scene, camera);
      }
    },
    resize: onResize,
    capturePng(mode = "view") {
      const scan = mode === "scan";
      applyPose(elapsed, scan ? 1 : reveal, 0, scan);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      if (scan) {
        applyPose(elapsed, reveal, 0, false);
        renderer.render(scene, camera);
      }
      return dataUrl;
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      viewport?.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", onResize);
      observer?.disconnect();
      renderer.dispose();
      tileGeo.dispose();
      tileMat.dispose();
      stackGeo.dispose();
      stackMat.dispose();
      bladeGeo.dispose();
      bladeMat.dispose();
      trunk.dispose();
      branches.dispose();
      roots.dispose();
      barkMat.dispose();
      branchBarkMat.dispose();
      rootMat.dispose();
      for (const geometry of backdropGeometries) geometry.dispose();
      for (const material of backdropMaterials) material.dispose();
      scanPlateGeo.dispose();
      scanPlateMat.dispose();
      scanModuleGeo.dispose();
      scanModuleMat.dispose();
      petalTex.dispose();
      flowerTex.dispose();
      leafTex.dispose();
      bladeTex.dispose();
      petalMat.dispose();
      flowerMat.dispose();
      leafMat.dispose();
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      tileMesh.dispose();
      stackMesh.dispose();
      grassMesh.dispose();
      petalMesh.dispose();
      flowerMesh.dispose();
      leafMesh.dispose();
      tuftMesh.dispose();
      groundMesh.dispose();
      fallingMesh.dispose();
      fallingLeafMesh.dispose();
      scanModuleMesh.dispose();
      (tuftMesh.material as THREE.Material).dispose();
      (groundMesh.material as THREE.Material).dispose();
      (fallingMesh.material as THREE.Material).dispose();
      fallingLeafMat.dispose();
    },
  };
}
