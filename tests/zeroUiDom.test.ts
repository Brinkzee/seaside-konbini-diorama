import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Zero-UI Fullscreen Stage DOM', () => {
  const htmlPath = resolve(__dirname, '../index.html');

  it('provides a pure canvas stage with dynamic viewport units and zero UI overlays', () => {
    const html = readFileSync(htmlPath, 'utf-8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const stage = doc.querySelector('#stage');
    const canvas = doc.querySelector('#stage > canvas#diorama-canvas');
    const entryScript = doc.querySelector('script[type="module"][src="/src/main.ts"]');
    const inlineFavicon = doc.querySelector('head > link[rel="icon"][href^="data:"]');
    expect(stage).not.toBeNull();
    expect(canvas).not.toBeNull();
    expect(entryScript).not.toBeNull();
    expect(inlineFavicon).not.toBeNull();

    // Forbidden UI elements
    const forbiddenSelectors = [
      'button',
      'input',
      'select',
      'textarea',
      'nav',
      'header',
      'footer',
      'aside',
      'dialog',
      'form',
      'label',
      'a',
      '[role="button"]',
      '[role="toolbar"]',
    ];
    for (const selector of forbiddenSelectors) {
      expect(doc.querySelectorAll(selector).length).toBe(0);
    }

    // Body must have zero visible text content outside script/style
    const bodyClone = doc.body.cloneNode(true) as HTMLElement;
    bodyClone.querySelectorAll('script, style').forEach((el) => el.remove());
    expect(bodyClone.textContent?.trim() ?? '').toBe('');

    // Verify modern viewport, CSS reset & offscreen optimization rules
    expect(html).toContain('#1a2542');
    expect(html).toContain('touch-action');
    expect(html).toContain('overflow');
    expect(html).toContain('100vw');
    expect(html).toContain('100vh');
    expect(html).toContain('100dvw');
    expect(html).toContain('100dvh');
    expect(html).toContain('content-visibility: auto');
    expect(html).toContain('contain-intrinsic-size: auto 100dvw auto 100dvh');
  });
});
