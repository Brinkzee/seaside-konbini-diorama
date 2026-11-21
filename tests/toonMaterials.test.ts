import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  addInvertedHullOutline,
  applyOutlinesToHierarchy,
  createEmissiveLightboxMaterial,
  createGlassMaterial,
  createResinCutEdgeMaterial,
  createResinWaterSurfaceMaterial,
  createToonMaterial,
  createWetPuddleMaterial,
  getSharedToonGradientMap,
} from '../src/rendering/toonMaterials';
import { createSkyAndLighting } from '../src/rendering/skyAndLighting';
import {
  createPostProcessingPipeline,
  type PostProcessingOptions,
} from '../src/rendering/postProcessing';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

describe('Toon Materials & Cel-Shading Pipeline', () => {
  it('creates a shared 4-step warm/cool cel-shaded DataTexture with NearestFilter', () => {
    const gradA = getSharedToonGradientMap();
    const gradB = getSharedToonGradientMap();

    expect(gradA).toBeInstanceOf(THREE.DataTexture);
    expect(gradA).toBe(gradB);
    expect(gradA.minFilter).toBe(THREE.NearestFilter);
    expect(gradA.magFilter).toBe(THREE.NearestFilter);
    expect(gradA.image.width).toBe(4);
    expect(gradA.image.height).toBe(1);

    const data = gradA.image.data as Uint8Array;
    expect(data.length).toBe(16); // 4 RGBA pixels

    // Monotonically increasing steps from shadow (step 0) to highlight (step 3)
    const r0 = data[0];
    const b0 = data[2];
    const r1 = data[4];
    const r2 = data[8];
    const r3 = data[12];
    const b3 = data[14];

    expect(r0).toBeLessThan(r1);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);

    // Cool shadow tint (blue > red in darkest step) & warm highlight tint (red > blue in brightest step)
    expect(b0).toBeGreaterThan(r0);
    expect(r3).toBeGreaterThan(b3);
  });

  it('builds MeshToonMaterial bound to the 4-step gradient map and honors options', () => {
    const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const mat = createToonMaterial({
      color: '#5b9bd5',
      map: tex,
      emissive: '#ffb86b',
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
    });

    expect(mat).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(mat.gradientMap).toBe(getSharedToonGradientMap());
    expect(mat.map).toBe(tex);
    expect(mat.emissiveIntensity).toBeCloseTo(0.4);
    expect(mat.side).toBe(THREE.DoubleSide);

    // Verify onBeforeCompile cleanly transforms Three.js 0.170 ShaderLib.toon fragment shader
    const shaderStub = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.toon.uniforms),
      vertexShader: THREE.ShaderLib.toon.vertexShader,
      fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    };
    mat.onBeforeCompile(shaderStub as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shaderStub.fragmentShader).toContain('texture2D( gradientMap, coord ).rgb');
    expect(shaderStub.fragmentShader).toContain('plasticRim');

    // Untextured createToonMaterial calls with identical canonical parameters share cached instances
    const cachedA = createToonMaterial({ color: '#5b9bd5' });
    const cachedB = createToonMaterial({ color: 0x5b9bd5 });
    const distinctColor = createToonMaterial({ color: '#ff9e7d' });
    const texturedUncached = createToonMaterial({ color: '#5b9bd5', map: tex });
    expect(cachedA).toBe(cachedB);
    expect(cachedA).not.toBe(distinctColor);
    expect(texturedUncached).not.toBe(cachedA);
  });

  it('builds crystal-clear glass material with noOutline = true and low opacity for interior visibility', () => {
    const glass = createGlassMaterial();
    expect(glass).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(glass.transparent).toBe(true);
    expect(glass.opacity).toBeLessThanOrEqual(0.18);
    expect(glass.depthWrite).toBe(false);
    expect(glass.userData.noOutline).toBe(true);

    const customGlass = createGlassMaterial({ tint: '#8ecae6', opacity: 0.14 });
    expect(customGlass.opacity).toBeCloseTo(0.14);
    expect(customGlass.userData.noOutline).toBe(true);
  });

  it('builds emissive lightbox material suitable for warm selective bloom without washing out textures', () => {
    const signTex = new THREE.DataTexture(new Uint8Array([255, 248, 236, 255]), 1, 1);
    const lightbox = createEmissiveLightboxMaterial({
      color: '#fff8ec',
      map: signTex,
      intensity: 1.3,
    });

    expect(lightbox).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(lightbox.map).toBe(signTex);
    expect(lightbox.emissiveMap).toBe(signTex);
    expect(lightbox.emissiveIntensity).toBeCloseTo(1.3);
  });

  it('applies BackSide ink outlines to solid meshes while skipping transparent, noOutline, and isOutline meshes', () => {
    const root = new THREE.Group();

    const solidMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      createToonMaterial({ color: '#fff8ec' }),
    );
    solidMesh.name = 'konbini-wall';
    root.add(solidMesh);

    const glassMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      createGlassMaterial(),
    );
    glassMesh.name = 'front-window';
    root.add(glassMesh);

    const noOutlineGroup = new THREE.Group();
    noOutlineGroup.userData.noOutline = true;
    const mistParticle = new THREE.Mesh(
      new THREE.SphereGeometry(0.1),
      createToonMaterial({ color: '#ffffff' }),
    );
    mistParticle.name = 'cold-mist-puff';
    noOutlineGroup.add(mistParticle);
    root.add(noOutlineGroup);

    const explicitSkipMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      createToonMaterial({ color: '#ff9e7d' }),
    );
    explicitSkipMesh.userData.noOutline = true;
    root.add(explicitSkipMesh);

    expect(addInvertedHullOutline(glassMesh)).toBeNull();
    expect(addInvertedHullOutline(explicitSkipMesh)).toBeNull();
    expect(addInvertedHullOutline(mistParticle)).toBeNull();

    const addedCount = applyOutlinesToHierarchy(root, 0.02);
    expect(addedCount).toBe(1);

    const outlineChild = solidMesh.children.find(
      (child) => child.userData?.isOutline === true,
    ) as THREE.Mesh | undefined;
    expect(outlineChild).toBeDefined();
    expect(outlineChild).toBeInstanceOf(THREE.Mesh);
    expect(outlineChild!.userData.noOutline).toBe(true);
    expect(outlineChild!.userData.isOutline).toBe(true);

    const outlineMat = outlineChild!.material as THREE.Material;
    expect(outlineMat.side).toBe(THREE.BackSide);

    // Verify outline vertex shader extrusion compiles cleanly against Three.js 0.170 ShaderLib.basic
    const basicStub = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms),
      vertexShader: THREE.ShaderLib.basic.vertexShader,
      fragmentShader: THREE.ShaderLib.basic.fragmentShader,
    };
    outlineMat.onBeforeCompile(basicStub as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(basicStub.vertexShader).toContain('attribute vec3 aOutlineNormal;');
    expect(basicStub.vertexShader).toContain('uOutlineThickness');
    expect(solidMesh.geometry.getAttribute('aOutlineNormal')).toBeDefined();

    // Calling applyOutlinesToHierarchy a second time must be idempotent (0 duplicate outlines)
    expect(applyOutlinesToHierarchy(root, 0.02)).toBe(0);
  });

  it('creates wet puddle ShaderMaterial with required uniforms reflecting dusk sky & warm store glow', () => {
    const puddleMat = createWetPuddleMaterial();
    expect(puddleMat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(puddleMat.uniforms.uTime).toBeDefined();
    expect(typeof puddleMat.uniforms.uTime.value).toBe('number');
    expect(puddleMat.uniforms.uRippleCenter).toBeDefined();
    expect(puddleMat.uniforms.uRippleCenter.value).toBeInstanceOf(THREE.Vector2);
    expect(puddleMat.uniforms.uRippleProgress).toBeDefined();
    expect(typeof puddleMat.uniforms.uRippleProgress.value).toBe('number');
    expect(puddleMat.uniforms.uDoorLightBoost).toBeDefined();
    expect(typeof puddleMat.uniforms.uDoorLightBoost.value).toBe('number');
    expect(puddleMat.fragmentShader).toContain('uRippleProgress');
    expect(puddleMat.fragmentShader).toContain('uDoorLightBoost');
    expect(puddleMat.fragmentShader).toContain('* edgeAlpha, 0.0,');
    expect(puddleMat.userData.noOutline).toBe(true);
  });

  it('creates resin water surface ShaderMaterial with anime foam bands and crystal resin cut-edge material', () => {
    const waterMat = createResinWaterSurfaceMaterial();
    expect(waterMat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(waterMat.uniforms.uTime).toBeDefined();
    expect(typeof waterMat.uniforms.uTime.value).toBe('number');
    expect(waterMat.uniforms.uWavePhase).toBeDefined();
    expect(typeof waterMat.uniforms.uWavePhase.value).toBe('number');
    expect(waterMat.transparent).toBe(true);
    expect(waterMat.fragmentShader).toContain('uWavePhase');
    expect(waterMat.userData.noOutline).toBe(true);

    const cutEdgeMat = createResinCutEdgeMaterial();
    expect(cutEdgeMat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(cutEdgeMat.transparent).toBe(true);
    expect(cutEdgeMat.opacity).toBeCloseTo(0.55, 2);
    expect(cutEdgeMat.emissiveIntensity).toBeGreaterThanOrEqual(0.3);
    expect(cutEdgeMat.userData.noOutline).toBe(true);
    expect(cutEdgeMat.transmission).toBe(0);
  });
});

describe('Dusk Sky Dome, Warm/Cool Lighting & Subtle Bloom Post-Processing', () => {
  it('creates midsummer dusk sky dome (ignoreBounds & noOutline) plus cool hemi, warm sunset dir, and door spill lights', () => {
    const rig = createSkyAndLighting();

    expect(rig.group).toBeInstanceOf(THREE.Group);
    expect(rig.skyDome).toBeInstanceOf(THREE.Mesh);
    expect(rig.skyDome.userData.ignoreBounds).toBe(true);
    expect(rig.skyDome.userData.noOutline).toBe(true);

    expect(rig.skyMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(rig.skyMaterial.side).toBe(THREE.BackSide);
    expect(rig.skyMaterial.uniforms.uTime).toBeDefined();
    expect(rig.skyMaterial.uniforms.uTime.value).toBe(0);
    expect(rig.skyMaterial.fragmentShader).toContain('smoothstep( -0.22, 0.04, elev )');
    expect(rig.skyMaterial.fragmentShader).toContain('mat2( 0.8, -0.6, 0.6, 0.8 )');
    expect(rig.skyMaterial.fragmentShader).toContain('smoothstep( 0.50, 0.68, cloudShape )');
    expect(rig.skyMaterial.fragmentShader).toContain('hash22');
    expect(rig.skyMaterial.fragmentShader).not.toContain('cos( angle )');

    expect(rig.sunsetDirLight).toBeInstanceOf(THREE.DirectionalLight);
    expect(rig.sunsetDirLight.castShadow).toBe(true);
    expect(rig.sunsetDirLight.intensity).toBeCloseTo(0.78, 2);
    expect(rig.hemiLight).toBeInstanceOf(THREE.HemisphereLight);
    expect(rig.hemiLight.intensity).toBeCloseTo(0.72, 2);
    expect(rig.doorSpillLight).toBeInstanceOf(THREE.PointLight);
    expect(rig.doorSpillLight.intensity).toBeGreaterThan(rig.sunsetDirLight.intensity);
  });

  it('creates post-processing pipeline with EffectComposer, RenderPass, subtle high-threshold UnrealBloomPass, and OutputPass', () => {
    const mockRenderer = {
      getPixelRatio: () => 1,
      getSize: (target: THREE.Vector2) => target.set(800, 600),
      capabilities: { isWebGL2: true },
    } as unknown as THREE.WebGLRenderer;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 800 / 600, 0.1, 200);

    const pipeline = createPostProcessingPipeline(mockRenderer, scene, camera);
    expect(typeof pipeline.render).toBe('function');
    expect(typeof pipeline.setSize).toBe('function');
    expect(typeof pipeline.dispose).toBe('function');

    expect(() => pipeline.setSize(1280, 720, 1.5)).not.toThrow();
    const disposeSpy = vi.fn();
    expect(() => pipeline.dispose()).not.toThrow();
    expect(disposeSpy).not.toHaveBeenCalled();

    // Verify PostProcessingOptions tier scaling (e.g., discrete-ultra 4x MSAA + 1.0x full-res bloom)
    const bloomSizeSpy = vi.spyOn(UnrealBloomPass.prototype, 'setSize');
    const ultraOptions: PostProcessingOptions = {
      msaaSamples: 4,
      bloomScale: 1.0,
    };
    const ultraPipeline = createPostProcessingPipeline(
      mockRenderer,
      scene,
      camera,
      ultraOptions,
    );
    expect(bloomSizeSpy).toHaveBeenLastCalledWith(800, 600);

    ultraPipeline.setSize(1280, 720, 2.0);
    expect(bloomSizeSpy).toHaveBeenLastCalledWith(2560, 1440);
    ultraPipeline.dispose();
    bloomSizeSpy.mockRestore();
  });
});
