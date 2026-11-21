import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { updateDioramaAnimations } from '../src/animation/animationSystem';
import { checkWorldWithinBase } from '../src/config/paletteAndBounds';
import { buildStoreInterior } from '../src/world/storeInterior';

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

function computeMeshWorldBox(mesh: THREE.Mesh, outBox: THREE.Box3): THREE.Box3 {
  outBox.makeEmpty();
  const geometry = mesh.geometry;
  if (!geometry) {
    return outBox;
  }

  const posAttr = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const instanced = mesh as THREE.InstancedMesh;
    const instanceMatrix = new THREE.Matrix4();
    const worldMatrix = new THREE.Matrix4();
    if (posAttr && posAttr.count > 0) {
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, instanceMatrix);
        worldMatrix.multiplyMatrices(instanced.matrixWorld, instanceMatrix);
        for (let v = 0; v < posAttr.count; v++) {
          vertex.fromBufferAttribute(posAttr, v).applyMatrix4(worldMatrix);
          outBox.expandByPoint(vertex);
        }
      }
    }
    return outBox;
  }

  if (posAttr && posAttr.count > 0) {
    for (let v = 0; v < posAttr.count; v++) {
      vertex.fromBufferAttribute(posAttr, v).applyMatrix4(mesh.matrixWorld);
      outBox.expandByPoint(vertex);
    }
    return outBox;
  }

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (geometry.boundingBox) {
    outBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  }
  return outBox;
}

describe('Konbini Interior (storeInterior.ts)', () => {
  it('returns konbini-interior group, animated fan & mist targets, lightbox materials, and warm PointLights', () => {
    const result = buildStoreInterior();

    expect(result.group).toBeInstanceOf(THREE.Group);
    expect(result.group.name).toBe('konbini-interior');

    expect(result.deskFanHead).toBeInstanceOf(THREE.Object3D);
    expect(result.deskFanBlades).toBeInstanceOf(THREE.Object3D);
    expect(result.group.getObjectById(result.deskFanHead.id)).toBeDefined();
    expect(result.deskFanHead.getObjectById(result.deskFanBlades.id)).toBeDefined();

    expect(result.coldMistParticles.length).toBeGreaterThanOrEqual(8);
    for (const particle of result.coldMistParticles) {
      expect(typeof particle.userData.baseY).toBe('number');
      expect(typeof particle.userData.phase).toBe('number');
      expect(particle.userData.noOutline).toBe(true);
      expect(result.group.getObjectById(particle.id)).toBeDefined();
    }

    expect(result.interiorLightboxMaterials.length).toBeGreaterThanOrEqual(3);
    for (const mat of result.interiorLightboxMaterials) {
      expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(mat.emissiveIntensity).toBeGreaterThan(0);
    }

    expect(result.interiorWarmLights).toHaveLength(3);
    for (const light of result.interiorWarmLights) {
      expect(light).toBeInstanceOf(THREE.PointLight);
      expect(light.intensity).toBeGreaterThan(0);
      expect(light.position.y).toBeLessThanOrEqual(3.1);
      expect(light.distance).toBeGreaterThan(0);
      expect(light.distance).toBeLessThanOrEqual(8.5);
      expect(light.decay).toBeGreaterThanOrEqual(1.7);
      // ~3000K warm-white / amber glow: red >= green > blue
      expect(light.color.r).toBeGreaterThanOrEqual(light.color.g);
      expect(light.color.g).toBeGreaterThan(light.color.b);
      expect(result.group.getObjectById(light.id)).toBeDefined();
    }
  });

  it('contains all 15 required named interior zones populated with geometry and zero human nodes', () => {
    const { group } = buildStoreInterior();

    for (const zoneName of REQUIRED_INTERIOR_GROUPS) {
      const zone = group.getObjectByName(zoneName);
      expect(zone, `Missing required interior group: ${zoneName}`).toBeDefined();

      let meshCount = 0;
      zone!.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshCount += 1;
        }
      });
      expect(
        meshCount,
        `Interior zone ${zoneName} should contain at least 1 mesh`,
      ).toBeGreaterThan(0);
    }

    group.traverse((node) => {
      if (node.name) {
        expect(node.name).not.toMatch(
          /human|person|character|clerk|customer|pedestrian|people|avatar/i,
        );
      }
    });
  });

  it('keeps gondola shelves low-profile (height <= 1.75) and marks swim rings/glass noOutline', () => {
    const { group } = buildStoreInterior();
    group.updateMatrixWorld(true);

    const shelves = group.getObjectByName('interior-shelves')!;
    const shelvesBox = new THREE.Box3();
    const meshBox = new THREE.Box3();

    shelves.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        computeMeshWorldBox(node as THREE.Mesh, meshBox);
        shelvesBox.union(meshBox);
      }
    });

    const shelfHeight = shelvesBox.max.y - shelvesBox.min.y;
    expect(shelfHeight).toBeLessThanOrEqual(1.75);

    const summerDisplay = group.getObjectByName('interior-summer-display')!;
    let swimRingCount = 0;
    summerDisplay.traverse((node) => {
      if ((node as THREE.Mesh).isMesh && node.name.includes('swim-ring')) {
        swimRingCount += 1;
        expect(node.userData.noOutline).toBe(true);
      }
    });
    expect(swimRingCount).toBeGreaterThanOrEqual(2);

    // Performance regression guard: zero interior meshes may use transmission > 0
    // (which would otherwise trigger Three.js full-scene renderTransmissionPass)
    group.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const transmission = (mat as unknown as { transmission?: number })?.transmission ?? 0;
          expect(
            transmission,
            `Mesh "${mesh.name}" must not enable transmission > 0`,
          ).toBe(0);
        }
      }
    });
  });

  it('fits every mesh strictly inside the konbini interior footprint X ∈ [-7.0, 2.0], Z ∈ [-7.6, -0.8], Y ∈ [0.55, 3.74]', () => {
    const { group } = buildStoreInterior();
    group.updateMatrixWorld(true);

    const violations: string[] = [];
    const box = new THREE.Box3();
    let meshCount = 0;

    group.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        computeMeshWorldBox(mesh, box);
        if (box.isEmpty()) {
          return;
        }
        meshCount += 1;
        if (
          box.min.x < -7.0 ||
          box.max.x > 2.0 ||
          box.min.z < -7.6 ||
          box.max.z > -0.8 ||
          box.min.y < 0.55 ||
          box.max.y > 3.74
        ) {
          const label = mesh.name || mesh.parent?.name || '<unnamed>';
          violations.push(
            `${label}: X[${box.min.x.toFixed(3)}, ${box.max.x.toFixed(3)}] Y[${box.min.y.toFixed(3)}, ${box.max.y.toFixed(3)}] Z[${box.min.z.toFixed(3)}, ${box.max.z.toFixed(3)}]`,
          );
        }
      }
    });

    expect(meshCount).toBeGreaterThan(50);
    expect(violations).toEqual([]);

    const masterBoundsReport = checkWorldWithinBase(group);
    expect(masterBoundsReport.ok).toBe(true);
    expect(masterBoundsReport.violations).toEqual([]);
  });

  it('maintains strict interior bounds while animating desk fan oscillation, blade spin, and cold mist drift', () => {
    const interior = buildStoreInterior();
    const initialBladeAngle = interior.deskFanBlades.rotation.z;
    const initialHeadAngle = interior.deskFanHead.rotation.y;

    const sampleTimes = [0.6, 1.8, 3.2, 4.5, 9.4];
    const box = new THREE.Box3();

    for (const t of sampleTimes) {
      updateDioramaAnimations(
        {
          deskFanHead: interior.deskFanHead,
          deskFanBlades: interior.deskFanBlades,
          coldMistParticles: interior.coldMistParticles,
          interiorLightboxMaterials: interior.interiorLightboxMaterials,
        },
        t,
        0.016,
      );
      interior.group.updateMatrixWorld(true);

      interior.group.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          computeMeshWorldBox(node as THREE.Mesh, box);
          if (!box.isEmpty()) {
            expect(box.min.x).toBeGreaterThanOrEqual(-7.0);
            expect(box.max.x).toBeLessThanOrEqual(2.0);
            expect(box.min.z).toBeGreaterThanOrEqual(-7.6);
            expect(box.max.z).toBeLessThanOrEqual(-0.8);
            expect(box.min.y).toBeGreaterThanOrEqual(0.55);
            expect(box.max.y).toBeLessThanOrEqual(3.74);
          }
        }
      });
    }

    expect(interior.deskFanBlades.rotation.z).not.toBe(initialBladeAngle);
    expect(interior.deskFanHead.rotation.y).not.toBe(initialHeadAngle);
  });
});
