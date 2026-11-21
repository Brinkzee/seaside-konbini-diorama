import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { updateDioramaAnimations } from '../animation/animationSystem';
import { createPostProcessingPipeline, type PostProcessingPipeline } from '../rendering/postProcessing';
import { buildDioramaWorld, type DioramaWorld } from '../world/buildDioramaWorld';
import {
  detectWebGLGpuProfile,
  type GpuAdapterProfile,
  type GpuQualityTier,
} from './gpuAdapterProfile';

export interface DioramaAppOptions {
  stageElement: HTMLElement;
  canvasElement: HTMLCanvasElement;
}

export interface DioramaPerformanceStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  gpuVendor: string;
  gpuRenderer: string;
  gpuTier: GpuQualityTier;
  powerPreference: WebGLPowerPreference;
  pixelRatio: number;
  msaaSamples: number;
  bloomScale: number;
}

declare global {
  interface Window {
    __dioramaStats?: DioramaPerformanceStats;
  }
}

export const INITIAL_CAMERA_POSITION = new THREE.Vector3(25.8, 17.4, 27.8);
export const INITIAL_CAMERA_TARGET = new THREE.Vector3(0.4, -0.2, 0.6);
export const INITIAL_CAMERA_FOV = 38;

const REQUESTED_POWER_PREFERENCE: WebGLPowerPreference = 'high-performance';

export class DioramaApp {
  private readonly stageElement: HTMLElement;
  private readonly canvasElement: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly gpuProfile: GpuAdapterProfile;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly world: DioramaWorld;
  private readonly postProcessing: PostProcessingPipeline;

  private activePixelRatio = 1;
  private rafId: number | null = null;
  private lastFrameTimeMs = 0;
  private elapsedSeconds = 0;
  private isDocumentVisible = true;
  private isStageOnscreen = true;
  private disposed = false;

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private cleanupContentVisibility: (() => void) | null = null;

  constructor(options: DioramaAppOptions) {
    this.stageElement = options.stageElement;
    this.canvasElement = options.canvasElement;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasElement,
      antialias: false,
      stencil: false,
      powerPreference: REQUESTED_POWER_PREFERENCE,
    });

    this.gpuProfile = detectWebGLGpuProfile(this.renderer);
    const { width, height, pixelRatio } = this.measureViewport();
    this.activePixelRatio = pixelRatio;

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.info.autoReset = false;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);

    console.debug(
      `[DioramaApp] GPU tier=${this.gpuProfile.tier} | renderer="${this.gpuProfile.renderer}" | dpr=${pixelRatio} | msaa=${this.gpuProfile.msaaSamples}x | bloom=${this.gpuProfile.bloomScale}`,
    );

    this.camera = new THREE.PerspectiveCamera(INITIAL_CAMERA_FOV, width / height, 0.25, 400);
    this.camera.position.copy(INITIAL_CAMERA_POSITION);

    this.controls = new OrbitControls(this.camera, this.canvasElement);
    this.controls.target.copy(INITIAL_CAMERA_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = false;
    this.controls.enableZoom = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 54;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.camera.lookAt(this.controls.target);
    this.controls.update();

    this.world = buildDioramaWorld();
    this.postProcessing = createPostProcessingPipeline(
      this.renderer,
      this.world.scene,
      this.camera,
      {
        msaaSamples: this.gpuProfile.msaaSamples,
        bloomScale: this.gpuProfile.bloomScale,
      },
    );
    this.postProcessing.setSize(width, height, pixelRatio);

    if (typeof window !== 'undefined') {
      Object.defineProperty(window, '__dioramaStats', {
        configurable: true,
        enumerable: false,
        get: () => this.getPerformanceStats(),
      });
    }

    this.bindLifecycleListeners();
  }

  public getPerformanceStats(): DioramaPerformanceStats {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      gpuVendor: this.gpuProfile.vendor,
      gpuRenderer: this.gpuProfile.renderer,
      gpuTier: this.gpuProfile.tier,
      powerPreference: REQUESTED_POWER_PREFERENCE,
      pixelRatio: this.activePixelRatio,
      msaaSamples: this.gpuProfile.msaaSamples,
      bloomScale: this.gpuProfile.bloomScale,
    };
  }

  public start(): void {
    if (this.disposed) {
      return;
    }
    this.isDocumentVisible = document.visibilityState !== 'hidden';
    // Render crisp initial frame immediately before scheduling animation loop
    updateDioramaAnimations(this.world.animationTargets, this.elapsedSeconds, 0);
    this.controls.update();
    this.renderer.info.reset();
    this.postProcessing.render(0);
    this.syncAnimationLoop();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleDocumentVisibility);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    if (this.cleanupContentVisibility) {
      this.cleanupContentVisibility();
      this.cleanupContentVisibility = null;
    }

    this.controls.dispose();
    this.postProcessing.dispose();
    this.renderer.dispose();
  }

  private measureViewport(): { width: number; height: number; pixelRatio: number } {
    const width = Math.max(1, this.stageElement.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, this.stageElement.clientHeight || window.innerHeight || 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.gpuProfile.maxPixelRatio);
    return { width, height, pixelRatio };
  }

  private readonly handleResize = (): void => {
    if (this.disposed) {
      return;
    }
    const { width, height, pixelRatio } = this.measureViewport();
    this.activePixelRatio = pixelRatio;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.postProcessing.setSize(width, height, pixelRatio);
  };

  private readonly handleDocumentVisibility = (): void => {
    this.isDocumentVisible = document.visibilityState !== 'hidden';
    this.syncAnimationLoop();
  };

  private bindLifecycleListeners(): void {
    window.addEventListener('resize', this.handleResize, { passive: true });
    document.addEventListener('visibilitychange', this.handleDocumentVisibility);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.stageElement);
    }

    const supportsContentVisibility =
      typeof document !== 'undefined' &&
      'contentVisibility' in document.documentElement.style;

    if (supportsContentVisibility) {
      const onContentVisibilityAutoStateChange = (event: Event): void => {
        const cvEvent = event as Event & { skipped?: boolean };
        this.isStageOnscreen = !cvEvent.skipped;
        this.syncAnimationLoop();
      };
      this.stageElement.addEventListener(
        'contentvisibilityautostatechange',
        onContentVisibilityAutoStateChange,
      );
      this.cleanupContentVisibility = () => {
        this.stageElement.removeEventListener(
          'contentvisibilityautostatechange',
          onContentVisibilityAutoStateChange,
        );
      };
    } else if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === this.stageElement) {
            this.isStageOnscreen = entry.isIntersecting;
            this.syncAnimationLoop();
          }
        }
      });
      this.intersectionObserver.observe(this.stageElement);
    }
  }

  private shouldAnimate(): boolean {
    return !this.disposed && this.isDocumentVisible && this.isStageOnscreen;
  }

  private syncAnimationLoop(): void {
    if (this.shouldAnimate()) {
      if (this.rafId === null) {
        this.lastFrameTimeMs = performance.now();
        this.rafId = requestAnimationFrame(this.tick);
      }
    } else if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tick = (nowMs: number): void => {
    this.rafId = null;
    if (!this.shouldAnimate()) {
      return;
    }

    const rawDelta = (nowMs - this.lastFrameTimeMs) * 0.001;
    this.lastFrameTimeMs = nowMs;
    const deltaSeconds = Math.min(Math.max(rawDelta, 0), 0.1);
    this.elapsedSeconds += deltaSeconds;

    // Keep ground pan target above collector tray bottom
    if (this.controls.target.y < -0.6) {
      this.controls.target.y = -0.6;
    }

    this.controls.update();
    updateDioramaAnimations(this.world.animationTargets, this.elapsedSeconds, deltaSeconds);
    this.renderer.info.reset();
    this.postProcessing.render(deltaSeconds);

    this.rafId = requestAnimationFrame(this.tick);
  };
}
