import * as THREE from 'three';

export interface AnimationTargets {
  skyMaterial?: THREE.ShaderMaterial;
  waterSurfaceMaterial?: THREE.ShaderMaterial;
  foamStripMesh?: THREE.Object3D;
  puddleMaterials?: THREE.ShaderMaterial[];
  wetSandMaterial?: THREE.Material;
  crosswalkMaterial?: THREE.Material;
  slidingDoorLeft?: THREE.Object3D;
  slidingDoorRight?: THREE.Object3D;
  doorSpillLight?: THREE.PointLight;
  awningValance?: THREE.Object3D;
  windChimePendulum?: THREE.Object3D;
  flutteringPosterCorner?: THREE.Object3D;
  treeFoliageClusters?: THREE.Object3D[];
  overheadWires?: THREE.Object3D[];
  acFanWheel?: THREE.Object3D;
  acWaterDrop?: THREE.Object3D;
  acRippleRing?: THREE.Mesh;
  signLightboxMaterials?: THREE.MeshStandardMaterial[];
  interiorLightboxMaterials?: THREE.MeshStandardMaterial[];
  vendingGlowMaterials?: THREE.MeshStandardMaterial[];
  coldMistParticles?: THREE.Object3D[];
  deskFanHead?: THREE.Object3D;
  deskFanBlades?: THREE.Object3D;
  trafficLightBulbs?: {
    red: THREE.MeshStandardMaterial;
    yellow: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  };
  lighthouseRotor?: THREE.Object3D;
}

const AUTO_DOOR_CYCLE_SECONDS = 16.0;
const AC_DRIP_CYCLE_SECONDS = 2.8;
const WAVE_CYCLE_SECONDS = 5.6;
const TRAFFIC_SIGNAL_CYCLE_SECONDS = 24.0;
const COLD_MIST_CYCLE_SECONDS = 4.6;
const LIGHTHOUSE_SWEEP_PERIOD_SECONDS = 18.0;

const AC_DROP_START_WORLD_Y = 1.32;
const AC_DROP_END_WORLD_Y = 0.51;
const DOOR_MAX_SLIDE_OFFSET = 0.9;

const tempParentWorldPos = new THREE.Vector3();

function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function smoothstep01(x: number): number {
  const clamped = THREE.MathUtils.clamp(x, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

interface BaseEuler {
  x: number;
  y: number;
  z: number;
}

function getCachedBaseRotation(obj: THREE.Object3D): BaseEuler {
  let cached = obj.userData.__baseRot as BaseEuler | undefined;
  if (!cached) {
    cached = { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z };
    obj.userData.__baseRot = cached;
  }
  return cached;
}

function getCachedBaseNumber(holder: Record<string, unknown>, key: string, fallback: number): number {
  const existing = holder[key];
  if (typeof existing === 'number') {
    return existing;
  }
  holder[key] = fallback;
  return fallback;
}

function applyOpacityToHierarchy(root: THREE.Object3D, opacity: number): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if ('opacity' in mat) {
          mat.transparent = true;
          mat.opacity = opacity;
        }
      }
    }
  });
}

function advanceContinuousRotor(
  obj: THREE.Object3D,
  axis: 'x' | 'y' | 'z',
  angularSpeedRadPerSec: number,
  elapsedSeconds: number,
  deltaSeconds: number,
  wrapTwoPi = false,
): void {
  const baseAngle = getCachedBaseNumber(obj.userData, `__baseRotor_${axis}`, obj.rotation[axis]);
  const effectiveTime =
    elapsedSeconds > 0
      ? elapsedSeconds
      : getCachedBaseNumber(obj.userData, '__accumDelta', 0) + Math.max(0, deltaSeconds);
  if (elapsedSeconds <= 0 && deltaSeconds > 0) {
    obj.userData.__accumDelta = effectiveTime;
  }
  const rawAngle = baseAngle + effectiveTime * angularSpeedRadPerSec;
  obj.rotation[axis] = wrapTwoPi ? positiveMod(rawAngle, Math.PI * 2) : rawAngle;
}

/**
 * Occasional automatic sliding doors (~16s cycle):
 * Stays closed (0) for the majority of the cycle, glides open smoothly to 1,
 * holds briefly, then glides back to 0.
 */
export function computeAutoDoorFactor(elapsedSeconds: number): number {
  const t = positiveMod(elapsedSeconds, AUTO_DOOR_CYCLE_SECONDS);
  const openStart = 10.5;
  const openEnd = 11.7;
  const holdEnd = 13.5;
  const closeEnd = 14.9;

  if (t < openStart || t >= closeEnd) {
    return 0;
  }
  if (t < openEnd) {
    return smoothstep01((t - openStart) / (openEnd - openStart));
  }
  if (t < holdEnd) {
    return 1;
  }
  return 1 - smoothstep01((t - holdEnd) / (closeEnd - holdEnd));
}

/**
 * AC condensate droplet gravity fall synchronized with puddle concentric ripple expansion.
 */
export function computeAcDropState(elapsedSeconds: number): {
  dropProgress: number;
  rippleProgress: number;
  rippleOpacity: number;
} {
  const u = positiveMod(elapsedSeconds, AC_DRIP_CYCLE_SECONDS) / AC_DRIP_CYCLE_SECONDS;
  const formPhaseEnd = 0.22;
  const impactPhase = 0.48;

  if (u < formPhaseEnd) {
    return { dropProgress: 0, rippleProgress: 0, rippleOpacity: 0 };
  }

  if (u < impactPhase) {
    const fallNorm = (u - formPhaseEnd) / (impactPhase - formPhaseEnd);
    const dropProgress = fallNorm * fallNorm; // gravity acceleration
    return { dropProgress, rippleProgress: 0, rippleOpacity: 0 };
  }

  const rNorm = (u - impactPhase) / (1 - impactPhase);
  const rippleProgress = 1 - (1 - rNorm) * (1 - rNorm);
  const onset = Math.min(1, rNorm * 8);
  const rippleOpacity = THREE.MathUtils.clamp(onset * (1 - rNorm) * 0.85, 0, 1);

  return {
    dropProgress: 1,
    rippleProgress,
    rippleOpacity,
  };
}

/**
 * Calm summer shoreline wave surge (world-space X offset) and painted white foam opacity cycle.
 */
export function computeWaveFoamOffset(elapsedSeconds: number): {
  surge: number;
  foamOpacity: number;
} {
  const phase = (elapsedSeconds / WAVE_CYCLE_SECONDS) * Math.PI * 2;
  const primary = Math.sin(phase);
  const harmonic = Math.sin(phase * 2 - 0.5) * 0.22;
  const surge = THREE.MathUtils.clamp((primary + harmonic) * 0.13, -0.18, 0.18);

  // Foam brightens as wave washes onto the wet sand and softens as it recedes
  const crest = 0.5 + 0.5 * Math.sin(phase + 0.35);
  const foamOpacity = THREE.MathUtils.clamp(0.28 + Math.pow(crest, 1.3) * 0.62, 0.22, 0.92);

  return { surge, foamOpacity };
}

/**
 * Calm street-corner traffic signal sequence: green -> yellow -> red.
 */
export function computeTrafficSignalState(elapsedSeconds: number): 'green' | 'yellow' | 'red' {
  const t = positiveMod(elapsedSeconds, TRAFFIC_SIGNAL_CYCLE_SECONDS);
  if (t < 10.0) {
    return 'green';
  }
  if (t < 13.0) {
    return 'yellow';
  }
  return 'red';
}

function updateShimmerMaterial(mat: THREE.Material, elapsedSeconds: number, phaseOffset: number): void {
  const maybeShader = mat as THREE.ShaderMaterial;
  if (maybeShader.uniforms?.uTime) {
    maybeShader.uniforms.uTime.value = elapsedSeconds;
  }

  const matRecord = mat as unknown as Record<string, unknown>;
  if (typeof matRecord.roughness === 'number') {
    const baseRoughness = getCachedBaseNumber(mat.userData, '__baseRoughness', matRecord.roughness);
    const shimmer = Math.sin(elapsedSeconds * 1.15 + phaseOffset) * 0.038;
    matRecord.roughness = THREE.MathUtils.clamp(baseRoughness + shimmer, 0.06, 0.96);
  }
  if (typeof matRecord.emissiveIntensity === 'number') {
    const baseEmissive = getCachedBaseNumber(mat.userData, '__baseEmissive', matRecord.emissiveIntensity);
    if (baseEmissive > 0) {
      matRecord.emissiveIntensity = Math.max(
        0,
        baseEmissive + Math.sin(elapsedSeconds * 1.15 + phaseOffset + 0.5) * 0.025,
      );
    }
  }
}

/**
 * Updates all 11 calm summer dusk diorama animations deterministically.
 */
export function updateDioramaAnimations(
  targets: AnimationTargets,
  elapsedSeconds: number,
  deltaSeconds: number,
): void {
  const t = Math.max(0, elapsedSeconds);
  const dt = THREE.MathUtils.clamp(deltaSeconds, 0, 0.25);

  // 1. Dusk sky cloud drift
  if (targets.skyMaterial?.uniforms?.uTime) {
    targets.skyMaterial.uniforms.uTime.value = t;
  }

  // 2. Shoreline wave surge & painted resin water foam
  const wave = computeWaveFoamOffset(t);
  if (targets.waterSurfaceMaterial?.uniforms) {
    if (targets.waterSurfaceMaterial.uniforms.uTime) {
      targets.waterSurfaceMaterial.uniforms.uTime.value = t;
    }
    if (targets.waterSurfaceMaterial.uniforms.uWavePhase) {
      targets.waterSurfaceMaterial.uniforms.uWavePhase.value = (t / WAVE_CYCLE_SECONDS) * Math.PI * 2;
    }
  }
  if (targets.foamStripMesh) {
    const baseFoamX = getCachedBaseNumber(
      targets.foamStripMesh.userData,
      '__baseX',
      targets.foamStripMesh.position.x,
    );
    targets.foamStripMesh.position.x = baseFoamX - wave.surge;
    applyOpacityToHierarchy(targets.foamStripMesh, wave.foamOpacity);
  }

  // 3. Sea breeze gentle sway (all offsets strictly <= 0.18 rad)
  const breezeEnvelope = 0.6 + 0.4 * Math.sin(t * 0.42);

  if (targets.treeFoliageClusters) {
    for (let i = 0; i < targets.treeFoliageClusters.length; i++) {
      const cluster = targets.treeFoliageClusters[i];
      const base = getCachedBaseRotation(cluster);
      const dx = breezeEnvelope * (Math.sin(t * 1.35 + i * 0.9) * 0.045 + Math.sin(t * 2.6 + i) * 0.015);
      const dz = breezeEnvelope * (Math.cos(t * 1.15 + i * 1.1) * 0.055 + Math.sin(t * 2.2 + i * 0.7) * 0.018);
      cluster.rotation.set(base.x + dx, base.y, base.z + dz);
    }
  }

  if (targets.windChimePendulum) {
    const base = getCachedBaseRotation(targets.windChimePendulum);
    const dx = breezeEnvelope * Math.cos(t * 1.95 + 0.6) * 0.065;
    const dz = breezeEnvelope * (Math.sin(t * 2.45) * 0.095 + Math.sin(t * 4.1) * 0.035);
    targets.windChimePendulum.rotation.set(base.x + dx, base.y, base.z + dz);
  }

  if (targets.awningValance) {
    const base = getCachedBaseRotation(targets.awningValance);
    const dx = breezeEnvelope * (Math.sin(t * 1.8) * 0.048 + Math.sin(t * 3.4 + 0.5) * 0.018);
    targets.awningValance.rotation.set(base.x + dx, base.y, base.z);
  }

  if (targets.flutteringPosterCorner) {
    const base = getCachedBaseRotation(targets.flutteringPosterCorner);
    const lift =
      (0.5 + 0.5 * Math.sin(t * 2.15)) * 0.105 +
      (0.5 + 0.5 * Math.sin(t * 4.3 + 1.1)) * 0.035;
    const dz = Math.sin(t * 1.9) * 0.03;
    targets.flutteringPosterCorner.rotation.set(base.x + lift, base.y, base.z + dz);
  }

  if (targets.overheadWires) {
    for (let i = 0; i < targets.overheadWires.length; i++) {
      const wire = targets.overheadWires[i];
      const base = getCachedBaseRotation(wire);
      const dx = Math.sin(t * 0.95 + i * 0.65) * 0.018;
      const dz = Math.cos(t * 0.85 + i * 0.55) * 0.018;
      wire.rotation.set(base.x + dx, base.y, base.z + dz);
    }
  }

  // 4. Automatic sliding doors + warm spill light boost
  const doorFactor = computeAutoDoorFactor(t);
  if (targets.slidingDoorLeft) {
    const baseLeftX = getCachedBaseNumber(
      targets.slidingDoorLeft.userData,
      '__baseX',
      targets.slidingDoorLeft.position.x,
    );
    targets.slidingDoorLeft.position.x = baseLeftX - doorFactor * DOOR_MAX_SLIDE_OFFSET;
  }
  if (targets.slidingDoorRight) {
    const baseRightX = getCachedBaseNumber(
      targets.slidingDoorRight.userData,
      '__baseX',
      targets.slidingDoorRight.position.x,
    );
    targets.slidingDoorRight.position.x = baseRightX + doorFactor * DOOR_MAX_SLIDE_OFFSET;
  }
  if (targets.doorSpillLight) {
    const baseIntensity = getCachedBaseNumber(
      targets.doorSpillLight.userData,
      '__baseIntensity',
      targets.doorSpillLight.intensity || 0.8,
    );
    targets.doorSpillLight.intensity = baseIntensity + doorFactor * 0.65;
  }

  // 5. AC outdoor fan rotation + condensate water drop + puddle ripple
  if (targets.acFanWheel) {
    const fanAxis = (targets.acFanWheel.userData?.spinAxis as 'x' | 'y' | 'z' | undefined) ?? 'z';
    advanceContinuousRotor(targets.acFanWheel, fanAxis, 6.5, t, dt, false);
  }

  const acState = computeAcDropState(t);
  if (targets.acWaterDrop) {
    let parentWorldY = 0;
    if (targets.acWaterDrop.parent) {
      targets.acWaterDrop.parent.updateWorldMatrix(true, false);
      targets.acWaterDrop.parent.getWorldPosition(tempParentWorldPos);
      parentWorldY = tempParentWorldPos.y;
    }
    const startLocalY = AC_DROP_START_WORLD_Y - parentWorldY;
    const endLocalY = AC_DROP_END_WORLD_Y - parentWorldY;

    if (acState.rippleProgress > 0) {
      targets.acWaterDrop.position.y = endLocalY;
      targets.acWaterDrop.visible = false;
    } else {
      targets.acWaterDrop.visible = true;
      targets.acWaterDrop.position.y = THREE.MathUtils.lerp(
        startLocalY,
        endLocalY,
        acState.dropProgress,
      );
      const u = positiveMod(t, AC_DRIP_CYCLE_SECONDS) / AC_DRIP_CYCLE_SECONDS;
      const formScale = u < 0.22 ? THREE.MathUtils.lerp(0.45, 1.0, u / 0.22) : 1.0;
      targets.acWaterDrop.scale.setScalar(formScale);
    }
  }

  if (targets.acRippleRing) {
    if (acState.rippleOpacity > 0.005) {
      targets.acRippleRing.visible = true;
      const ringScale = 0.3 + acState.rippleProgress * 1.55;
      targets.acRippleRing.scale.setScalar(ringScale);
      applyOpacityToHierarchy(targets.acRippleRing, acState.rippleOpacity);
    } else {
      targets.acRippleRing.visible = false;
    }
  }

  // 6. Puddle, wet sand, and crosswalk dusk reflections & shimmer
  if (targets.puddleMaterials) {
    for (const puddleMat of targets.puddleMaterials) {
      if (puddleMat.uniforms) {
        if (puddleMat.uniforms.uTime) {
          puddleMat.uniforms.uTime.value = t;
        }
        if (puddleMat.uniforms.uRippleProgress) {
          puddleMat.uniforms.uRippleProgress.value = acState.rippleProgress;
        }
        if (puddleMat.uniforms.uDoorLightBoost) {
          puddleMat.uniforms.uDoorLightBoost.value = doorFactor;
        }
      }
    }
  }

  if (targets.wetSandMaterial) {
    updateShimmerMaterial(targets.wetSandMaterial, t, 0.0);
  }
  if (targets.crosswalkMaterial) {
    updateShimmerMaterial(targets.crosswalkMaterial, t, 1.2);
  }

  // 7. Restrained gentle breathing on konbini lightboxes & vending machines
  const allLightboxMats = [
    ...(targets.signLightboxMaterials ?? []),
    ...(targets.interiorLightboxMaterials ?? []),
  ];
  for (let i = 0; i < allLightboxMats.length; i++) {
    const mat = allLightboxMats[i];
    const baseIntensity = getCachedBaseNumber(
      mat.userData,
      '__baseEmissiveIntensity',
      mat.emissiveIntensity || 1.0,
    );
    const mod = 1.0 + Math.sin(t * 1.45 + i * 0.8) * 0.035 + Math.sin(t * 7.2 + i * 1.7) * 0.01;
    mat.emissiveIntensity = baseIntensity * mod;
  }

  if (targets.vendingGlowMaterials) {
    for (let i = 0; i < targets.vendingGlowMaterials.length; i++) {
      const mat = targets.vendingGlowMaterials[i];
      const baseIntensity = getCachedBaseNumber(
        mat.userData,
        '__baseEmissiveIntensity',
        mat.emissiveIntensity || 0.9,
      );
      const mod = 1.0 + Math.sin(t * 1.9 + i * 1.3) * 0.04 + Math.sin(t * 11.0 + i * 2.1) * 0.012;
      mat.emissiveIntensity = baseIntensity * mod;
    }
  }

  // 8. Beverage fridge & chiller cold mist slow downward drift + smooth loop reset
  if (targets.coldMistParticles) {
    for (let i = 0; i < targets.coldMistParticles.length; i++) {
      const mist = targets.coldMistParticles[i];
      const baseY =
        typeof mist.userData.baseY === 'number'
          ? mist.userData.baseY
          : getCachedBaseNumber(mist.userData, '__baseY', mist.position.y);
      const phase = typeof mist.userData.phase === 'number' ? mist.userData.phase : i * 0.29;
      const baseX = getCachedBaseNumber(mist.userData, '__baseX', mist.position.x);

      let initialOpacity = 0.24;
      if (mist instanceof THREE.Mesh && mist.material && 'opacity' in mist.material) {
        initialOpacity = mist.material.opacity > 0 ? mist.material.opacity : 0.24;
      }
      const peakOpacity = getCachedBaseNumber(mist.userData, '__peakOpacity', initialOpacity);

      const cycleProgress = positiveMod(t / COLD_MIST_CYCLE_SECONDS + phase, 1.0);
      const maxDrop = baseY > 0.62 ? Math.min(0.42, baseY - 0.58) : 0.35;

      mist.position.y = baseY - cycleProgress * maxDrop;
      mist.position.x = baseX + Math.sin(cycleProgress * Math.PI * 2 + phase * 6.28) * 0.022;

      const fadeEnvelope = Math.sin(cycleProgress * Math.PI);
      applyOpacityToHierarchy(mist, peakOpacity * fadeEnvelope);
    }
  }

  // 9. Checkout counter mini desk fan rotation + slow head oscillation
  if (targets.deskFanBlades) {
    const bladeAxis = (targets.deskFanBlades.userData?.spinAxis as 'x' | 'y' | 'z' | undefined) ?? 'z';
    advanceContinuousRotor(targets.deskFanBlades, bladeAxis, 14.0, t, dt, false);
  }
  if (targets.deskFanHead) {
    const base = getCachedBaseRotation(targets.deskFanHead);
    targets.deskFanHead.rotation.y = base.y + Math.sin(t * 0.85) * 0.42;
  }

  // 10. Distant street-corner traffic signal state machine
  if (targets.trafficLightBulbs) {
    const signalState = computeTrafficSignalState(t);
    const activePulse = 1.15 + Math.sin(t * 2.2) * 0.03;
    const dimIntensity = 0.06;

    targets.trafficLightBulbs.green.emissiveIntensity =
      signalState === 'green' ? activePulse : dimIntensity;
    targets.trafficLightBulbs.yellow.emissiveIntensity =
      signalState === 'yellow' ? activePulse : dimIntensity;
    targets.trafficLightBulbs.red.emissiveIntensity =
      signalState === 'red' ? activePulse : dimIntensity;
  }

  // 11. Distant mini lighthouse smooth 360-degree sweep
  if (targets.lighthouseRotor) {
    const angularSpeed = (Math.PI * 2) / LIGHTHOUSE_SWEEP_PERIOD_SECONDS;
    advanceContinuousRotor(targets.lighthouseRotor, 'y', angularSpeed, t, dt, true);
  }
}
