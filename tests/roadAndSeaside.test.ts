import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DIORAMA_BOUNDS, checkWorldWithinBase } from '../src/config/paletteAndBounds';
import { buildBaseAndRoad } from '../src/world/baseAndRoad';
import { buildSeasideZone } from '../src/world/seasideZone';

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshes.push(obj as THREE.Mesh);
    }
  });
  return meshes;
}

function assertStrictHorizontalBounds(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const meshes = collectMeshes(root);
  expect(meshes.length).toBeGreaterThan(0);

  const vertex = new THREE.Vector3();
  const box = new THREE.Box3();

  for (const mesh of meshes) {
    // Physical diorama objects in baseAndRoad and seasideZone must NOT bypass bounds via ignoreBounds
    expect(mesh.userData?.ignoreBounds).not.toBe(true);

    box.makeEmpty();
    const pos = mesh.geometry.getAttribute('position');
    expect(pos).toBeDefined();
    expect(pos.count).toBeGreaterThan(0);

    for (let i = 0; i < pos.count; i++) {
      vertex.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      box.expandByPoint(vertex);
    }

    const label = mesh.name || mesh.parent?.name || 'unnamed-mesh';
    expect(
      box.min.x,
      `${label} min.x (${box.min.x.toFixed(3)}) must be >= ${DIORAMA_BOUNDS.minX}`,
    ).toBeGreaterThanOrEqual(DIORAMA_BOUNDS.minX);
    expect(
      box.max.x,
      `${label} max.x (${box.max.x.toFixed(3)}) must be <= ${DIORAMA_BOUNDS.maxX}`,
    ).toBeLessThanOrEqual(DIORAMA_BOUNDS.maxX);
    expect(
      box.min.z,
      `${label} min.z (${box.min.z.toFixed(3)}) must be >= ${DIORAMA_BOUNDS.minZ}`,
    ).toBeGreaterThanOrEqual(DIORAMA_BOUNDS.minZ);
    expect(
      box.max.z,
      `${label} max.z (${box.max.z.toFixed(3)}) must be <= ${DIORAMA_BOUNDS.maxZ}`,
    ).toBeLessThanOrEqual(DIORAMA_BOUNDS.maxZ);
  }

  const report = checkWorldWithinBase(root);
  expect(report.ok, report.violations.join('; ')).toBe(true);
  expect(report.violations).toEqual([]);
}

function hasNoOutlineAncestorOrSelf(obj: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (current.userData?.noOutline === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

describe('Base and Road Builder (baseAndRoad.ts)', () => {
  it('builds base-and-road with all required named subgroups, reflective puddles, crosswalk, and traffic signal bulbs', () => {
    const result = buildBaseAndRoad();

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.group.name).toBe('base-and-road');

    const requiredGroups = [
      'base-tray',
      'asphalt-road',
      'zebra-crosswalk',
      'parking-bay',
      'drainage-gutter',
      'wet-puddles',
      'street-guardrails',
      'street-signs',
      'traffic-signal',
    ];

    for (const groupName of requiredGroups) {
      const sub = result.group.getObjectByName(groupName);
      expect(sub, `expected subgroup "${groupName}" to exist`).toBeDefined();
      expect(
        collectMeshes(sub!).length,
        `expected subgroup "${groupName}" to contain meshes`,
      ).toBeGreaterThan(0);
    }

    // Puddle shader materials (3 organic puddles including AC drip puddle at x=2.85, z=-3.6)
    expect(result.puddleMaterials.length).toBeGreaterThanOrEqual(3);
    for (const mat of result.puddleMaterials) {
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.uniforms.uTime).toBeDefined();
      expect(mat.uniforms.uRippleCenter).toBeDefined();
      expect(mat.uniforms.uRippleProgress).toBeDefined();
      expect(mat.uniforms.uDoorLightBoost).toBeDefined();
    }

    const wetPuddles = result.group.getObjectByName('wet-puddles')!;
    const puddleMeshes = collectMeshes(wetPuddles);
    expect(puddleMeshes.length).toBeGreaterThanOrEqual(3);
    for (const puddleMesh of puddleMeshes) {
      expect(puddleMesh.userData?.isOutline).not.toBe(true);
      expect(hasNoOutlineAncestorOrSelf(puddleMesh)).toBe(true);
    }

    // Verify AC drip puddle sits right under (x: 2.85, z: -3.6, y: ~0.505)
    result.group.updateMatrixWorld(true);
    const acPuddleFound = puddleMeshes.some((m) => {
      const worldPos = new THREE.Vector3();
      m.getWorldPosition(worldPos);
      return (
        Math.abs(worldPos.x - 2.85) < 0.2 &&
        Math.abs(worldPos.z - -3.6) < 0.2 &&
        Math.abs(worldPos.y - 0.505) < 0.05
      );
    });
    expect(acPuddleFound).toBe(true);

    // Crosswalk material & traffic light emissive bulbs
    expect(result.crosswalkMaterial).toBeInstanceOf(THREE.Material);
    expect(result.trafficLightBulbs.red).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(result.trafficLightBulbs.yellow).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(result.trafficLightBulbs.green).toBeInstanceOf(THREE.MeshStandardMaterial);

    // Flush rear service lane behind konbini (X ∈ [-7.65, 2.65], Z ∈ [-11.9, -7.75], top Y ≈ 0.36)
    const rearLane = result.group.getObjectByName('rear-service-lane') as THREE.Mesh | undefined;
    expect(rearLane).toBeDefined();
    const rearBox = new THREE.Box3().setFromObject(rearLane!);
    expect(rearBox.min.x).toBeLessThanOrEqual(-7.6);
    expect(rearBox.max.x).toBeGreaterThanOrEqual(2.65);
    expect(rearBox.min.z).toBeLessThanOrEqual(-11.85);
    expect(rearBox.max.z).toBeGreaterThanOrEqual(-7.8);
    expect(rearBox.max.y).toBeCloseTo(0.362, 2);
  });

  it('keeps every mesh in base-and-road strictly inside X ∈ [-12, 12] and Z ∈ [-12, 12]', () => {
    const { group } = buildBaseAndRoad();
    assertStrictHorizontalBounds(group);
  });
});

describe('Seaside Zone Builder (seasideZone.ts)', () => {
  it('builds seaside-zone with stairs, beach, translucent resin ocean, seawall, tetrapods, lighthouse, and beach props', () => {
    const result = buildSeasideZone();

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.group.name).toBe('seaside-zone');

    const requiredGroups = [
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
    ];

    for (const groupName of requiredGroups) {
      const sub = result.group.getObjectByName(groupName);
      expect(sub, `expected subgroup "${groupName}" to exist`).toBeDefined();
      expect(
        collectMeshes(sub!).length,
        `expected subgroup "${groupName}" to contain meshes`,
      ).toBeGreaterThan(0);
    }

    // Resin water surface material & shoreline foam mesh
    expect(result.waterSurfaceMaterial).toBeInstanceOf(THREE.ShaderMaterial);
    expect(result.waterSurfaceMaterial.uniforms.uTime).toBeDefined();
    expect(result.waterSurfaceMaterial.uniforms.uWavePhase).toBeDefined();
    expect(result.wetSandMaterial).toBeInstanceOf(THREE.Material);
    expect(result.foamStripMesh).toBeInstanceOf(THREE.Mesh);
    expect(result.lighthouseRotor).toBeInstanceOf(THREE.Object3D);

    // Resin ocean and sea glass must skip outlines
    const resinOcean = result.group.getObjectByName('resin-ocean')!;
    for (const mesh of collectMeshes(resinOcean)) {
      expect(mesh.userData?.isOutline).not.toBe(true);
      expect(hasNoOutlineAncestorOrSelf(mesh)).toBe(true);
    }

    const seaGlass = result.group.getObjectByName('sea-glass')!;
    for (const mesh of collectMeshes(seaGlass)) {
      expect(mesh.userData?.isOutline).not.toBe(true);
      expect(hasNoOutlineAncestorOrSelf(mesh)).toBe(true);
    }

    // Solid opaque props (e.g. tetrapods) should receive cartoon inverted-hull outlines
    const tetrapods = result.group.getObjectByName('tetrapods')!;
    const tetrapodOutlines = collectMeshes(tetrapods).filter(
      (m) => m.userData?.isOutline === true,
    );
    expect(tetrapodOutlines.length).toBeGreaterThan(0);

    // Verify authentic 4-legged tetrahedral geometry (~109.5° between every pair of legs)
    const firstPod = tetrapods.getObjectByName('tetrapod-0')!;
    expect(firstPod).toBeDefined();
    const legDirs = firstPod.children
      .filter((c) => (c as THREE.Mesh).isMesh && c.position.length() > 0.05)
      .map((c) => c.position.clone().normalize());
    expect(legDirs.length).toBe(4);
    for (let a = 0; a < legDirs.length; a++) {
      for (let b = a + 1; b < legDirs.length; b++) {
        const angleDeg = THREE.MathUtils.radToDeg(legDirs[a].angleTo(legDirs[b]));
        expect(angleDeg).toBeCloseTo(109.47, 1);
      }
    }

    // Lighthouse beam cone must skip outlines
    const beamCone = result.lighthouseRotor.getObjectByName('lighthouse-beam-cone');
    expect(beamCone).toBeDefined();
    expect(hasNoOutlineAncestorOrSelf(beamCone!)).toBe(true);
  });

  it('keeps every mesh in seaside-zone strictly inside X ∈ [-12, 12] and Z ∈ [-12, 12] across full 360° lighthouse rotation', () => {
    const { group, lighthouseRotor, foamStripMesh } = buildSeasideZone();

    // Check initial pose
    assertStrictHorizontalBounds(group);

    // Check full 360-degree rotation sweep of lighthouseRotor
    for (let step = 0; step < 8; step++) {
      lighthouseRotor.rotation.y = (step * Math.PI) / 4;
      assertStrictHorizontalBounds(group);
    }

    // Check wave surge displacement of foamStripMesh within typical animation range [-0.25, +0.25]
    const baseX = foamStripMesh.position.x;
    for (const surge of [-0.25, 0, 0.25]) {
      foamStripMesh.position.x = baseX + surge;
      assertStrictHorizontalBounds(group);
    }
    foamStripMesh.position.x = baseX;
  });
});
