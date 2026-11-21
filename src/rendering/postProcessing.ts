import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface PostProcessingOptions {
  msaaSamples?: number;
  bloomScale?: number;
}

export interface PostProcessingPipeline {
  render: (deltaSeconds: number) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  dispose: () => void;
}

const BLOOM_STRENGTH = 0.28;
const BLOOM_RADIUS = 0.35;
const BLOOM_THRESHOLD = 0.88;

/**
 * Creates a GPU-tier-aware MSAA HDR EffectComposer pipeline with RenderPass,
 * scalable selective UnrealBloomPass (~0.88 threshold, ~0.28 strength,
 * ~0.35 radius) so warm konbini signboards & interior lights glow softly,
 * followed by OutputPass for ACESFilmic + sRGB transfer.
 */
export function createPostProcessingPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options?: PostProcessingOptions,
): PostProcessingPipeline {
  const initialSize = renderer.getSize(new THREE.Vector2());
  const safeWidth = Math.max(1, Math.floor(initialSize.x));
  const safeHeight = Math.max(1, Math.floor(initialSize.y));
  const pixelRatio = Math.max(1, renderer.getPixelRatio?.() ?? 1);

  const requestedSamples = Math.max(0, Math.floor(options?.msaaSamples ?? 2));
  const samples = renderer.capabilities?.isWebGL2 === false ? 0 : requestedSamples;
  const bloomScale = THREE.MathUtils.clamp(options?.bloomScale ?? 0.5, 0.25, 1.0);

  const msaaRenderTarget = new THREE.WebGLRenderTarget(safeWidth, safeHeight, {
    type: THREE.HalfFloatType,
    samples,
  });

  const composer = new EffectComposer(renderer, msaaRenderTarget);
  composer.setPixelRatio(pixelRatio);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const calcScaledBloomRes = (w: number, h: number, pr: number): [number, number] => [
    Math.max(1, Math.floor(w * pr * bloomScale)),
    Math.max(1, Math.floor(h * pr * bloomScale)),
  ];

  const [initBloomW, initBloomH] = calcScaledBloomRes(safeWidth, safeHeight, pixelRatio);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(initBloomW, initBloomH),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  );
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  composer.setSize(safeWidth, safeHeight);
  // EffectComposer.setSize scales all passes to full effective resolution; apply tier bloomScale
  bloomPass.setSize(initBloomW, initBloomH);

  return {
    render(deltaSeconds: number): void {
      composer.render(deltaSeconds);
    },
    setSize(width: number, height: number, nextPixelRatio: number): void {
      const clampedW = Math.max(1, Math.floor(width));
      const clampedH = Math.max(1, Math.floor(height));
      const clampedPR = Math.max(1, nextPixelRatio);
      composer.setPixelRatio(clampedPR);
      composer.setSize(clampedW, clampedH);
      const [scaledW, scaledH] = calcScaledBloomRes(clampedW, clampedH, clampedPR);
      bloomPass.setSize(scaledW, scaledH);
    },
    dispose(): void {
      bloomPass.dispose();
      outputPass.dispose();
      composer.dispose();
    },
  };
}
