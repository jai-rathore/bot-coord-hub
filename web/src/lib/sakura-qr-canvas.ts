import {
  encodeSakuraQr,
  isFinderModule,
  mulberry32,
  SAKURA_QR,
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

function drawTree(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rng: () => number,
  alpha: number,
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
      const count = 3 + Math.floor(rng() * 4);
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
      if (rng() > 0.72) {
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
      branch(
        x2,
        y2,
        angle + spread + (rng() - 0.5) * 0.2 + droop,
        length * (0.62 + rng() * 0.18),
        width * 0.68,
        depth + 1,
      );
    }
  }

  branch(cx, cy + size * 0.28, -Math.PI / 2, size * 0.38, size * 0.048, 0);
  ctx.restore();
}

function drawPaper(ctx: CanvasRenderingContext2D, size: number, rng: () => number) {
  const wash = ctx.createRadialGradient(
    size * 0.5,
    size * 0.42,
    size * 0.1,
    size * 0.5,
    size * 0.5,
    size * 0.72,
  );
  wash.addColorStop(0, "#fbf6ee");
  wash.addColorStop(0.65, SAKURA_QR.cream);
  wash.addColorStop(1, "#eadfcd");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 80; i += 1) {
    ctx.fillStyle = rng() > 0.5 ? SAKURA_QR.matchaSoft : SAKURA_QR.blossom;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 8 + rng() * 18);
  }
  ctx.globalAlpha = 1;
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
  cssSize: number,
  reveal: number,
  timeMs: number,
  reducedMotion: boolean,
) {
  const rng = mulberry32(matrix.seed);
  drawPaper(ctx, cssSize, rng);

  const n = matrix.size;
  const art = 1 - reveal;
  const cell = cssSize / (n + 6);
  const tw = cell * (1.05 + art * 0.15);
  const th = cell * (0.52 + reveal * 0.48);
  const originX = cssSize / 2;
  const originY = cssSize * (0.22 + reveal * 0.12);

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
    const finder = isFinderModule(row, col, n);
    const fill = dark
      ? finder
        ? SAKURA_QR.darkDeep
        : reveal > 0.45
          ? SAKURA_QR.darkBlossom
          : SAKURA_QR.dark
      : finder
        ? SAKURA_QR.lightPure
        : reveal > 0.45
          ? SAKURA_QR.blossomWhite
          : SAKURA_QR.plot;
    const height = (dark ? cell * 0.35 : cell * 0.12) * art;
    drawIsoTile(ctx, isoX, isoY, tw * 0.92, th * 0.92, height, fill);
  }

  const treeX = originX;
  const treeY = originY + ((n * th) / 2) * 0.42;
  const treeSize = n * cell * 1.35;
  if (art > 0.04) {
    const sway = reducedMotion ? 0 : Math.sin(timeMs * 0.0018) * 8 * art;
    ctx.save();
    ctx.translate(treeX, treeY + treeSize * 0.22);
    ctx.scale(1, Math.max(0.06, art));
    ctx.translate(-treeX, -(treeY + treeSize * 0.22));
    ctx.translate(sway, 0);
    drawTree(ctx, treeX, treeY, treeSize, rng, art);
    ctx.restore();
  }

  if (!reducedMotion && art > 0.08) {
    for (let i = 0; i < 28; i += 1) {
      const seed = mulberry32(matrix.seed + i * 97)();
      const fall = (timeMs * (0.045 + seed * 0.04) + seed * 400) % (treeSize * 0.85);
      const x = treeX + (seed - 0.5) * treeSize * 0.28 + Math.sin(timeMs * 0.0012 + i) * 10;
      const y = treeY - treeSize * 0.22 + fall;
      ctx.globalAlpha = 0.85 * art;
      drawBlossom(ctx, x, y, 5 + seed * 5, timeMs * 0.002 + i, false);
      ctx.globalAlpha = 1;
    }
  }
}

export async function mountSakuraQrCanvas(
  canvas: HTMLCanvasElement,
  options: SakuraQrMountOptions,
): Promise<SakuraQrMount> {
  const matrix = encodeSakuraQr(options.url);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D is unavailable");

  let targetReveal = options.reveal ? 1 : 0;
  let reveal = targetReveal;
  let frame = 0;
  let disposed = false;
  let cssSize = 240;

  function resize() {
    const parent = canvas.parentElement;
    cssSize = Math.max(1, parent?.clientWidth || canvas.clientWidth || 240);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render(timeMs: number) {
    reveal += (targetReveal - reveal) * (options.reducedMotion ? 1 : 0.08);
    if (Math.abs(targetReveal - reveal) < 0.002) reveal = targetReveal;
    paint(ctx, matrix, cssSize, reveal, timeMs, options.reducedMotion);
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
        cssSize,
        mode === "scan" ? 1 : reveal,
        0,
        options.reducedMotion,
      );
      const dataUrl = canvas.toDataURL("image/png");
      if (mode === "scan") {
        paint(ctx, matrix, cssSize, reveal, 0, options.reducedMotion);
      }
      return dataUrl;
    },
    dispose() {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    },
  };
}
