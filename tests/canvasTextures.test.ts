import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_COPY,
  createFestivalPosterTexture,
  createKonbiniSignTexture,
  createPylonSignTexture,
  createStripedFabricTexture,
  createTrashLabelsTexture,
  createVendingFrontTexture,
} from '../src/rendering/canvasTextures';

const FORBIDDEN_BRANDS = [
  '7-eleven',
  '7eleven',
  'seven-eleven',
  'セブンイレブン',
  'lawson',
  'ローソン',
  'familymart',
  'ファミリーマート',
  'ministop',
  'ミニストップ',
];

function assertNoRealWorldBrands(text: string): void {
  const lower = text.toLowerCase();
  for (const brand of FORBIDDEN_BRANDS) {
    expect(lower).not.toContain(brand);
  }
}

describe('Original Japanese Kana Signage & Procedural Canvas Textures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines original Umikaze Mart Japanese kana copy and festival posters with zero real-world trademarks', () => {
    expect(BRAND_COPY.mainKana).toBe('うみかぜマート');
    expect(BRAND_COPY.subKana).toBe('24じかん・うみべのコンビニ');
    expect(BRAND_COPY.posters).toEqual(['夏祭り', '花火大会', 'つめたい氷', 'なつ限定']);

    const combined = [
      BRAND_COPY.mainKana,
      BRAND_COPY.subKana,
      ...BRAND_COPY.posters,
    ].join(' ');
    assertNoRealWorldBrands(combined);
  });

  it('produces clean DataTexture fallbacks in default unmocked jsdom without throwing or stderr errors', () => {
    const signTex = createKonbiniSignTexture();
    expect(signTex).toBeInstanceOf(THREE.DataTexture);
    expect(signTex.userData.textContent).toContain('うみかぜマート');
    assertNoRealWorldBrands(JSON.stringify(signTex.userData));
  });

  it('gracefully falls back to valid sRGB DataTexture with metadata when headless jsdom 2D context is null', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const signTex = createKonbiniSignTexture();
    expect(signTex).toBeInstanceOf(THREE.DataTexture);
    expect(signTex.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(signTex.userData.label).toBeTruthy();
    expect(signTex.userData.textContent).toContain('うみかぜマート');
    assertNoRealWorldBrands(JSON.stringify(signTex.userData));

    const pylonTex = createPylonSignTexture();
    expect(pylonTex).toBeInstanceOf(THREE.DataTexture);
    expect(pylonTex.userData.textContent).toContain('うみかぜ');
    assertNoRealWorldBrands(JSON.stringify(pylonTex.userData));

    const posterVariants = ['matsuri', 'hanabi', 'koori', 'natsu'] as const;
    const expectedKanji = ['夏祭り', '花火大会', 'つめたい氷', 'なつ限定'];
    posterVariants.forEach((variant, idx) => {
      const posterTex = createFestivalPosterTexture(variant);
      expect(posterTex).toBeInstanceOf(THREE.DataTexture);
      expect(posterTex.userData.textContent).toContain(expectedKanji[idx]);
      assertNoRealWorldBrands(JSON.stringify(posterTex.userData));
    });

    const vendingBlue = createVendingFrontTexture('blue');
    const vendingCream = createVendingFrontTexture('cream');
    expect(vendingBlue).toBeInstanceOf(THREE.DataTexture);
    expect(vendingCream).toBeInstanceOf(THREE.DataTexture);
    assertNoRealWorldBrands(JSON.stringify(vendingBlue.userData));
    assertNoRealWorldBrands(JSON.stringify(vendingCream.userData));

    const trashTex = createTrashLabelsTexture();
    expect(trashTex).toBeInstanceOf(THREE.DataTexture);
    expect(trashTex.userData.textContent).toBeTruthy();
    assertNoRealWorldBrands(JSON.stringify(trashTex.userData));

    const stripedTex = createStripedFabricTexture('#4fa3c7', '#fff8ec', 8);
    expect(stripedTex).toBeInstanceOf(THREE.DataTexture);
    expect(stripedTex.wrapS).toBe(THREE.RepeatWrapping);
    expect(stripedTex.wrapT).toBe(THREE.RepeatWrapping);
  });

  it('draws crisp Japanese kana typography onto Canvas2D when a 2D context is available', () => {
    const drawnTexts: string[] = [];
    const gradientStub = { addColorStop: vi.fn() };
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      createLinearGradient: vi.fn(() => gradientStub),
      createRadialGradient: vi.fn(() => gradientStub),
      fillText: vi.fn((text: string) => {
        drawnTexts.push(text);
      }),
      strokeText: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 24 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'round',
      lineJoin: 'round',
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
      globalAlpha: 1,
      shadowColor: 'transparent',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D;

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      ((contextId: string) => (contextId === '2d' ? mockCtx : null)) as typeof HTMLCanvasElement.prototype.getContext,
    );

    const signTex = createKonbiniSignTexture();
    expect(signTex).toBeInstanceOf(THREE.CanvasTexture);
    expect(signTex.colorSpace).toBe(THREE.SRGBColorSpace);

    createPylonSignTexture();
    createFestivalPosterTexture('matsuri');
    createFestivalPosterTexture('hanabi');
    createFestivalPosterTexture('koori');
    createFestivalPosterTexture('natsu');
    createVendingFrontTexture('blue');
    createVendingFrontTexture('cream');
    createTrashLabelsTexture();
    createStripedFabricTexture('#ff9e7d', '#fff8ec', 6);

    const allDrawn = drawnTexts.join(' ');
    expect(allDrawn).toContain('うみかぜマート');
    expect(allDrawn).toContain('夏祭り');
    expect(allDrawn).toContain('花火大会');
    expect(allDrawn).toContain('つめたい氷');
    expect(allDrawn).toContain('なつ限定');
    assertNoRealWorldBrands(allDrawn);
  });
});
