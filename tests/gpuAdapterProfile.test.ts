import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  classifyGpuRendererString,
  detectWebGLGpuProfile,
} from '../src/app/gpuAdapterProfile';

describe('WebGL GPU Adapter Classification & Quality Tiering', () => {
  it('unlocks discrete-ultra quality tier for NVIDIA GeForce RTX 5070 Ti Laptop GPU', () => {
    const profile = classifyGpuRendererString(
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Google Inc. (NVIDIA)',
    );

    expect(profile.tier).toBe('discrete-ultra');
    expect(profile.maxPixelRatio).toBe(2.0);
    expect(profile.msaaSamples).toBe(4);
    expect(profile.bloomScale).toBe(1.0);
  });

  it('selects integrated-balanced quality tier for Intel(R) Graphics on Optimus laptops', () => {
    const profile = classifyGpuRendererString(
      'ANGLE (Intel, Intel(R) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Google Inc. (Intel)',
    );

    expect(profile.tier).toBe('integrated-balanced');
    expect(profile.maxPixelRatio).toBe(1.5);
    expect(profile.msaaSamples).toBe(2);
    expect(profile.bloomScale).toBe(0.5);
  });

  it('drops to software-fallback quality tier for SwiftShader / CPU software rasterizers', () => {
    const profile = classifyGpuRendererString(
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)',
      'Google Inc. (Google)',
    );

    expect(profile.tier).toBe('software-fallback');
    expect(profile.maxPixelRatio).toBe(1.0);
    expect(profile.msaaSamples).toBe(0);
    expect(profile.bloomScale).toBe(0.5);
  });

  it('distinguishes discrete Radeon RX from integrated Radeon Graphics', () => {
    const discreteAmd = classifyGpuRendererString(
      'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Google Inc. (AMD)',
    );
    expect(discreteAmd.tier).toBe('discrete-ultra');

    const integratedAmd = classifyGpuRendererString(
      'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Google Inc. (AMD)',
    );
    expect(integratedAmd.tier).toBe('integrated-balanced');
  });

  it('reads WEBGL_debug_renderer_info when available and falls back safely on headless/mock contexts', () => {
    const UNMASKED_VENDOR_WEBGL = 0x9245;
    const UNMASKED_RENDERER_WEBGL = 0x9246;

    const mockRtxRenderer = {
      capabilities: { isWebGL2: true },
      getContext: () => ({
        VENDOR: 0x1f00,
        RENDERER: 0x1f01,
        getExtension: (name: string) =>
          name === 'WEBGL_debug_renderer_info'
            ? { UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL }
            : null,
        getParameter: (pname: number) => {
          if (pname === UNMASKED_VENDOR_WEBGL) return 'Google Inc. (NVIDIA)';
          if (pname === UNMASKED_RENDERER_WEBGL) {
            return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)';
          }
          return 'WebKit WebGL';
        },
      }),
    } as unknown as THREE.WebGLRenderer;

    const rtxDetected = detectWebGLGpuProfile(mockRtxRenderer);
    expect(rtxDetected.tier).toBe('discrete-ultra');
    expect(rtxDetected.msaaSamples).toBe(4);
    expect(rtxDetected.renderer).toContain('RTX 5070 Ti');

    // Mock privacy-masked context where WEBGL_debug_renderer_info returns null
    const mockMaskedRenderer = {
      capabilities: { isWebGL2: true },
      getContext: () => ({
        VENDOR: 0x1f00,
        RENDERER: 0x1f01,
        getExtension: () => null,
        getParameter: (pname: number) => (pname === 0x1f01 ? 'WebKit WebGL' : 'WebKit'),
      }),
    } as unknown as THREE.WebGLRenderer;

    const maskedDetected = detectWebGLGpuProfile(mockMaskedRenderer);
    expect(maskedDetected.tier).toBe('integrated-balanced');
    expect(maskedDetected.msaaSamples).toBe(2);
  });
});
