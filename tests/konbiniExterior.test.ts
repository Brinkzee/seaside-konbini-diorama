import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { updateDioramaAnimations } from '../src/animation/animationSystem';
import { checkWorldWithinBase } from '../src/config/paletteAndBounds';
import { buildExteriorProps } from '../src/world/exteriorProps';
import { buildStoreStructure } from '../src/world/storeStructure';

const FORBIDDEN_HUMAN_PATTERN =
  /\b(human|person|people|character|clerk|cashier|customer|pedestrian|mannequin|avatar|figure)\b/i;

function collectNodeNames(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((obj) => {
    if (obj.name) {
      names.push(obj.name);
    }
  });
  return names;
}

describe('Konbini Exterior: Store Structure & Lived-In Props', () => {
  it('builds konbini-structure with all required architectural groups, doors, awning, chime, and unobstructed glass', () => {
    const result = buildStoreStructure();

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.group.name).toBe('konbini-structure');
    expect(result.slidingDoorLeft).toBeInstanceOf(THREE.Object3D);
    expect(result.slidingDoorRight).toBeInstanceOf(THREE.Object3D);
    expect(result.awningValance).toBeInstanceOf(THREE.Object3D);
    expect(result.windChimePendulum).toBeInstanceOf(THREE.Object3D);
    expect(result.signLightboxMaterials.length).toBeGreaterThanOrEqual(2);

    const requiredGroups = [
      'konbini-building',
      'konbini-signboard',
      'pylon-sign',
      'striped-awning',
      'wind-chime',
      'sliding-door-left',
      'sliding-door-right',
      'welcome-mat',
      'storefront-windows',
    ];

    for (const groupName of requiredGroups) {
      const found = result.group.getObjectByName(groupName);
      expect(found, `Expected named group "${groupName}" in konbini-structure`).toBeDefined();
    }

    // Automatic sliding door closed coordinates
    expect(result.slidingDoorLeft.position.x).toBeCloseTo(-3.05, 2);
    expect(result.slidingDoorRight.position.x).toBeCloseTo(-1.95, 2);

    // Fascia kana sign panels must maintain natural ~4:1..5:1 aspect ratio without horizontal stretching
    for (const panelName of ['fascia-front-kana-panel', 'fascia-right-kana-panel']) {
      const signPanel = result.group.getObjectByName(panelName) as THREE.Mesh;
      expect(signPanel).toBeInstanceOf(THREE.Mesh);
      const params = (signPanel.geometry as THREE.PlaneGeometry).parameters;
      const aspect = params.width / params.height;
      expect(aspect).toBeGreaterThanOrEqual(3.8);
      expect(aspect).toBeLessThanOrEqual(5.2);
    }

    // Crystal-clear glass windows must exclude outlines and stay highly transparent
    const windowsGroup = result.group.getObjectByName('storefront-windows')!;
    let glassPaneCount = 0;
    windowsGroup.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const mat = mesh.material as THREE.Material & { opacity?: number };
        if (mat.transparent) {
          glassPaneCount += 1;
          expect(mesh.userData.noOutline).toBe(true);
          expect(mat.opacity ?? 1).toBeLessThanOrEqual(0.18);
          expect(mat.depthWrite).toBe(false);
        }
      }
    });
    expect(glassPaneCount).toBeGreaterThanOrEqual(3);

    // Building shell horizontal & vertical envelope check
    const buildingGroup = result.group.getObjectByName('konbini-building')!;
    result.group.updateMatrixWorld(true);
    const buildingBox = new THREE.Box3().setFromObject(buildingGroup);
    expect(buildingBox.min.x).toBeGreaterThanOrEqual(-7.35);
    expect(buildingBox.max.x).toBeLessThanOrEqual(2.35);
    expect(buildingBox.min.z).toBeGreaterThanOrEqual(-7.95);
    expect(buildingBox.max.z).toBeLessThanOrEqual(-0.45);
    expect(buildingBox.max.y).toBeCloseTo(4.35, 1);

    // Zero human nodes and strict [-12, 12] square base bounds
    for (const name of collectNodeNames(result.group)) {
      expect(name).not.toMatch(FORBIDDEN_HUMAN_PATTERN);
    }

    const boundsReport = checkWorldWithinBase(result.group);
    expect(boundsReport.checkedCount).toBeGreaterThan(15);
    expect(boundsReport.violations).toEqual([]);
    expect(boundsReport.ok).toBe(true);
  });

  it('builds exterior-props with all 13 lived-in coastal props, animation targets, zero humans, and strict [-12, 12] bounds', () => {
    const result = buildExteriorProps();

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.group.name).toBe('exterior-props');
    expect(result.acFanWheel).toBeInstanceOf(THREE.Object3D);
    expect(result.acWaterDrop).toBeInstanceOf(THREE.Object3D);
    expect(result.acRippleRing).toBeInstanceOf(THREE.Mesh);
    expect(result.flutteringPosterCorner).toBeInstanceOf(THREE.Object3D);
    expect(result.treeFoliageClusters.length).toBeGreaterThanOrEqual(3);
    expect(result.overheadWires.length).toBeGreaterThanOrEqual(3);
    expect(result.vendingGlowMaterials.length).toBeGreaterThanOrEqual(2);
    expect(result.streetlampLight).toBeInstanceOf(THREE.PointLight);

    const requiredPropGroups = [
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
    ];

    for (const propName of requiredPropGroups) {
      const found = result.group.getObjectByName(propName);
      expect(found, `Expected named group "${propName}" in exterior-props`).toBeDefined();
    }

    // AC condensation drop and puddle ripple coordinates
    expect(result.acWaterDrop.position.x).toBeCloseTo(2.85, 2);
    expect(result.acWaterDrop.position.y).toBeCloseTo(1.32, 2);
    expect(result.acWaterDrop.position.z).toBeCloseTo(-3.6, 2);
    expect(result.acRippleRing.position.x).toBeCloseTo(2.85, 2);
    expect(result.acRippleRing.position.y).toBeCloseTo(0.512, 3);
    expect(result.acRippleRing.position.z).toBeCloseTo(-3.6, 2);
    expect(result.acRippleRing.userData.noOutline).toBe(true);

    // Kei truck parked inside designated parking bay [-10.6, -8.2] x [-5.3, -1.5]
    result.group.updateMatrixWorld(true);
    const keiTruck = result.group.getObjectByName('kei-truck')!;
    const truckBox = new THREE.Box3().setFromObject(keiTruck);
    expect(truckBox.min.x).toBeGreaterThanOrEqual(-10.6);
    expect(truckBox.max.x).toBeLessThanOrEqual(-8.2);
    expect(truckBox.min.z).toBeGreaterThanOrEqual(-5.3);
    expect(truckBox.max.z).toBeLessThanOrEqual(-1.5);

    // Overhead catenary wires strictly inside [-11.5, 11.5]
    for (const wire of result.overheadWires) {
      const wireBox = new THREE.Box3().setFromObject(wire);
      expect(wireBox.min.x).toBeGreaterThanOrEqual(-11.5);
      expect(wireBox.max.x).toBeLessThanOrEqual(11.5);
      expect(wireBox.min.z).toBeGreaterThanOrEqual(-11.5);
      expect(wireBox.max.z).toBeLessThanOrEqual(11.5);
    }

    // Zero human nodes and strict [-12, 12] bounds across every mesh (including outlines)
    for (const name of collectNodeNames(result.group)) {
      expect(name).not.toMatch(FORBIDDEN_HUMAN_PATTERN);
    }

    const boundsReport = checkWorldWithinBase(result.group);
    expect(boundsReport.checkedCount).toBeGreaterThan(40);
    expect(boundsReport.violations).toEqual([]);
    expect(boundsReport.ok).toBe(true);

    // Also verify strict [-12, 12] without relying on 0.05 tolerance
    const strictBox = new THREE.Box3().setFromObject(result.group);
    expect(strictBox.min.x).toBeGreaterThanOrEqual(-12.0);
    expect(strictBox.max.x).toBeLessThanOrEqual(12.0);
    expect(strictBox.min.z).toBeGreaterThanOrEqual(-12.0);
    expect(strictBox.max.z).toBeLessThanOrEqual(12.0);
  });

  it('animates sliding doors, breeze targets, and AC drip cleanly without violating [-12, 12] bounds', () => {
    const store = buildStoreStructure();
    const props = buildExteriorProps();
    const root = new THREE.Group();
    root.add(store.group, props.group);

    for (const t of [0, 0.85, 2.1, 10.2, 12.5, 14.2, 16.0]) {
      updateDioramaAnimations(
        {
          slidingDoorLeft: store.slidingDoorLeft,
          slidingDoorRight: store.slidingDoorRight,
          awningValance: store.awningValance,
          windChimePendulum: store.windChimePendulum,
          signLightboxMaterials: store.signLightboxMaterials,
          acFanWheel: props.acFanWheel,
          acWaterDrop: props.acWaterDrop,
          acRippleRing: props.acRippleRing,
          flutteringPosterCorner: props.flutteringPosterCorner,
          treeFoliageClusters: props.treeFoliageClusters,
          overheadWires: props.overheadWires,
          vendingGlowMaterials: props.vendingGlowMaterials,
        },
        t,
        0.016,
      );

      const report = checkWorldWithinBase(root);
      expect(report.violations).toEqual([]);
      expect(report.ok).toBe(true);
    }

    // At t = 12.5s doors are held open; at t = 16.0s doors return closed
    updateDioramaAnimations(
      { slidingDoorLeft: store.slidingDoorLeft, slidingDoorRight: store.slidingDoorRight },
      12.5,
      0.016,
    );
    expect(store.slidingDoorLeft.position.x).toBeCloseTo(-3.95, 2);
    expect(store.slidingDoorRight.position.x).toBeCloseTo(-1.05, 2);

    updateDioramaAnimations(
      { slidingDoorLeft: store.slidingDoorLeft, slidingDoorRight: store.slidingDoorRight },
      16.0,
      0.016,
    );
    expect(store.slidingDoorLeft.position.x).toBeCloseTo(-3.05, 2);
    expect(store.slidingDoorRight.position.x).toBeCloseTo(-1.95, 2);
  });
});
