import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  type AnimationTargets,
  computeAcDropState,
  computeAutoDoorFactor,
  computeTrafficSignalState,
  computeWaveFoamOffset,
  updateDioramaAnimations,
} from '../src/animation/animationSystem';

describe('Diorama Animation System & Pure Helpers', () => {
  it('computes smooth wave surge and shoreline foam opacity cycles', () => {
    const samples = Array.from({ length: 40 }, (_, i) => computeWaveFoamOffset(i * 0.25));
    const surges = samples.map((s) => s.surge);
    const opacities = samples.map((s) => s.foamOpacity);

    // Bounded gentle surge so shoreline foam never overflows the base
    for (const s of surges) {
      expect(Math.abs(s)).toBeLessThanOrEqual(0.25);
    }
    expect(Math.max(...surges) - Math.min(...surges)).toBeGreaterThan(0.1);

    // Foam opacity cycles within [0, 1] with visible variation
    for (const op of opacities) {
      expect(op).toBeGreaterThanOrEqual(0.1);
      expect(op).toBeLessThanOrEqual(1.0);
    }
    expect(Math.max(...opacities) - Math.min(...opacities)).toBeGreaterThan(0.25);
  });

  it('keeps sea breeze sway tranquil and bounded <= 0.18 rad across all foliage, chime, awning, poster, and wires', () => {
    const treeClusterA = new THREE.Object3D();
    const treeClusterB = new THREE.Object3D();
    const windChimePendulum = new THREE.Object3D();
    const awningValance = new THREE.Object3D();
    const flutteringPosterCorner = new THREE.Object3D();
    const wireA = new THREE.Object3D();
    const wireB = new THREE.Object3D();

    const targets: AnimationTargets = {
      treeFoliageClusters: [treeClusterA, treeClusterB],
      windChimePendulum,
      awningValance,
      flutteringPosterCorner,
      overheadWires: [wireA, wireB],
    };

    let sawChimeMovement = false;
    let sawPosterLift = false;
    let sawTreeMovement = false;

    for (let i = 0; i <= 80; i++) {
      const t = i * 0.15;
      updateDioramaAnimations(targets, t, 0.15);

      for (const obj of [
        treeClusterA,
        treeClusterB,
        windChimePendulum,
        awningValance,
        flutteringPosterCorner,
        wireA,
        wireB,
      ]) {
        expect(Math.abs(obj.rotation.x)).toBeLessThanOrEqual(0.18);
        expect(Math.abs(obj.rotation.y)).toBeLessThanOrEqual(0.18);
        expect(Math.abs(obj.rotation.z)).toBeLessThanOrEqual(0.18);
      }

      if (Math.abs(windChimePendulum.rotation.z) > 0.02) sawChimeMovement = true;
      if (Math.abs(flutteringPosterCorner.rotation.x) > 0.02) sawPosterLift = true;
      if (Math.abs(treeClusterA.rotation.z) > 0.01) sawTreeMovement = true;
    }

    expect(sawChimeMovement).toBe(true);
    expect(sawPosterLift).toBe(true);
    expect(sawTreeMovement).toBe(true);
  });

  it('synchronizes AC condensation drop fall (Y: 1.32 -> 0.51) with puddle ripple expansion and shader uniform', () => {
    const startState = computeAcDropState(0);
    expect(startState.dropProgress).toBe(0);
    expect(startState.rippleProgress).toBe(0);

    const acFanWheel = new THREE.Object3D();
    const acWaterDrop = new THREE.Object3D();
    acWaterDrop.position.set(2.85, 1.32, -3.6);

    const rippleMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 });
    const acRippleRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 16), rippleMat);
    const puddleShader = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRippleCenter: { value: new THREE.Vector2(2.85, -3.6) },
        uRippleProgress: { value: 0 },
        uDoorLightBoost: { value: 0 },
      },
    });

    const targets: AnimationTargets = {
      acFanWheel,
      acWaterDrop,
      acRippleRing,
      puddleMaterials: [puddleShader],
    };

    const yValues: number[] = [];
    let sawMidFall = false;
    let sawActiveRipple = false;

    for (let i = 0; i <= 60; i++) {
      const t = i * 0.06;
      const state = computeAcDropState(t);
      updateDioramaAnimations(targets, t, 0.06);
      yValues.push(acWaterDrop.position.y);

      if (state.dropProgress > 0.1 && state.dropProgress < 0.9) {
        sawMidFall = true;
        expect(state.rippleProgress).toBe(0);
        expect(acWaterDrop.visible).toBe(true);
      }
      if (state.rippleProgress > 0.15 && state.rippleOpacity > 0.05) {
        sawActiveRipple = true;
        expect(state.dropProgress).toBe(1);
        expect(acRippleRing.visible).toBe(true);
        expect(puddleShader.uniforms.uRippleProgress.value).toBeCloseTo(state.rippleProgress, 5);
      }
    }

    expect(sawMidFall).toBe(true);
    expect(sawActiveRipple).toBe(true);
    expect(Math.max(...yValues)).toBeCloseTo(1.32, 2);
    expect(Math.min(...yValues)).toBeCloseTo(0.51, 2);
    expect(Math.abs(acFanWheel.rotation.z)).toBeGreaterThan(1.0);
  });

  it('keeps automatic sliding doors closed most of the ~16s cycle, opens smoothly, and boosts spill light & puddle glow', () => {
    const samples: number[] = [];
    for (let t = 0; t < 16; t += 0.25) {
      const factor = computeAutoDoorFactor(t);
      expect(factor).toBeGreaterThanOrEqual(0);
      expect(factor).toBeLessThanOrEqual(1);
      samples.push(factor);
    }

    const closedCount = samples.filter((f) => f === 0).length;
    const fullyOpenCount = samples.filter((f) => f > 0.98).length;
    const midSlideCount = samples.filter((f) => f > 0.1 && f < 0.9).length;

    // Closed for majority (>60%) of the 16s cycle, with smooth transitions and brief open hold
    expect(closedCount / samples.length).toBeGreaterThan(0.6);
    expect(fullyOpenCount).toBeGreaterThanOrEqual(3);
    expect(midSlideCount).toBeGreaterThanOrEqual(4);

    // Periodic every 16s
    expect(computeAutoDoorFactor(12.2)).toBeCloseTo(computeAutoDoorFactor(12.2 + 16), 5);

    const slidingDoorLeft = new THREE.Object3D();
    slidingDoorLeft.position.x = -3.05;
    const slidingDoorRight = new THREE.Object3D();
    slidingDoorRight.position.x = -1.95;
    const doorSpillLight = new THREE.PointLight(0xffe2a8, 0.8, 8);
    const puddleShader = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRippleCenter: { value: new THREE.Vector2(0, 0) },
        uRippleProgress: { value: 0 },
        uDoorLightBoost: { value: 0 },
      },
    });

    const targets: AnimationTargets = {
      slidingDoorLeft,
      slidingDoorRight,
      doorSpillLight,
      puddleMaterials: [puddleShader],
    };

    // Closed at t = 1.0s
    updateDioramaAnimations(targets, 1.0, 0.016);
    expect(slidingDoorLeft.position.x).toBeCloseTo(-3.05, 3);
    expect(slidingDoorRight.position.x).toBeCloseTo(-1.95, 3);
    const closedIntensity = doorSpillLight.intensity;

    // Find peak open timestamp in [0, 16)
    let openTime = 0;
    for (let t = 0; t < 16; t += 0.2) {
      if (computeAutoDoorFactor(t) === 1) {
        openTime = t;
        break;
      }
    }

    updateDioramaAnimations(targets, openTime, 0.016);
    expect(slidingDoorLeft.position.x).toBeLessThan(-3.8);
    expect(slidingDoorLeft.position.x).toBeGreaterThanOrEqual(-4.05);
    expect(slidingDoorRight.position.x).toBeGreaterThan(-1.2);
    expect(slidingDoorRight.position.x).toBeLessThanOrEqual(-0.95);
    expect(doorSpillLight.intensity).toBeGreaterThan(closedIntensity + 0.3);
    expect(puddleShader.uniforms.uDoorLightBoost.value).toBeCloseTo(1, 3);
  });

  it('applies subtle restrained breathing to sign lightboxes and vending machines without harsh flicker', () => {
    const signMat = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 1.0 });
    const vendingMat = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 0.9 });

    const signValues: number[] = [];
    const vendingValues: number[] = [];

    for (let i = 0; i <= 50; i++) {
      updateDioramaAnimations(
        { signLightboxMaterials: [signMat], vendingGlowMaterials: [vendingMat] },
        i * 0.1,
        0.1,
      );
      signValues.push(signMat.emissiveIntensity);
      vendingValues.push(vendingMat.emissiveIntensity);
    }

    expect(Math.max(...signValues) - Math.min(...signValues)).toBeGreaterThan(0.01);
    expect(Math.max(...signValues) - Math.min(...signValues)).toBeLessThan(0.2);
    expect(Math.max(...vendingValues) - Math.min(...vendingValues)).toBeGreaterThan(0.01);
    expect(Math.max(...vendingValues) - Math.min(...vendingValues)).toBeLessThan(0.2);
  });

  it('drifts fridge cold mist particles downward in a loop with smooth fade-in and fade-out', () => {
    const mistMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25 });
    const mistParticle = new THREE.Mesh(new THREE.SphereGeometry(0.08), mistMat);
    mistParticle.position.set(-1.2, 1.6, -7.1);
    mistParticle.userData = { baseY: 1.6, phase: 0 };

    const ys: number[] = [];
    const opacities: number[] = [];

    for (let i = 0; i <= 50; i++) {
      updateDioramaAnimations({ coldMistParticles: [mistParticle] }, i * 0.12, 0.12);
      ys.push(mistParticle.position.y);
      opacities.push(mistMat.opacity);
    }

    expect(Math.max(...ys)).toBeLessThanOrEqual(1.601);
    expect(Math.min(...ys)).toBeLessThan(1.3);
    expect(Math.min(...ys)).toBeGreaterThan(0.56);
    expect(Math.min(...opacities)).toBeLessThan(0.05);
    expect(Math.max(...opacities)).toBeGreaterThan(0.15);
  });

  it('spins checkout desk fan blades continuously while oscillating fan head left and right', () => {
    const deskFanHead = new THREE.Object3D();
    const deskFanBlades = new THREE.Object3D();

    const headAngles: number[] = [];
    for (let i = 0; i <= 60; i++) {
      updateDioramaAnimations({ deskFanHead, deskFanBlades }, i * 0.15, 0.15);
      headAngles.push(deskFanHead.rotation.y);
    }

    expect(Math.abs(deskFanBlades.rotation.z)).toBeGreaterThan(10);
    expect(Math.min(...headAngles)).toBeLessThan(-0.2);
    expect(Math.max(...headAngles)).toBeGreaterThan(0.2);
    expect(Math.max(...headAngles)).toBeLessThan(0.6);
  });

  it('updates dusk sky, resin water, wet sand, puddle, and crosswalk shimmer uniforms/materials', () => {
    const skyMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } } });
    const waterSurfaceMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uWavePhase: { value: 0 } },
    });
    const wetSandMaterial = new THREE.MeshStandardMaterial({ roughness: 0.28, emissiveIntensity: 0.1 });
    const crosswalkMaterial = new THREE.MeshStandardMaterial({ roughness: 0.42 });
    const foamMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
    );
    foamMesh.position.x = 7.6;

    updateDioramaAnimations(
      {
        skyMaterial,
        waterSurfaceMaterial,
        wetSandMaterial,
        crosswalkMaterial,
        foamStripMesh: foamMesh,
      },
      3.7,
      0.016,
    );

    expect(skyMaterial.uniforms.uTime.value).toBeCloseTo(3.7, 5);
    expect(waterSurfaceMaterial.uniforms.uTime.value).toBeCloseTo(3.7, 5);
    expect(waterSurfaceMaterial.uniforms.uWavePhase.value).toBeGreaterThan(0);
    expect(wetSandMaterial.roughness).not.toBe(0.28);
    expect(crosswalkMaterial.roughness).not.toBe(0.42);
    expect(Math.abs(foamMesh.position.x - 7.6)).toBeLessThanOrEqual(0.25);
  });

  it('cycles distant traffic signal green -> yellow -> red and sweeps mini lighthouse rotor 360 degrees', () => {
    const seenSequence: Array<'green' | 'yellow' | 'red'> = [];
    for (let t = 0; t < 24; t += 1.0) {
      const state = computeTrafficSignalState(t);
      if (seenSequence[seenSequence.length - 1] !== state) {
        seenSequence.push(state);
      }
    }
    expect(seenSequence).toEqual(['green', 'yellow', 'red']);

    const bulbs = {
      red: new THREE.MeshStandardMaterial({ emissive: 0xff4444, emissiveIntensity: 0.1 }),
      yellow: new THREE.MeshStandardMaterial({ emissive: 0xffcc44, emissiveIntensity: 0.1 }),
      green: new THREE.MeshStandardMaterial({ emissive: 0x44dd99, emissiveIntensity: 0.1 }),
    };
    const lighthouseRotor = new THREE.Object3D();

    updateDioramaAnimations({ trafficLightBulbs: bulbs, lighthouseRotor }, 1.0, 1.0);
    expect(bulbs.green.emissiveIntensity).toBeGreaterThan(0.9);
    expect(bulbs.red.emissiveIntensity).toBeLessThan(0.2);

    // Find yellow and red timestamps
    let yellowT = 0;
    let redT = 0;
    for (let t = 0; t < 24; t += 0.5) {
      if (computeTrafficSignalState(t) === 'yellow' && yellowT === 0) yellowT = t;
      if (computeTrafficSignalState(t) === 'red' && redT === 0) redT = t;
    }

    updateDioramaAnimations({ trafficLightBulbs: bulbs, lighthouseRotor }, yellowT, 1.0);
    expect(bulbs.yellow.emissiveIntensity).toBeGreaterThan(0.9);
    expect(bulbs.green.emissiveIntensity).toBeLessThan(0.2);

    updateDioramaAnimations({ trafficLightBulbs: bulbs, lighthouseRotor }, redT, 1.0);
    expect(bulbs.red.emissiveIntensity).toBeGreaterThan(0.9);
    expect(bulbs.yellow.emissiveIntensity).toBeLessThan(0.2);

    // Verify lighthouse rotor completes a smooth 360-degree sweep over its period
    const freshRotor = new THREE.Object3D();
    let totalSweep = 0;
    let prevY = freshRotor.rotation.y;
    for (let step = 1; step <= 40; step++) {
      updateDioramaAnimations({ lighthouseRotor: freshRotor }, step * 0.5, 0.5);
      let diff = freshRotor.rotation.y - prevY;
      if (diff < -Math.PI) diff += Math.PI * 2;
      if (diff > Math.PI) diff -= Math.PI * 2;
      totalSweep += Math.abs(diff);
      prevY = freshRotor.rotation.y;
    }
    expect(totalSweep).toBeGreaterThan(Math.PI * 2);
  });
});
