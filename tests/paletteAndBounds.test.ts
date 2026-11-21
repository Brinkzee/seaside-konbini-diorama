import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DIORAMA_BOUNDS,
  PALETTE,
  checkWorldWithinBase,
} from '../src/config/paletteAndBounds';

describe('Palette and Square Base Bounds', () => {
  it('defines a symmetric 24x24 square base footprint [-12, 12] with 0.05 tolerance', () => {
    expect(DIORAMA_BOUNDS.halfSize).toBe(12);
    expect(DIORAMA_BOUNDS.minX).toBe(-12);
    expect(DIORAMA_BOUNDS.maxX).toBe(12);
    expect(DIORAMA_BOUNDS.minZ).toBe(-12);
    expect(DIORAMA_BOUNDS.maxZ).toBe(12);
    expect(DIORAMA_BOUNDS.tolerance).toBe(0.05);
    expect(DIORAMA_BOUNDS.maxX - DIORAMA_BOUNDS.minX).toBe(
      DIORAMA_BOUNDS.maxZ - DIORAMA_BOUNDS.minZ,
    );
  });

  it('exposes the full contract anime miniature palette', () => {
    const expectedKeys: (keyof typeof PALETTE)[] = [
      'seaSaltBlue',
      'seaSaltLight',
      'creamWhite',
      'warmWall',
      'peachOrange',
      'coralPink',
      'mintGreen',
      'indigoDusk',
      'duskSkyMid',
      'warmInteriorLight',
      'warmAmber',
      'softNeonPink',
      'softNeonCyan',
      'asphaltCool',
      'wetAsphalt',
      'drySand',
      'wetSand',
      'resinDeep',
      'resinShallow',
      'foamWhite',
      'outlineInk',
      'collectorBaseWood',
      'collectorBaseTrim',
      'keiTruckBlue',
    ];
    for (const key of expectedKeys) {
      expect(PALETTE[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('accurately detects meshes inside vs overflowing the square base bounds', () => {
    const root = new THREE.Group();
    const insideMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    insideMesh.name = 'inside-box';
    insideMesh.position.set(5, 1, -4);
    root.add(insideMesh);

    const initialReport = checkWorldWithinBase(root);
    expect(initialReport.ok).toBe(true);
    expect(initialReport.checkedCount).toBe(1);
    expect(initialReport.violations).toHaveLength(0);

    const outsideMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2));
    outsideMesh.name = 'overflow-prop';
    outsideMesh.position.set(12.8, 1, 0);
    root.add(outsideMesh);

    const report = checkWorldWithinBase(root);
    expect(report.ok).toBe(false);
    expect(report.checkedCount).toBe(2);
    expect(report.violations.some((v) => v.includes('overflow-prop'))).toBe(true);
  });

  it('skips meshes and subtrees marked with userData.ignoreBounds === true', () => {
    const root = new THREE.Group();

    const baseTray = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 24));
    baseTray.name = 'collector-base';
    root.add(baseTray);

    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(90, 16, 12));
    skyDome.name = 'sky-dome';
    skyDome.userData.ignoreBounds = true;
    root.add(skyDome);

    const ignoredGroup = new THREE.Group();
    ignoredGroup.userData.ignoreBounds = true;
    const distantHelper = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    distantHelper.name = 'ignored-child-mesh';
    distantHelper.position.set(-40, 5, 40);
    ignoredGroup.add(distantHelper);
    root.add(ignoredGroup);

    const report = checkWorldWithinBase(root);
    expect(report.ok).toBe(true);
    expect(report.checkedCount).toBe(1);
    expect(report.violations).toHaveLength(0);
  });

  it('computes world-space Box3 accurately for rotated child meshes inside transformed groups', () => {
    const root = new THREE.Group();
    const parentGroup = new THREE.Group();
    parentGroup.position.set(10.6, 0.5, -10.6);
    root.add(parentGroup);

    // Bar of length 4 along local X, depth 0.4 along local Z
    const rotatedBar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 0.4));
    rotatedBar.name = 'rotated-surfboard-bar';
    // Rotated 90 deg around Y -> X span is [10.4, 10.8], Z span is [-12.6, -8.6] -> Z overflows -12.05!
    rotatedBar.rotation.y = Math.PI / 2;
    parentGroup.add(rotatedBar);

    const overflowZReport = checkWorldWithinBase(root);
    expect(overflowZReport.ok).toBe(false);
    expect(
      overflowZReport.violations.some((v) => v.includes('rotated-surfboard-bar')),
    ).toBe(true);

    // Move Z inward to 0 and keep 90 deg rotation -> X span [10.4, 10.8], Z span [-2, 2] -> inside!
    parentGroup.position.set(10.6, 0.5, 0);
    expect(checkWorldWithinBase(root).ok).toBe(true);

    // Now rotate 45 deg around Y at X = 10.6 -> half X extent = (4*cos45 + 0.4*sin45)/2 ≈ 1.5556 -> maxX ≈ 12.1556 > 12.05!
    rotatedBar.rotation.y = Math.PI / 4;
    const rotatedCornerOverflow = checkWorldWithinBase(root);
    expect(rotatedCornerOverflow.ok).toBe(false);
    expect(
      rotatedCornerOverflow.violations.some((v) => v.includes('rotated-surfboard-bar')),
    ).toBe(true);
  });
});
