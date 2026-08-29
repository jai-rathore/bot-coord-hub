import {
  classifySakuraTile,
  encodeSakuraQr,
  mulberry32,
  planSakuraStacks,
  sakuraDisplayScale,
  sakuraFlattenStages,
  SAKURA_QR,
  SAKURA_SCAN,
  type SakuraQrMatrix,
  type SakuraQrMount,
  type SakuraQrMountOptions,
} from "./sakura-qr";

function drawBlossom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  dark: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  for (let i = 0; i < 5; i += 1) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.52, radius * 0.28, radius * 0.52, 0, 0, Math.PI * 2);
    ctx.fillStyle = dark
      ? i % 2
        ? SAKURA_QR.darkBlossom
        : "#3a1a24"
      : i % 2
        ? SAKURA_QR.blossom
        : SAKURA_QR.blossomDeep;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = dark ? SAKURA_QR.honey : SAKURA_QR.stamen;
  ctx.fill();
  ctx.restore();
}

function drawFallingLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = SAKURA_QR.matchaSoft;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.48, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = SAKURA_QR.matcha;
  ctx.lineWidth = Math.max(0.7, radius * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, -radius * 0.78);
  ctx.lineTo(0, radius * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rng: () => number,
  alpha: number,
  sway = 0,
) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha *= alpha;

  const shadow = ctx.createRadialGradient(cx, cy + size * 0.28, 2, cx, cy + size * 0.28, size * 0.28);
  shadow.addColorStop(0, "rgba(23, 63, 46, 0.18)");
  shadow.addColorStop(1, "rgba(23, 63, 46, 0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.3, size * 0.22, size * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  function branch(
    x: number,
    y: number,
    angle: number,
    length: number,
    width: number,
    depth: number,
  ) {
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    ctx.strokeStyle = depth < 3 ? SAKURA_QR.bark : SAKURA_QR.barkDeep;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      (x + x2) / 2 + Math.sin(angle) * length * 0.12,
      (y + y2) / 2 - Math.cos(angle) * length * 0.08,
      x2,
      y2,
    );
    ctx.stroke();

    if (depth >= 6 || length < size * 0.035) {
      const count = 5 + Math.floor(rng() * 5);
      for (let i = 0; i < count; i += 1) {
        drawBlossom(
          ctx,
          x2 + (rng() - 0.5) * length,
          y2 + (rng() - 0.5) * length,
          size * (0.018 + rng() * 0.022),
          rng() * Math.PI,
          false,
        );
      }
      if (rng() > 0.6) {
        ctx.fillStyle = SAKURA_QR.matcha;
        ctx.beginPath();
        ctx.ellipse(
          x2 + (rng() - 0.5) * 8,
          y2 + rng() * 6,
          size * 0.012,
          size * 0.022,
          rng() * 0.8,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      return;
    }

    const splits = depth < 2 ? 3 : 2;
    for (let i = 0; i < splits; i += 1) {
      const spread = (i - (splits - 1) / 2) * (0.45 + depth * 0.08);
      const droop = depth > 2 ? 0.25 + rng() * 0.35 : 0;
      const wind = depth >= 1 ? sway * (0.4 + depth * 0.12) : 0;
      branch(
        x2,
        y2,
        angle + spread + (rng() - 0.5) * 0.2 + droop + wind,
        length * (0.62 + rng() * 0.18),
        width * 0.68,
        depth + 1,
      );
    }
  }

  branch(cx, cy + size * 0.28, -Math.PI / 2, size * 0.38, size * 0.048, 0);
  ctx.restore();
}

function gardenFill(
  kind: ReturnType<typeof classifySakuraTile>,
  dark: boolean,
  reveal: number,
): string {
  if (kind === "finder") return dark ? SAKURA_QR.darkDeep : SAKURA_QR.lightPure;
  if (reveal > 0.45) {
    return dark ? SAKURA_QR.darkBlossom : SAKURA_QR.blossomWhite;
  }
  if (kind === "trunk") return SAKURA_QR.bark;
  if (kind === "canopy") return SAKURA_QR.darkBlossom;
  if (kind === "grass") return SAKURA_QR.dark;
  return SAKURA_QR.plot;
}

function drawIsoTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tw: number,
  th: number,
  height: number,
  fill: string,
) {
  const top = [
    [x, y - height],
    [x + tw / 2, y + th / 2 - height],
    [x, y + th - height],
    [x - tw / 2, y + th / 2 - height],
  ];
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  ctx.lineTo(top[1][0], top[1][1]);
  ctx.lineTo(top[2][0], top[2][1]);
  ctx.lineTo(top[3][0], top[3][1]);
  ctx.closePath();
  ctx.fill();
  if (height > 0.6) {
    ctx.fillStyle = "rgba(23, 63, 46, 0.18)";
    ctx.beginPath();
    ctx.moveTo(top[3][0], top[3][1]);
    ctx.lineTo(top[2][0], top[2][1]);
    ctx.lineTo(top[2][0], top[2][1] + height);
    ctx.lineTo(top[3][0], top[3][1] + height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.beginPath();
    ctx.moveTo(top[1][0], top[1][1]);
    ctx.lineTo(top[2][0], top[2][1]);
    ctx.lineTo(top[2][0], top[2][1] + height);
    ctx.lineTo(top[1][0], top[1][1] + height);
    ctx.closePath();
    ctx.fill();
  }
}

function paint(
  ctx: CanvasRenderingContext2D,
  matrix: SakuraQrMatrix,
  cssWidth: number,
  cssHeight: number,
  reveal: number,
  timeMs: number,
  reducedMotion: boolean,
) {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const stages = sakuraFlattenStages(reveal);
  const scanFade = stages.scan;
  ctx.fillStyle = SAKURA_QR.lightPure;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  if (scanFade < 0.999) {
    ctx.save();
    ctx.globalAlpha = 1 - scanFade;
    const sky = ctx.createLinearGradient(0, 0, 0, cssHeight);
    sky.addColorStop(0, SAKURA_QR.sky);
    sky.addColorStop(0.56, "#f8eee3");
    sky.addColorStop(1, SAKURA_QR.water);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    const sun = ctx.createRadialGradient(
      cssWidth * 0.72,
      cssHeight * 0.18,
      1,
      cssWidth * 0.72,
      cssHeight * 0.18,
      cssWidth * 0.18,
    );
    sun.addColorStop(0, "rgba(255, 245, 210, 0.92)");
    sun.addColorStop(0.42, "rgba(246, 193, 186, 0.32)");
    sun.addColorStop(1, "rgba(246, 193, 186, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, cssWidth, cssHeight * 0.55);
    ctx.restore();
  }
  const rng = mulberry32(matrix.seed);
  const n = matrix.size;
  const art = 1 - reveal;
  const cell = Math.min(cssWidth, cssHeight) / (n + 11);
  const tw = cell * (1.05 + art * 0.15);
  const th = cell * (0.52 + reveal * 0.48);
  const originX = cssWidth / 2;
  const originY = cssHeight * (0.46 + reveal * 0.08);

  if (art > 0.02) {
    ctx.save();
    ctx.globalAlpha = art;
    drawIsoTile(
      ctx,
      originX,
      originY - th * 4.8,
      tw * (n + 10),
      th * (n + 10),
      cell * 1.1,
      SAKURA_QR.water,
    );
    drawIsoTile(
      ctx,
      originX,
      originY - th * 3.8,
      tw * (n + 8),
      th * (n + 8),
      cell * 0.86,
      SAKURA_QR.terraceEdge,
    );
    drawIsoTile(
      ctx,
      originX,
      originY - th * 3,
      tw * (n + 6),
      th * (n + 6),
      cell * 0.7,
      SAKURA_QR.terrace,
    );
    ctx.restore();
  }

  const order: Array<[number, number]> = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      order.push([row, col]);
    }
  }
  order.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

  for (const [row, col] of order) {
    const isoX = originX + ((col - row) * tw) / 2;
    const isoY = originY + ((col + row) * th) / 2;
    const dark = matrix.dark[row][col];
    const kind = classifySakuraTile(row, col, n, dark);
    const height =
      (kind === "trunk"
        ? cell * 0.55
        : kind === "grass"
          ? cell * 0.38
          : dark
            ? cell * 0.28
            : cell * 0.1) * art;
    drawIsoTile(ctx, isoX, isoY, tw * 0.92, th * 0.92, height, gardenFill(kind, dark, reveal));
  }

  if (art > 0.05) {
    const stacks = planSakuraStacks(matrix, cssWidth < 230);
    const stackOrder = [...stacks].sort(
      (a, b) => a.row + a.col + a.layer - (b.row + b.col + b.layer),
    );
    for (const stack of stackOrder) {
      const isoX = originX + ((stack.col - stack.row + stack.offsetX) * tw) / 2;
      const isoY = originY + ((stack.col + stack.row + stack.offsetZ) * th) / 2;
      const lift = cell * 0.42 * stack.layer * art;
      drawIsoTile(
        ctx,
        isoX,
        isoY - lift,
        tw * 0.78 * stack.scale,
        th * 0.78 * stack.scale,
        cell * 0.3 * art,
        stack.kind === "trunk"
          ? stack.layer > 5
            ? SAKURA_QR.barkDeep
            : SAKURA_QR.bark
          : stack.layer % 2
            ? SAKURA_QR.blossom
            : SAKURA_QR.blossomDeep,
      );
    }
  }

  const treeX = originX;
  const treeY = originY + ((n * th) / 2) * 0.38;
  const treeSize = n * cell * 0.52;
  if (art > 0.04 && stages.trunk < 0.98) {
    const sway = reducedMotion ? 0 : Math.sin(timeMs * 0.0018) * 0.12 * (1 - stages.canopy);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, 1 - stages.canopy * 0.85);
    ctx.translate(treeX, treeY + treeSize * 0.22);
    ctx.scale(
      Math.max(0.12, 1 - stages.canopy * 0.28),
      Math.max(0.05, 1 - stages.trunk),
    );
    ctx.translate(-treeX, -(treeY + treeSize * 0.22));
    drawTree(ctx, treeX, treeY, treeSize, rng, 1 - stages.canopy * 0.35, sway);
    ctx.restore();
  }

  if (!reducedMotion && stages.canopy < 0.72) {
    for (let i = 0; i < 24; i += 1) {
      const seed = mulberry32(matrix.seed + i * 97)();
      const span = treeSize * 0.72;
      const fall = (timeMs * (0.022 + seed * 0.018) + seed * 400) % span;
      const progress = fall / span;
      const fade = progress < 0.58 ? 1 : Math.max(0, 1 - (progress - 0.58) / 0.42);
      const x =
        treeX +
        (seed - 0.5) * treeSize * 0.5 +
        Math.sin(timeMs * 0.0012 + i) * (16 + seed * 8);
      const y = treeY - treeSize * 0.18 + fall;
      ctx.globalAlpha = 0.96 * (1 - stages.canopy) * fade;
      if (i % 5 === 0) {
        drawFallingLeaf(
          ctx,
          x,
          y,
          5 + seed * 2.8,
          timeMs * 0.0026 + i,
        );
      } else {
        drawBlossom(
          ctx,
          x,
          y,
          4.4 + seed * 3.2,
          timeMs * 0.002 + i,
          false,
        );
      }
      ctx.globalAlpha = 1;
    }
  }

  if (scanFade > 0.001) {
    const quiet = SAKURA_SCAN.quietModules;
    const moduleSize = Math.max(
      1,
      Math.floor(Math.min(cssWidth, cssHeight) / (n + quiet * 2)),
    );
    const plateSize = (n + quiet * 2) * moduleSize;
    const plateX = Math.round((cssWidth - plateSize) / 2);
    const plateY = Math.round((cssHeight - plateSize) / 2);
    const codeX = plateX + quiet * moduleSize;
    const codeY = plateY + quiet * moduleSize;
    ctx.save();
    ctx.globalAlpha = scanFade;
    ctx.fillStyle = SAKURA_QR.lightPure;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.fillRect(plateX, plateY, plateSize, plateSize);
    ctx.fillStyle = SAKURA_QR.darkDeep;
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        if (!matrix.dark[row][col]) continue;
        ctx.fillRect(
          codeX + col * moduleSize,
          codeY + row * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
    ctx.restore();
  }
}

export async function mountSakuraQrCanvas(
  canvas: HTMLCanvasElement,
  options: SakuraQrMountOptions,
): Promise<SakuraQrMount> {
  const matrix = encodeSakuraQr(options.url);
  const surface = canvas.getContext("2d", { alpha: true });
  if (!surface) throw new Error("Canvas 2D is unavailable");
  const ctx: CanvasRenderingContext2D = surface;

  let targetReveal = options.reveal ? 1 : 0;
  let reveal = targetReveal;
  let frame = 0;
  let disposed = false;
  let cssWidth = 240;
  let cssHeight = 300;
  let lastTime = 0;

  function resize() {
    const parent = canvas.parentElement;
    const box = parent?.getBoundingClientRect();
    cssWidth = Math.max(1, box?.width || canvas.clientWidth || 240);
    cssHeight = Math.max(1, box?.height || canvas.clientHeight || cssWidth);
    const scale = sakuraDisplayScale(!options.compact);
    const maxEdge = 4096;
    const capped = Math.min(scale, maxEdge / Math.max(cssWidth, cssHeight));
    canvas.width = Math.round(cssWidth * capped);
    canvas.height = Math.round(cssHeight * capped);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(capped, 0, 0, capped, 0, 0);
  }

  function render(timeMs: number) {
    const delta = lastTime
      ? Math.min(0.05, Math.max(0, (timeMs - lastTime) / 1000))
      : 1 / 60;
    lastTime = timeMs;
    const ease = options.reducedMotion ? 1 : 1 - Math.exp(-4.4 * delta);
    reveal += (targetReveal - reveal) * ease;
    if (Math.abs(targetReveal - reveal) < 0.002) reveal = targetReveal;
    paint(ctx, matrix, cssWidth, cssHeight, reveal, timeMs, options.reducedMotion);
  }

  function loop(timeMs: number) {
    if (disposed) return;
    frame = window.requestAnimationFrame(loop);
    render(timeMs);
  }

  const onResize = () => {
    resize();
    render(0);
  };

  resize();
  render(0);
  loop(0);

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
    },
    resize: onResize,
    capturePng(mode = "view") {
      paint(
        ctx,
        matrix,
        cssWidth,
        cssHeight,
        mode === "scan" ? 1 : reveal,
        0,
        options.reducedMotion,
      );
      const dataUrl = canvas.toDataURL("image/png");
      if (mode === "scan") {
        paint(ctx, matrix, cssWidth, cssHeight, reveal, 0, options.reducedMotion);
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
    },
  };
}
