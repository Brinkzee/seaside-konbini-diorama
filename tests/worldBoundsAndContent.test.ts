import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { updateDioramaAnimations } from '../src/animation/animationSystem';
import {
  INITIAL_CAMERA_FOV,
  INITIAL_CAMERA_POSITION,
  INITIAL_CAMERA_TARGET,
} from '../src/app/DioramaApp';
import { checkWorldWithinBase } from '../src/config/paletteAndBounds';
import { buildDioramaWorld } from '../src/world/buildDioramaWorld';

const REQUIRED_MODULE_ROOT_GROUPS = [
  'base-and-road',
  'seaside-zone',
  'konbini-structure',
  'exterior-props',
  'konbini-interior',
] as const;

const REQUIRED_ROAD_GROUPS = [
  'base-tray',
  'asphalt-road',
  'zebra-crosswalk',
  'parking-bay',
  'drainage-gutter',
  'wet-puddles',
  'street-guardrails',
  'street-signs',
  'traffic-signal',
] as const;

const REQUIRED_SEASIDE_GROUPS = [
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
] as const;

const REQUIRED_STRUCTURE_GROUPS = [
  'konbini-building',
  'konbini-signboard',
  'pylon-sign',
  'striped-awning',
  'wind-chime',
  'sliding-door-left',
  'sliding-door-right',
  'welcome-mat',
  'storefront-windows',
] as const;

const REQUIRED_EXTERIOR_PROP_GROUPS = [
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
] as const;

const REQUIRED_INTERIOR_GROUPS = [
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

const FORBIDDEN_HUMAN_NAME_PATTERN =
  /\b(human|person|people|character|clerk|customer|pedestrian|shopper|mannequin|npc|avatar)\b/i;

describe('Integrated Seaside Konbini Diorama World Bounds & Content', () => {
  it('assembles all required road, seaside, structure, exterior, and interior named groups with zero human characters', () => {
    const { scene, rootDioramaGroup, skyAndLighting } = buildDioramaWorld();

    expect(skyAndLighting.skyDome.userData.ignoreBounds).toBe(true);

    const allRequiredNames = [
      ...REQUIRED_MODULE_ROOT_GROUPS,
      ...REQUIRED_ROAD_GROUPS,
      ...REQUIRED_SEASIDE_GROUPS,
      ...REQUIRED_STRUCTURE_GROUPS,
      ...REQUIRED_EXTERIOR_PROP_GROUPS,
      ...REQUIRED_INTERIOR_GROUPS,
    ];

    for (const requiredName of allRequiredNames) {
      const found = rootDioramaGroup.getObjectByName(requiredName);
      expect(found, `Missing required diorama group: "${requiredName}"`).toBeDefined();
    }

    const humanMatches: string[] = [];
    scene.traverse((node) => {
      if (node.name && FORBIDDEN_HUMAN_NAME_PATTERN.test(node.name)) {
        humanMatches.push(node.name);
      }
    });
    expect(humanMatches).toEqual([]);
  });

  it('keeps every physical mesh strictly within the [-12, 12] square base both statically and throughout animations', () => {
    const { scene, rootDioramaGroup, animationTargets } = buildDioramaWorld();

    const staticReport = checkWorldWithinBase(rootDioramaGroup);
    expect(staticReport.violations).toEqual([]);
    expect(staticReport.ok).toBe(true);
    expect(staticReport.checkedCount).toBeGreaterThan(50);

    const fullSceneReport = checkWorldWithinBase(scene);
    expect(fullSceneReport.violations).toEqual([]);
    expect(fullSceneReport.ok).toBe(true);

    // Verify animations (lighthouse 360 sweep, sliding doors open, wave surge, sea breeze) never push any mesh outside [-12, 12]
    for (const t of [2.5, 4.5, 9.0, 12.2, 13.5, 16.0, 21.5]) {
      updateDioramaAnimations(animationTargets, t, 0.5);
      const animReport = checkWorldWithinBase(rootDioramaGroup);
      expect(
        animReport.violations,
        `Bounds violation at animation time t=${t}s`,
      ).toEqual([]);
      expect(animReport.ok).toBe(true);
    }
  });

  it('frames all 4 corners of the [-12, 12] collector tray and tallest props cleanly inside the 1440x900 first-frame viewport', () => {
    const camera = new THREE.PerspectiveCamera(INITIAL_CAMERA_FOV, 1440 / 900, 0.25, 400);
    camera.position.copy(INITIAL_CAMERA_POSITION);
    camera.lookAt(INITIAL_CAMERA_TARGET);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const keyWorldPoints = [
      new THREE.Vector3(12, -1.45, 12), // front-most bottom tray corner
      new THREE.Vector3(-12, -1.45, 12), // left bottom tray corner
      new THREE.Vector3(12, -1.45, -12), // right bottom resin/tray corner
      new THREE.Vector3(-12, -1.45, -12), // back bottom tray corner
      new THREE.Vector3(12, 0.0, 12), // front resin ocean cut-edge top
      new THREE.Vector3(-7.1, 5.4, 0.15), // konbini pylon sign top
      new THREE.Vector3(3.4, 6.35, 0.25), // main utility pole top
      new THREE.Vector3(9.5, 4.4, -9.5), // mini lighthouse top
    ];

    for (const pt of keyWorldPoints) {
      const ndc = pt.clone().project(camera);
      expect(ndc.x, `Point (${pt.x}, ${pt.y}, ${pt.z}) clipped horizontally`).toBeGreaterThan(-0.92);
      expect(ndc.x, `Point (${pt.x}, ${pt.y}, ${pt.z}) clipped horizontally`).toBeLessThan(0.92);
      expect(ndc.y, `Point (${pt.x}, ${pt.y}, ${pt.z}) clipped vertically`).toBeGreaterThan(-0.92);
      expect(ndc.y, `Point (${pt.x}, ${pt.y}, ${pt.z}) clipped vertically`).toBeLessThan(0.92);
    }
  });
});
