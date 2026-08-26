import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  classifySakuraTile,
  encodeSakuraQr,
  hexToRgb,
  mulberry32,
  planSakuraStacks,
  SAKURA_QR,
  type SakuraQrMatrix,
  type SakuraQrMount,
  type SakuraQrMountOptions,
  type SakuraTileKind,
} from "./sakura-qr";

const QUIET = 2.4;
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
};

type Petal = {
  x: number;
  y: number;
  z: number;
  speed: number;
  drift: number;
  rx: number;
  ry: number;
  rz: number;
  spin: number;
  phase: number;
  scale: number;
};

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
  size = 128,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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
    const p = place(i % 5 === 0 ? along : ends, 0.12 + rng() * 0.16);
    addCard(petals, p.x, p.y, p.z, rng, varyColor(petalColors[i % petalColors.length], 0.07, rng));
  }
  for (let i = 0; i < counts.flowers; i += 1) {
    const p = place(ends, 0.06 + rng() * 0.1);
    addCard(flowers, p.x, p.y, p.z, rng, varyColor(petalColors[(i + 2) % petalColors.length], 0.05, rng));
  }
  for (let i = 0; i < counts.leaves; i += 1) {
    const p = place(along, 0.05 + rng() * 0.1);
    addCard(leaves, p.x, p.y, p.z, rng, varyColor(leafColors[i % leafColors.length], 0.08, rng));
  }
  return { petals, flowers, leaves };
}

function buildTrunk(
  rng: () => number,
  grid: number,
): {
  bark: THREE.BufferGeometry;
  tips: THREE.Vector3[];
  sites: THREE.Vector3[];
  height: number;
} {
  const pieces: THREE.BufferGeometry[] = [];
  const dummy = new THREE.Object3D();
  const root = new THREE.Group();
  const tipNodes: THREE.Object3D[] = [];
  const trunkRadius = Math.max(0.85, grid * 0.05);
  const trunkHeight = grid * 0.42;

  let y = 0;
  let radius = trunkRadius;
  for (let i = 0; i < 10; i += 1) {
    const height = trunkHeight / 10;
    const nextRadius = radius * 0.86;
    dummy.position.set(Math.sin(i * 0.34) * 0.28, y + height / 2, Math.cos(i * 0.28) * 0.18);
    dummy.rotation.set((rng() - 0.5) * 0.07, 0, (rng() - 0.5) * 0.12);
    dummy.updateMatrix();
    const geo = new THREE.CylinderGeometry(nextRadius, radius, height, 10);
    geo.applyMatrix4(dummy.matrix);
    pieces.push(geo);
    y += height * 0.96;
    radius = nextRadius;
  }

  function grow(
    parent: THREE.Object3D,
    length: number,
    branchRadius: number,
    depth: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(branchRadius * 0.55, branchRadius, length, 6),
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
      child.rotation.z = (i - (count - 1) / 2) * (0.34 + depth * 0.1) + (rng() - 0.5) * 0.12;
      child.rotation.y = rng() * Math.PI * 2;
      child.rotation.x = depth === 0 ? 0.16 + rng() * 0.2 : 0.48 + rng() * 0.7;
      tip.add(child);
      grow(child, length * (0.68 + rng() * 0.14), branchRadius * 0.74, depth + 1);
    }
  }

  const crown = new THREE.Group();
  crown.position.y = trunkHeight * 0.2;
  root.add(crown);
  grow(crown, trunkHeight * 0.72, trunkRadius * 0.62, 0);
  root.updateMatrixWorld(true);
  const tips = tipNodes.map((node) =>
    new THREE.Vector3().setFromMatrixPosition(node.matrixWorld),
  );
  const sites: THREE.Vector3[] = [];
  root.traverse((object: THREE.Object3D) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      pieces.push(geometry);
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
  const bark = mergeGeometries(pieces) ?? new THREE.CylinderGeometry(0.2, 0.3, 1, 6);
  for (const piece of pieces) piece.dispose();
  const height = tips.reduce((max, tip) => Math.max(max, tip.y), trunkHeight);
  return { bark, tips, sites, height };
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
) {
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    const sway = Math.sin(time * 1.85 + card.phase) * 0.08 * wind;
    dummy.position.set(
      card.x + sway,
      card.y + Math.sin(time * 2.35 + card.phase * 1.2) * 0.04 * wind,
      card.z + sway * 0.45,
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
    dummy.scale.set(card.sx * live, card.sy * live, 1);
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
  const mobile =
    compact ||
    (typeof navigator !== "undefined" && /Mobi|Android|iPhone/i.test(navigator.userAgent)) ||
    n > 41;
  const treeScale = compact ? 0.78 : 0.88;
  const tiles = buildTiles(matrix, rng);
  const stacks = planSakuraStacks(matrix, mobile);
  const reduced = options.reducedMotion;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    alpha: true,
    powerPreference: mobile ? "low-power" : "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.background = null;

  const spanBase = n / 2 + QUIET;
  const camera = new THREE.OrthographicCamera(-spanBase, spanBase, spanBase, -spanBase, 0.1, n * 12);
  const look = new THREE.Vector3();
  const euler = new THREE.Euler();
  let viewWidth = 1;
  let viewHeight = 1;

  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x4a6754, 1.05));
  const sun = new THREE.DirectionalLight(0xffe4b8, 1.85);
  sun.position.set(n * 0.85, n * 1.2, n * 0.4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xf4c4d0, 0.45);
  fill.position.set(-n * 0.6, n * 0.35, -n * 0.25);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0xf7f1e6, 0.28));

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

  const tileGeo = new RoundedBoxGeometry(0.94, 1, 0.94, 1, 0.08);
  const tileMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const tileMesh = new THREE.InstancedMesh(tileGeo, tileMat, tiles.length);
  tileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(tileMesh);

  const dummy = new THREE.Object3D();
  const mix = new THREE.Color();
  const stackGeo = new RoundedBoxGeometry(0.86, 1, 0.86, 1, 0.1);
  const stackMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
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
      mix.copy(tile.color).lerp(scan ? tile.scanColor : tile.mergeColor, amount);
      tileMesh.setColorAt(tile.index, mix);
    }
    tileMesh.instanceMatrix.needsUpdate = true;
    if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
  }

  function writeStacks(amount: number, scan: boolean) {
    const live = scan ? 0 : Math.max(0, 1 - amount);
    stackMesh.visible = live > 0.04;
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
    const bunch = mobile ? 5 : 8;
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

  const bladeTex = makeTexture(paintBlade);
  const bladeMat = spriteMaterial(bladeTex);
  const bladeGeo = new THREE.PlaneGeometry(1, 1);
  bladeGeo.translate(0, 0.5, 0);
  const grassMesh = new THREE.InstancedMesh(bladeGeo, bladeMat, Math.max(1, blades.length));
  grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(grassMesh);

  const { bark, tips, sites, height: treeHeight } = buildTrunk(rng, n);
  const tree = new THREE.Group();
  const barkMesh = new THREE.Mesh(
    bark,
    new THREE.MeshLambertMaterial({ color: rgbColor(SAKURA_QR.bark) }),
  );
  tree.add(barkMesh);
  const roots = buildRoots(tiles, origin, rng);
  const rootMesh = new THREE.Mesh(
    roots,
    new THREE.MeshLambertMaterial({ color: rgbColor(SAKURA_QR.barkDeep) }),
  );
  tree.add(rootMesh);

  const petalColors = [
    rgbColor("#fff6f7"),
    rgbColor(SAKURA_QR.blossom),
    rgbColor(SAKURA_QR.blossomDeep),
    rgbColor("#f6d0c6"),
    rgbColor("#ffe8ee"),
  ];
  const leafColors = [rgbColor(SAKURA_QR.matcha), rgbColor(SAKURA_QR.matchaSoft), rgbColor("#5c8f68")];
  const counts = mobile
    ? { petals: 1400, flowers: 340, leaves: 260 }
    : { petals: 2400, flowers: 520, leaves: 380 };
  const crownSites = sites.filter((site) => site.y > treeHeight * 0.16);
  const canopy = sampleCanopy(
    rng,
    counts,
    crownSites.length ? crownSites : sites,
    tips,
    petalColors,
    leafColors,
  );

  const petalTex = makeTexture(paintPetal);
  const flowerTex = makeTexture(paintFlower);
  const leafTex = makeTexture(paintLeaf);
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
  for (const mesh of [petalMesh, flowerMesh, leafMesh, tuftMesh]) {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    tree.add(mesh);
  }
  tuftMesh.removeFromParent();
  scene.add(tuftMesh);
  tree.scale.set(treeScale, treeScale, treeScale);
  scene.add(tree);
  tree.updateMatrixWorld(true);

  const groundPetals: Card[] = [];
  const groundCount = mobile ? 8 : 12;
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
    petal.x = spawnScratch.x + (rng() - 0.5) * 0.22;
    petal.z = spawnScratch.z + (rng() - 0.5) * 0.22;
    petal.y = spawnScratch.y - rng() * 0.9;
  }

  const petalCount = reduced ? 0 : mobile ? 36 : 56;
  const petals: Petal[] = Array.from({ length: petalCount }, () => {
    const petal: Petal = {
      x: 0,
      y: 0,
      z: 0,
      speed: 0.95 + rng() * 1.15,
      drift: 0.12 + rng() * 0.2,
      rx: rng() * Math.PI,
      ry: rng() * Math.PI,
      rz: rng() * Math.PI,
      spin: (rng() - 0.5) * 3,
      phase: rng() * Math.PI * 2,
      scale: 0.55 + rng() * 0.4,
    };
    spawnFromBranch(petal);
    return petal;
  });
  const fallingMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.05, 1.25),
    petalMat.clone(),
    Math.max(1, petalCount),
  );
  fallingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(fallingMesh);

  let targetReveal = options.reveal ? 1 : 0;
  let reveal = targetReveal;
  let frame = 0;
  let disposed = false;
  const clock = new THREE.Clock();

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
    for (let i = 0; i < blades.length; i += 1) {
      const blade = blades[i];
      dummy.position.set(blade.x, 0.12, blade.z);
      dummy.rotation.set(
        blade.tilt + Math.sin(time * 2.4 + blade.phase) * 0.12 * wind,
        blade.rot,
        Math.sin(time * 2.8 + blade.phase) * 0.18 * wind,
      );
      dummy.scale.set(blade.sx, blade.sy * Math.max(0.12, live), 1);
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

  function writePetals(delta: number, time: number, amount: number) {
    const live = 1 - amount;
    if (petalCount === 0 || live < 0.06) {
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      fallingMesh.setMatrixAt(0, dummy.matrix);
      fallingMesh.instanceMatrix.needsUpdate = true;
      fallingMesh.visible = false;
      return;
    }
    fallingMesh.visible = true;
    for (let i = 0; i < petals.length; i += 1) {
      const petal = petals[i];
      if (amount < 0.18) {
        petal.y -= petal.speed * delta;
        petal.x += Math.sin(time * 0.9 + petal.phase) * petal.drift * delta;
        petal.z += Math.cos(time * 0.75 + petal.phase) * petal.drift * 0.75 * delta;
        if (petal.y < 0.12) spawnFromBranch(petal);
      } else {
        petal.y = Math.max(0.26, petal.y - petal.speed * delta * live);
      }
      petal.rx += delta * 1.8 * live;
      petal.ry += delta * petal.spin * live;
      petal.rz += delta * 2.4 * live;
      dummy.position.set(petal.x, petal.y, petal.z);
      euler.set(petal.rx, petal.ry, petal.rz);
      dummy.quaternion.setFromEuler(euler);
      dummy.scale.setScalar(petal.scale * Math.max(0.45, live));
      dummy.updateMatrix();
      fallingMesh.setMatrixAt(i, dummy.matrix);
    }
    fallingMesh.instanceMatrix.needsUpdate = true;
  }

  function applyPose(time: number, amount: number, delta: number, scan = false) {
    writeTiles(amount, scan);
    writeStacks(amount, scan);
    writeGrass(time, scan ? 1 : amount);
    placeCamera(amount);
    const live = 1 - amount;
    const wind = reduced || scan ? 0 : live;
    const sway = wind * 0.055;
    tree.rotation.z = Math.sin(time * 0.7) * sway;
    tree.rotation.x = Math.cos(time * 0.52) * sway * 0.4;
    if (scan) {
      tree.visible = false;
    } else {
      tree.scale.set(treeScale, treeScale * Math.max(0.04, (1 - amount) ** 1.25), treeScale);
      tree.visible = amount < 0.96;
    }
    shadow.scale.setScalar(Math.max(0.2, live));
    shadow.visible = !scan && live > 0.04;
    writeCards(petalMesh, canopy.petals, dummy, camera, euler, time, 1, wind);
    writeCards(flowerMesh, canopy.flowers, dummy, camera, euler, time, 1, wind);
    writeCards(leafMesh, canopy.leaves, dummy, camera, euler, time, 1, wind);
    writeCards(tuftMesh, tuftFlowers, dummy, camera, euler, time, Math.max(0.2, live), wind);
    writeCards(groundMesh, groundPetals, dummy, camera, euler, time, Math.max(0.25, live), 0);
    writePetals(delta, time, scan ? 1 : amount);
  }

  function resize() {
    const parent = canvas.parentElement;
    const box = parent?.getBoundingClientRect();
    viewWidth = Math.max(1, box?.width || canvas.clientWidth || 240);
    viewHeight = Math.max(1, box?.height || canvas.clientHeight || viewWidth);
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewWidth, viewHeight, false);
    placeCamera(reveal);
  }

  function render() {
    const time = clock.elapsedTime;
    const delta = Math.min(clock.getDelta(), 0.05);
    const ease = reduced ? 1 : 0.055;
    reveal += (targetReveal - reveal) * ease;
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
    applyPose(clock.elapsedTime, reveal, 0);
    renderer.render(scene, camera);
  };

  resize();
  applyPose(0, reveal, 0);
  renderer.render(scene, camera);
  loop();

  window.addEventListener("resize", onResize);
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
        applyPose(clock.elapsedTime, reveal, 0);
        renderer.render(scene, camera);
      }
    },
    resize: onResize,
    capturePng(mode = "view") {
      const scan = mode === "scan";
      applyPose(clock.elapsedTime, scan ? 1 : reveal, 0, scan);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      if (scan) {
        applyPose(clock.elapsedTime, reveal, 0, false);
        renderer.render(scene, camera);
      }
      return dataUrl;
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      renderer.dispose();
      tileGeo.dispose();
      tileMat.dispose();
      stackGeo.dispose();
      stackMat.dispose();
      bladeGeo.dispose();
      bladeMat.dispose();
      bark.dispose();
      roots.dispose();
      (barkMesh.material as THREE.Material).dispose();
      (rootMesh.material as THREE.Material).dispose();
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
      (tuftMesh.material as THREE.Material).dispose();
      (groundMesh.material as THREE.Material).dispose();
      (fallingMesh.material as THREE.Material).dispose();
    },
  };
}
