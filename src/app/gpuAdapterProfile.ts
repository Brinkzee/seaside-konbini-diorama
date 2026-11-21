import type * as THREE from 'three';

export type GpuQualityTier = 'discrete-ultra' | 'integrated-balanced' | 'software-fallback';

export interface GpuAdapterProfile {
  vendor: string;
  renderer: string;
  tier: GpuQualityTier;
  maxPixelRatio: number;
  msaaSamples: number;
  bloomScale: number;
}

const SOFTWARE_GPU_PATTERN =
  /swiftshader|llvmpipe|softpipe|microsoft basic render|lavapipe|mesa offscreen|virtualbox|vmware/i;

const DISCRETE_GPU_PATTERN =
  /nvidia|geforce|\brtx\b|\bgtx\b|quadro|titan|radeon\s+rx|\brx\s*\d{3,4}|radeon\s+pro|firepro|intel.*arc\s+[ab]\d{3}|apple\s+m\d+\s+(pro|max|ultra)/i;

/**
 * Classifies a WebGL renderer/vendor string into a deterministic quality tier:
 * - `discrete-ultra`: dedicated GPUs (RTX / GTX / Radeon RX / Arc dGPU / Apple M Pro-Max-Ultra) -> 2.0 DPR, 4x MSAA, 1.0x Bloom
 * - `integrated-balanced`: laptop iGPUs (Intel Graphics / Iris Xe / UHD / Radeon iGPU) -> 1.5 DPR, 2x MSAA, 0.5x Bloom
 * - `software-fallback`: CPU rasterizers (SwiftShader / Basic Render / llvmpipe) -> 1.0 DPR, 0x MSAA, 0.5x Bloom
 */
export function classifyGpuRendererString(
  renderer: string,
  vendor = '',
): GpuAdapterProfile {
  const cleanRenderer = (renderer || 'Unknown WebGL Renderer').trim();
  const cleanVendor = (vendor || 'Unknown Vendor').trim();
  const combined = `${cleanVendor} ${cleanRenderer}`;

  if (SOFTWARE_GPU_PATTERN.test(combined)) {
    return {
      vendor: cleanVendor,
      renderer: cleanRenderer,
      tier: 'software-fallback',
      maxPixelRatio: 1.0,
      msaaSamples: 0,
      bloomScale: 0.5,
    };
  }

  if (DISCRETE_GPU_PATTERN.test(combined)) {
    return {
      vendor: cleanVendor,
      renderer: cleanRenderer,
      tier: 'discrete-ultra',
      maxPixelRatio: 2.0,
      msaaSamples: 4,
      bloomScale: 1.0,
    };
  }

  return {
    vendor: cleanVendor,
    renderer: cleanRenderer,
    tier: 'integrated-balanced',
    maxPixelRatio: 1.5,
    msaaSamples: 2,
    bloomScale: 0.5,
  };
}

/**
 * Queries `WEBGL_debug_renderer_info` (with graceful fallback to standard `RENDERER`/`VENDOR`
 * parameters on masked or headless contexts) to build the active GPU quality profile.
 */
export function detectWebGLGpuProfile(renderer: THREE.WebGLRenderer): GpuAdapterProfile {
  let rawVendor = 'Unknown Vendor';
  let rawRenderer = 'Unknown WebGL Renderer';

  try {
    const gl = renderer.getContext?.();
    if (gl) {
      const debugExt = gl.getExtension?.('WEBGL_debug_renderer_info') as {
        UNMASKED_VENDOR_WEBGL: number;
        UNMASKED_RENDERER_WEBGL: number;
      } | null;

      if (debugExt) {
        const unmaskedVendor = gl.getParameter?.(debugExt.UNMASKED_VENDOR_WEBGL);
        const unmaskedRenderer = gl.getParameter?.(debugExt.UNMASKED_RENDERER_WEBGL);
        if (typeof unmaskedVendor === 'string' && unmaskedVendor.length > 0) {
          rawVendor = unmaskedVendor;
        }
        if (typeof unmaskedRenderer === 'string' && unmaskedRenderer.length > 0) {
          rawRenderer = unmaskedRenderer;
        }
      }

      if (rawVendor === 'Unknown Vendor' && typeof gl.VENDOR === 'number') {
        const fallbackVendor = gl.getParameter?.(gl.VENDOR);
        if (typeof fallbackVendor === 'string' && fallbackVendor.length > 0) {
          rawVendor = fallbackVendor;
        }
      }

      if (rawRenderer === 'Unknown WebGL Renderer' && typeof gl.RENDERER === 'number') {
        const fallbackRenderer = gl.getParameter?.(gl.RENDERER);
        if (typeof fallbackRenderer === 'string' && fallbackRenderer.length > 0) {
          rawRenderer = fallbackRenderer;
        }
      }
    }
  } catch {
    // Ignore restricted WebGL parameter queries in sandboxed/headless environments
  }

  const profile = classifyGpuRendererString(rawRenderer, rawVendor);
  if (renderer.capabilities?.isWebGL2 === false) {
    return {
      ...profile,
      msaaSamples: 0,
    };
  }
  return profile;
}
