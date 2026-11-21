import * as THREE from 'three';

export const PALETTE = {
  seaSaltBlue: '#5b9bd5',
  seaSaltLight: '#8ecae6',
  creamWhite: '#fff8ec',
  warmWall: '#f7efe2',
  peachOrange: '#ff9e7d',
  coralPink: '#ff7b89',
  mintGreen: '#68d3b8',
  indigoDusk: '#1f305e',
  duskSkyMid: '#4f7cac',
  warmInteriorLight: '#ffe2a8',
  warmAmber: '#ffb86b',
  softNeonPink: '#ff8fab',
  softNeonCyan: '#72efdd',
  asphaltCool: '#3a445e',
  wetAsphalt: '#2b334a',
  drySand: '#edd6b4',
  wetSand: '#c9a982',
  resinDeep: '#1d6fa5',
  resinShallow: '#62c3c8',
  foamWhite: '#f8fcff',
  outlineInk: '#23293d',
  collectorBaseWood: '#2c2a35',
  collectorBaseTrim: '#433f4f',
  keiTruckBlue: '#8ec5e8',
} as const;

export const DIORAMA_BOUNDS = {
  halfSize: 12,
  minX: -12,
  maxX: 12,
  minZ: -12,
  maxZ: 12,
  tolerance: 0.05,
} as const;

export interface BoundsCheckReport {
  ok: boolean;
  violations: string[];
  checkedCount: number;
}

function hasIgnoredAncestor(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData?.ignoreBounds === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function resolveMeshLabel(mesh: THREE.Mesh): string {
  if (mesh.name) {
    return mesh.name;
  }
  let current: THREE.Object3D | null = mesh.parent;
  while (current) {
    if (current.name) {
      return `${current.name}/<unnamed-mesh>`;
    }
    current = current.parent;
  }
  return '<unnamed-mesh>';
}

function computeSingleMeshWorldBox(mesh: THREE.Mesh, target: THREE.Box3): THREE.Box3 {
  target.makeEmpty();
  const geometry = mesh.geometry;
  if (!geometry) {
    return target;
  }

  const posAttr = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();

  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const instanced = mesh as THREE.InstancedMesh;
    const instanceMatrix = new THREE.Matrix4();
    const worldInstanceMatrix = new THREE.Matrix4();

    if (posAttr && posAttr.count > 0) {
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, instanceMatrix);
        worldInstanceMatrix.multiplyMatrices(instanced.matrixWorld, instanceMatrix);
        for (let v = 0; v < posAttr.count; v++) {
          vertex.fromBufferAttribute(posAttr, v).applyMatrix4(worldInstanceMatrix);
          target.expandByPoint(vertex);
        }
      }
    }
    return target;
  }

  if (posAttr && posAttr.count > 0) {
    for (let v = 0; v < posAttr.count; v++) {
      vertex.fromBufferAttribute(posAttr, v).applyMatrix4(mesh.matrixWorld);
      target.expandByPoint(vertex);
    }
    return target;
  }

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  if (geometry.boundingBox && !geometry.boundingBox.isEmpty()) {
    target.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  }
  return target;
}

export function checkWorldWithinBase(root: THREE.Object3D): BoundsCheckReport {
  root.updateMatrixWorld(true);

  if (hasIgnoredAncestor(root)) {
    return {
      ok: true,
      violations: [],
      checkedCount: 0,
    };
  }

  const minAllowedX = DIORAMA_BOUNDS.minX - DIORAMA_BOUNDS.tolerance;
  const maxAllowedX = DIORAMA_BOUNDS.maxX + DIORAMA_BOUNDS.tolerance;
  const minAllowedZ = DIORAMA_BOUNDS.minZ - DIORAMA_BOUNDS.tolerance;
  const maxAllowedZ = DIORAMA_BOUNDS.maxZ + DIORAMA_BOUNDS.tolerance;

  const violations: string[] = [];
  let checkedCount = 0;
  const worldBox = new THREE.Box3();

  const visit = (node: THREE.Object3D): void => {
    if (node.userData?.ignoreBounds === true) {
      return;
    }

    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      computeSingleMeshWorldBox(mesh, worldBox);
      if (!worldBox.isEmpty()) {
        checkedCount += 1;
        if (
          worldBox.min.x < minAllowedX ||
          worldBox.max.x > maxAllowedX ||
          worldBox.min.z < minAllowedZ ||
          worldBox.max.z > maxAllowedZ
        ) {
          const label = resolveMeshLabel(mesh);
          violations.push(
            `${label} (x: [${worldBox.min.x.toFixed(3)}, ${worldBox.max.x.toFixed(3)}], z: [${worldBox.min.z.toFixed(3)}, ${worldBox.max.z.toFixed(3)}])`,
          );
        }
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);

  return {
    ok: violations.length === 0,
    violations,
    checkedCount,
  };
}
