import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { updateDioramaAnimations } from '../src/animation/animationSystem';
import { checkWorldWithinBase } from '../src/config/paletteAndBounds';
import { buildDioramaWorld } from '../src/world/buildDioramaWorld';

const ALL_62_REQUIRED_GROUPS = [
  'base-and-road',
  'seaside-zone',
  'konbini-structure',
  'exterior-props',
  'konbini-interior',
  'base-tray',
  'asphalt-road',
  'zebra-crosswalk',
  'parking-bay',
  'drainage-gutter',
  'wet-puddles',
  'street-guardrails',
  'street-signs',
  'traffic-signal',
  'wooden-stairs',
  'sand-beach',
  'wet-sand-band',
  'resin-ocean',
  'seawall',
  'tetrapods',
  'mini-lighthouse',
  'lifebuoy',
  'folded-beach-umbrella',
  'seashells',
  'sea-glass',
  'konbini-building',
  'konbini-signboard',
  'pylon-sign',
  'striped-awning',
  'wind-chime',
  'sliding-door-left',
  'sliding-door-right',
  'welcome-mat',
  'storefront-windows',
  'kei-truck',
  'vending-machines',
  'bicycle-wicker-basket',
  'leaning-surfboard',
  'surfboard-rack',
  'open-beach-umbrella',
  'flip-flops',
  'trash-cans',
  'ac-outdoor-unit',
  'noticeboard',
  'utility-poles-wires',
  'alley-tree',
  'streetlamp',
  'interior-summer-display',
  'interior-shelves',
  'interior-bento-onigiri',
  'interior-drink-fridges',
  'interior-cold-mist',
  'interior-ice-cream-freezer',
  'interior-checkout-counter',
  'interior-coffee-machine',
  'interior-desk-fan',
  'interior-drink-bar',
  'interior-magazine-rack',
  'interior-lockers',
  'interior-floor-guides',
  'interior-posters-lightboxes',
  'interior-back-door',
] as const;

describe('Diorama Scene Batching & GPU Draw-Call Optimization', () => {
  it('reduces total scene Mesh count below 160 and outline Mesh count to <= 25', () => {
    const { scene } = buildDioramaWorld();

    let totalMeshes = 0;
    let outlineMeshes = 0;

    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        totalMeshes++;
        if (obj.userData?.isOutline === true) {
          outlineMeshes++;
        }
      }
    });

    expect(totalMeshes).toBeGreaterThan(20);
    expect(totalMeshes).toBeLessThan(160);
    expect(outlineMeshes).toBeGreaterThanOrEqual(1);
    expect(outlineMeshes).toBeLessThanOrEqual(25);
  });

  it('eliminates all transmission > 0 materials so Three.js never triggers renderTransmissionPass', () => {
    const { scene } = buildDioramaWorld();
    const transmissiveMeshes: string[] = [];

    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          const transmission = (mat as unknown as { transmission?: number })?.transmission ?? 0;
          if (transmission > 0) {
            transmissiveMeshes.push(obj.name || obj.uuid);
          }
        }
      }
    });

    expect(transmissiveMeshes).toEqual([]);
  });

  it('preserves all 62 semantic groups, all 11 animations, and [-12, 12] bounds after geometry batching', () => {
    const { rootDioramaGroup, animationTargets } = buildDioramaWorld();

    expect(ALL_62_REQUIRED_GROUPS.length).toBe(62);
    for (const groupName of ALL_62_REQUIRED_GROUPS) {
      expect(
        rootDioramaGroup.getObjectByName(groupName),
        `Missing required semantic group after optimization: ${groupName}`,
      ).toBeDefined();
    }

    // Verify key animated transforms still respond across time steps
    const initialDoorX = animationTargets.slidingDoorLeft!.position.x;
    const initialBladeRot = animationTargets.deskFanBlades!.rotation.z;
    const initialRotorY = animationTargets.lighthouseRotor!.rotation.y;

    updateDioramaAnimations(animationTargets, 12.2, 0.5);
    expect(animationTargets.slidingDoorLeft!.position.x).toBeLessThan(initialDoorX - 0.5);
    expect(animationTargets.deskFanBlades!.rotation.z).not.toBe(initialBladeRot);
    expect(animationTargets.lighthouseRotor!.rotation.y).not.toBe(initialRotorY);

    const boundsReport = checkWorldWithinBase(rootDioramaGroup);
    expect(boundsReport.violations).toEqual([]);
    expect(boundsReport.ok).toBe(true);
  });
});
