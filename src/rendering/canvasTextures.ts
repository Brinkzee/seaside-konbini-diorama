import * as THREE from 'three';

export const BRAND_COPY = {
  mainKana: 'うみかぜマート',
  subKana: '24じかん・うみべのコンビニ',
  posters: ['夏祭り', '花火大会', 'つめたい氷', 'なつ限定'],
} as const;

const JP_ROUNDED_FONT =
  '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", "Meiryo", "Noto Sans JP", sans-serif';

interface TextureMetadata {
  label: string;
  textContent: string;
  variant?: string;
  isFallback?: boolean;
}

function tryAcquire2DContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (
    typeof navigator !== 'undefined' &&
    /jsdom/i.test(navigator.userAgent ?? '')
  ) {
    const getCtxFn = canvas.getContext as unknown as { mock?: unknown } | undefined;
    if (!getCtxFn || !('mock' in getCtxFn)) {
      return null;
    }
  }
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function createBandFallbackDataTexture(
  width: number,
  height: number,
  colors: string[],
  meta: TextureMetadata,
  vertical = false,
): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const parsed = colors.map((hex) => new THREE.Color(hex));
  const tmpColor = new THREE.Color();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = vertical ? x / Math.max(1, width) : y / Math.max(1, height);
      const bandIdx = Math.min(parsed.length - 1, Math.floor(t * parsed.length));
      tmpColor.copy(parsed[bandIdx]);
      // Convert linear Color components back to sRGB bytes for SRGBColorSpace DataTexture
      const r = Math.round(Math.min(1, Math.max(0, Math.pow(tmpColor.r, 1 / 2.2))) * 255);
      const g = Math.round(Math.min(1, Math.max(0, Math.pow(tmpColor.g, 1 / 2.2))) * 255);
      const b = Math.round(Math.min(1, Math.max(0, Math.pow(tmpColor.b, 1 / 2.2))) * 255);
      const stride = (y * width + x) * 4;
      data[stride] = r;
      data[stride + 1] = g;
      data[stride + 2] = b;
      data[stride + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.userData = {
    ...meta,
    isFallback: true,
  };
  return texture;
}

function finalizeCanvasTexture(
  canvas: HTMLCanvasElement,
  meta: TextureMetadata,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.userData = {
    ...meta,
    isFallback: false,
  };
  return texture;
}

function drawWaveEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.save();
  // Warm peach sunset disc inside sea-salt circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#4fa3c7';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy - radius * 0.1, radius * 0.56, 0, Math.PI * 2);
  ctx.fillStyle = '#ff9e7d';
  ctx.fill();

  // Cream & mint lower wave bands
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.92, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#68d3b8';
  ctx.fill();

  ctx.strokeStyle = '#fff8ec';
  ctx.lineWidth = Math.max(3, radius * 0.11);
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.72, cy + radius * 0.18);
  ctx.quadraticCurveTo(cx - radius * 0.35, cy + radius * 0.02, cx, cy + radius * 0.18);
  ctx.quadraticCurveTo(cx + radius * 0.35, cy + radius * 0.34, cx + radius * 0.72, cy + radius * 0.16);
  ctx.stroke();
  ctx.restore();
}

/**
 * Fascia signboard texture for the storefront lightbox bearing original kana
 * `'うみかぜマート'` and seaside tri-band stripes (sea-salt blue, mint green, peach orange).
 */
export function createKonbiniSignTexture(): THREE.Texture {
  const width = 1024;
  const height = 256;
  const meta: TextureMetadata = {
    label: 'konbini-fascia-sign',
    textContent: `${BRAND_COPY.mainKana} ${BRAND_COPY.subKana}`,
  };

  if (typeof document === 'undefined') {
    return createBandFallbackDataTexture(
      32,
      8,
      ['#4fa3c7', '#fff8ec', '#ff9a76', '#68d3b8'],
      meta,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = tryAcquire2DContext(canvas);
  if (!ctx) {
    return createBandFallbackDataTexture(
      32,
      8,
      ['#4fa3c7', '#fff8ec', '#ff9a76', '#68d3b8'],
      meta,
    );
  }

  // Warm cream lightbox body
  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(0, 0, width, height);

  // Top & bottom signature coastal stripes
  ctx.fillStyle = '#4fa3c7';
  ctx.fillRect(0, 0, width, 34);
  ctx.fillStyle = '#68d3b8';
  ctx.fillRect(0, 34, width, 14);

  ctx.fillStyle = '#ff9a76';
  ctx.fillRect(0, height - 46, width, 28);
  ctx.fillStyle = '#4fa3c7';
  ctx.fillRect(0, height - 18, width, 18);

  // Emblem on left
  drawWaveEmblem(ctx, 118, height * 0.5, 58);

  // Main kana brand title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 84px ${JP_ROUNDED_FONT}`;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(BRAND_COPY.mainKana, 520, 110);
  ctx.fillStyle = '#1f305e';
  ctx.fillText(BRAND_COPY.mainKana, 520, 110);

  // Subtitle pill
  ctx.font = `700 27px ${JP_ROUNDED_FONT}`;
  ctx.fillStyle = '#3b6b8f';
  ctx.fillText(BRAND_COPY.subKana, 520, 178);

  // Right 24H coastal badge
  drawRoundedRectPath(ctx, 880, 74, 108, 106, 20);
  ctx.fillStyle = '#4fa3c7';
  ctx.fill();
  ctx.fillStyle = '#fff8ec';
  ctx.font = `800 34px ${JP_ROUNDED_FONT}`;
  ctx.fillText('24H', 934, 114);
  ctx.font = `700 20px ${JP_ROUNDED_FONT}`;
  ctx.fillText('うみべ', 934, 152);

  return finalizeCanvasTexture(canvas, meta);
}

/**
 * Vertical pylon sign texture for the street-corner free-standing lightbox.
 */
export function createPylonSignTexture(): THREE.Texture {
  const width = 512;
  const height = 768;
  const meta: TextureMetadata = {
    label: 'konbini-pylon-sign',
    textContent: `${BRAND_COPY.mainKana} 氷・おにぎり 24H`,
  };

  if (typeof document === 'undefined') {
    return createBandFallbackDataTexture(
      16,
      24,
      ['#4fa3c7', '#fff8ec', '#ff9e7d', '#68d3b8'],
      meta,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = tryAcquire2DContext(canvas);
  if (!ctx) {
    return createBandFallbackDataTexture(
      16,
      24,
      ['#4fa3c7', '#fff8ec', '#ff9e7d', '#68d3b8'],
      meta,
    );
  }

  ctx.fillStyle = '#fff8ec';
  ctx.fillRect(0, 0, width, height);

  // Outer frame
  ctx.strokeStyle = '#4fa3c7';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, width - 18, height - 18);

  // Top emblem
  drawWaveEmblem(ctx, width * 0.5, 148, 86);

  // Stacked large kana
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1f305e';
  ctx.font = `900 80px ${JP_ROUNDED_FONT}`;
  ctx.fillText('うみかぜ', width * 0.5, 316);
  ctx.font = `900 82px ${JP_ROUNDED_FONT}`;
  ctx.fillText('マート', width * 0.5, 412);

  // Decorative coastal bands
  ctx.fillStyle = '#68d3b8';
  ctx.fillRect(36, 478, width - 72, 22);
  ctx.fillStyle = '#ff9a76';
  ctx.fillRect(36, 508, width - 72, 22);

  // Category tags
  ctx.fillStyle = '#2d577b';
  ctx.font = `700 34px ${JP_ROUNDED_FONT}`;
  ctx.fillText('氷・おにぎり・冷たい飲物', width * 0.5, 588);

  drawRoundedRectPath(ctx, 136, 638, width - 272, 78, 22);
  ctx.fillStyle = '#ff9a76';
  ctx.fill();
  ctx.fillStyle = '#fff8ec';
  ctx.font = `800 40px ${JP_ROUNDED_FONT}`;
  ctx.fillText('24じかん', width * 0.5, 678);

  return finalizeCanvasTexture(canvas, meta);
}

/**
 * Hand-painted anime summer poster textures for the community noticeboard and store windows.
 */
export function createFestivalPosterTexture(
  variant: 'matsuri' | 'hanabi' | 'koori' | 'natsu',
): THREE.Texture {
  const width = 384;
  const height = 512;

  const configMap = {
    matsuri: {
      title: BRAND_COPY.posters[0], // 夏祭り
      subtitle: 'うみべ神社・よる七時',
      bgTop: '#263b6e',
      bgBottom: '#ff9e7d',
      accent: '#ff6b7a',
      titleColor: '#fff8ec',
    },
    hanabi: {
      title: BRAND_COPY.posters[1], // 花火大会
      subtitle: '八月・かいがん広場',
      bgTop: '#18254a',
      bgBottom: '#3e6294',
      accent: '#ffb86b',
      titleColor: '#ffe9b8',
    },
    koori: {
      title: BRAND_COPY.posters[2], // つめたい氷
      subtitle: 'いちご・メロン・ラムネ',
      bgTop: '#e8f9ff',
      bgBottom: '#fff8ec',
      accent: '#4fa3c7',
      titleColor: '#d9455f',
    },
    natsu: {
      title: BRAND_COPY.posters[3], // なつ限定
      subtitle: 'うみかぜ夏フェア',
      bgTop: '#7be0c8',
      bgBottom: '#fff6e5',
      accent: '#ff9a76',
      titleColor: '#1f305e',
    },
  } as const;

  const cfg = configMap[variant];
  const meta: TextureMetadata = {
    label: `festival-poster-${variant}`,
    textContent: `${cfg.title} ${cfg.subtitle}`,
    variant,
  };

  if (typeof document === 'undefined') {
    return createBandFallbackDataTexture(
      12,
      16,
      [cfg.bgTop, cfg.accent, cfg.bgBottom],
      meta,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = tryAcquire2DContext(canvas);
  if (!ctx) {
    return createBandFallbackDataTexture(
      12,
      16,
      [cfg.bgTop, cfg.accent, cfg.bgBottom],
      meta,
    );
  }

  // Paper border + gradient backdrop
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 18, 0, height - 18);
  grad.addColorStop(0, cfg.bgTop);
  grad.addColorStop(1, cfg.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(16, 16, width - 32, height - 32);

  // Variant-specific anime illustration motif
  if (variant === 'matsuri') {
    // Glowing festival paper lanterns (chochin)
    const lanternX = [92, 192, 292];
    lanternX.forEach((lx, i) => {
      const ly = 132 + (i % 2) * 22;
      ctx.beginPath();
      ctx.arc(lx, ly, 34, 0, Math.PI * 2);
      ctx.fillStyle = i === 1 ? '#fff4d6' : '#ff6b7a';
      ctx.fill();
      ctx.fillStyle = '#23293d';
      ctx.fillRect(lx - 14, ly - 38, 28, 8);
      ctx.fillRect(lx - 14, ly + 30, 28, 8);
    });
  } else if (variant === 'hanabi') {
    // Stylized coral/gold/cyan firework bursts over calm sea
    const centers: Array<[number, number, number, string]> = [
      [135, 150, 68, '#ff8fab'],
      [258, 128, 52, '#ffe2a8'],
      [205, 210, 42, '#72efdd'],
    ];
    for (const [cx, cy, rad, col] of centers) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 5;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 10);
        ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        ctx.stroke();
      }
    }
  } else if (variant === 'koori') {
    // Classic shaved ice bowl + blue waves
    ctx.strokeStyle = '#5b9bd5';
    ctx.lineWidth = 8;
    for (let wy = 115; wy <= 155; wy += 20) {
      ctx.beginPath();
      ctx.moveTo(58, wy);
      ctx.quadraticCurveTo(128, wy - 18, 192, wy);
      ctx.quadraticCurveTo(256, wy + 18, 326, wy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(192, 225, 58, Math.PI, 0);
    ctx.fillStyle = '#ff8fab';
    ctx.fill();
    ctx.fillStyle = '#4fa3c7';
    ctx.fillRect(128, 222, 128, 22);
  } else {
    // Summer swim ring & sun slice
    ctx.beginPath();
    ctx.arc(192, 168, 66, 0, Math.PI * 2);
    ctx.fillStyle = '#ff9a76';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(192, 168, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8ec';
    ctx.fill();
  }

  // Crisp poster typography
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 64px ${JP_ROUNDED_FONT}`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = variant === 'koori' ? '#ffffff' : '#1b2642';
  ctx.strokeText(cfg.title, width * 0.5, 344);
  ctx.fillStyle = cfg.titleColor;
  ctx.fillText(cfg.title, width * 0.5, 344);

  drawRoundedRectPath(ctx, 44, 412, width - 88, 54, 14);
  ctx.fillStyle = '#fff8ec';
  ctx.fill();
  ctx.fillStyle = '#23293d';
  ctx.font = `700 24px ${JP_ROUNDED_FONT}`;
  ctx.fillText(cfg.subtitle, width * 0.5, 439);

  return finalizeCanvasTexture(canvas, meta);
}

/**
 * Illuminated Japanese beverage vending machine front texture (`'blue' | 'cream'`).
 */
export function createVendingFrontTexture(
  variant: 'blue' | 'cream',
): THREE.Texture {
  const width = 512;
  const height = 768;
  const bodyHex = variant === 'blue' ? '#4fa3c7' : '#fff5e4';
  const accentHex = variant === 'blue' ? '#fff8ec' : '#ff9a76';
  const headerText = variant === 'blue' ? 'うみかぜドリンク' : 'つめたい飲みもの';

  const meta: TextureMetadata = {
    label: `vending-front-${variant}`,
    textContent: `${headerText} つめたい`,
    variant,
  };

  if (typeof document === 'undefined') {
    return createBandFallbackDataTexture(
      16,
      24,
      [bodyHex, '#fffdf7', accentHex, '#263248'],
      meta,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = tryAcquire2DContext(canvas);
  if (!ctx) {
    return createBandFallbackDataTexture(
      16,
      24,
      [bodyHex, '#fffdf7', accentHex, '#263248'],
      meta,
    );
  }

  // Machine body
  ctx.fillStyle = bodyHex;
  ctx.fillRect(0, 0, width, height);

  // Header sign bar
  ctx.fillStyle = accentHex;
  ctx.fillRect(28, 24, width - 56, 54);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1f305e';
  ctx.font = `800 30px ${JP_ROUNDED_FONT}`;
  ctx.fillText(headerText, width * 0.5, 51);

  // Warm backlit display showcase window
  drawRoundedRectPath(ctx, 32, 96, width - 64, 382, 14);
  ctx.fillStyle = '#fff9ee';
  ctx.fill();

  const canPalette = [
    '#5ec2e6',
    '#68d3b8',
    '#ff9a76',
    '#ff7b89',
    '#ffd166',
    '#8ecae6',
  ];

  // 3 shelves of cute miniature beverage cans & bottles
  for (let row = 0; row < 3; row++) {
    const shelfY = 196 + row * 116;
    ctx.fillStyle = '#d4dde8';
    ctx.fillRect(46, shelfY, width - 92, 10);

    // Blue COLD price strip
    ctx.fillStyle = '#3b82b6';
    ctx.fillRect(46, shelfY + 10, width - 92, 16);

    for (let col = 0; col < 6; col++) {
      const bx = 62 + col * 66;
      const canH = col % 2 === 0 ? 62 : 72;
      drawRoundedRectPath(ctx, bx, shelfY - canH - 2, 42, canH, 8);
      ctx.fillStyle = canPalette[(row * 2 + col) % canPalette.length];
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + 5, shelfY - canH + 14, 32, 16);
    }
  }

  // Coin / IC panel & glowing pickup flap
  drawRoundedRectPath(ctx, 336, 506, 136, 108, 10);
  ctx.fillStyle = '#2d374d';
  ctx.fill();
  ctx.fillStyle = '#72efdd';
  ctx.font = `700 22px ${JP_ROUNDED_FONT}`;
  ctx.fillText('つめたい', 404, 542);

  drawRoundedRectPath(ctx, 48, 636, width - 96, 96, 14);
  ctx.fillStyle = '#232c40';
  ctx.fill();
  ctx.fillStyle = '#3d4c69';
  ctx.fillRect(68, 654, width - 136, 60);

  return finalizeCanvasTexture(canvas, meta);
}

/**
 * 3-compartment recycling sorting labels for the exterior konbini trash station.
 */
export function createTrashLabelsTexture(): THREE.Texture {
  const width = 512;
  const height = 256;
  const labels = ['もえるゴミ', 'ビン・カン', 'ペットボトル'] as const;
  const colors = ['#ff9a76', '#5b9bd5', '#68d3b8'] as const;

  const meta: TextureMetadata = {
    label: 'konbini-trash-sorting-labels',
    textContent: labels.join(' '),
  };

  if (typeof document === 'undefined') {
    return createBandFallbackDataTexture(
      24,
      12,
      [...colors],
      meta,
      true,
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = tryAcquire2DContext(canvas);
  if (!ctx) {
    return createBandFallbackDataTexture(
      24,
      12,
      [...colors],
      meta,
      true,
    );
  }

  ctx.fillStyle = '#f7efe2';
  ctx.fillRect(0, 0, width, height);

  const colWidth = width / 3;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  labels.forEach((txt, idx) => {
    const x0 = idx * colWidth;
    drawRoundedRectPath(ctx, x0 + 12, 18, colWidth - 24, height - 36, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    drawRoundedRectPath(ctx, x0 + 18, 24, colWidth - 36, 56, 12);
    ctx.fillStyle = colors[idx];
    ctx.fill();

    // Simple clean recycling circle icon
    ctx.beginPath();
    ctx.arc(x0 + colWidth * 0.5, 134, 30, 0, Math.PI * 2);
    ctx.strokeStyle = colors[idx];
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.fillStyle = '#23293d';
    ctx.font = `800 22px ${JP_ROUNDED_FONT}`;
    ctx.fillText(txt, x0 + colWidth * 0.5, 202);
  });

  return finalizeCanvasTexture(canvas, meta);
}

/**
 * Repeating striped canvas fabric texture for the storefront awning and beach umbrellas.
 */
export function createStripedFabricTexture(
  colorA: string,
  colorB: string,
  stripes = 8,
): THREE.Texture {
  const safeStripes = Math.max(2, Math.floor(stripes));
  const width = 256;
  const height = 256;
  const meta: TextureMetadata = {
    label: 'striped-fabric',
    textContent: `stripes:${safeStripes}`,
  };

  const applyRepeatWrapping = <T extends THREE.Texture>(tex: T): T => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };

  const buildAlternatingPalette = (): string[] => {
    const list: string[] = [];
    for (let i = 0; i < safeStripes; i++) {
      list.push(i % 2 === 0 ? colorA : colorB);
    }
    return list;
  };

  if (typeof document === 'undefined') {
    return applyRepeatWrapping(
      createBandFallbackDataTexture(
        safeStripes * 4,
        8,
        buildAlternatingPalette(),
        meta,
        true,
      ),
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = tryAcquire2DContext(canvas);
  if (!ctx) {
    return applyRepeatWrapping(
      createBandFallbackDataTexture(
        safeStripes * 4,
        8,
        buildAlternatingPalette(),
        meta,
        true,
      ),
    );
  }

  const stripeW = width / safeStripes;
  for (let i = 0; i < safeStripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fillRect(i * stripeW, 0, Math.ceil(stripeW), height);
  }

  // Subtle woven fabric horizontal threads so awnings feel tactile close-up
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let y = 0; y < height; y += 8) {
    ctx.fillRect(0, y, width, 2);
  }

  return applyRepeatWrapping(finalizeCanvasTexture(canvas, meta));
}
