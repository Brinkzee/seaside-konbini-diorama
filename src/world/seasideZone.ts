import * as THREE from 'three';
import { PALETTE } from '../config/paletteAndBounds';
import { createStripedFabricTexture } from '../rendering/canvasTextures';
import {
  applyOutlinesToHierarchy,
  createEmissiveLightboxMaterial,
  createGlassMaterial,
  createResinCutEdgeMaterial,
  createResinWaterSurfaceMaterial,
  createToonMaterial,
} from '../rendering/toonMaterials';

export interface SeasideZoneResult {
  group: THREE.Group; // name: 'seaside-zone'
  waterSurfaceMaterial: THREE.ShaderMaterial;
  wetSandMaterial: THREE.ShaderMaterial | THREE.MeshStandardMaterial;
  foamStripMesh: THREE.Mesh;
  lighthouseRotor: THREE.Object3D;
}

const BEACH_MIN_X = 4.2;
const OCEAN_OUTER_X = 11.9;
const OCEAN_MIN_Z = -11.9;
const OCEAN_MAX_Z = 11.9;
const SAND_BASE_BOTTOM_Y = -0.84;
const WATER_SURFACE_Y = -0.02;

function markNoOutline<T extends THREE.Object3D>(obj: T): T {
  obj.userData.noOutline = true;
  return obj;
}

/**
 * Natural gentle cove shoreline X coordinate for any Z ∈ [-11.9, 11.9].
 * Stays smoothly within [7.03, 7.87], centered near X = 7.45.
 */
function getShorelineX(z: number): number {
  return 7.45 + 0.28 * Math.sin(z * 0.21 + 0.4) - 0.14 * Math.cos(z * 0.37);
}

/**
 * Continuous sculpted sand elevation across both the dry beach (X < shoreX)
 * and the submerged resin seabed (X >= shoreX).
 */
function getSandElevation(x: number, z: number): number {
  const shoreX = getShorelineX(z);
  if (x <= shoreX) {
    const t = THREE.MathUtils.clamp((x - BEACH_MIN_X) / (shoreX - BEACH_MIN_X), 0, 1);
    const berm = 0.026 * Math.sin(t * Math.PI);
    const ripple = 0.01 * Math.sin(z * 0.34) * (1 - t);
    return THREE.MathUtils.lerp(0.29, WATER_SURFACE_Y, t) + berm + ripple;
  }

  const u = THREE.MathUtils.clamp((x - shoreX) / (OCEAN_OUTER_X - shoreX), 0, 1);
  const sandbarUndulation = 0.018 * Math.sin(u * Math.PI * 2.0 + z * 0.32) * (1 - u * 0.55);
  return WATER_SURFACE_Y - 0.77 * Math.pow(u, 0.88) + sandbarUndulation;
}

/**
 * Builds a water-tight 3D solid beach & seabed wedge (top sculpted grid + bottom face
 * + all 4 vertical cross-section walls) with warm-to-aqua vertex colors.
 */
function createSolidSandWedgeGeometry(segX = 34, segZ = 48): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const dryCol = new THREE.Color(PALETTE.drySand);
  const dampCol = new THREE.Color('#d6b48c');
  const shallowBedCol = new THREE.Color('#ace0d8');
  const deepBedCol = new THREE.Color('#7bc2cf');
  const stratumCol = new THREE.Color('#c8ab87');
  const tmpCol = new THREE.Color();

  const sampleSandColor = (x: number, z: number): THREE.Color => {
    const shoreX = getShorelineX(z);
    if (x < shoreX - 0.55) {
      const t = THREE.MathUtils.clamp((x - (shoreX - 1.35)) / 0.8, 0, 1);
      return tmpCol.copy(dryCol).lerp(dampCol, t * 0.55);
    }
    if (x <= shoreX + 0.25) {
      const t = THREE.MathUtils.clamp((x - (shoreX - 0.55)) / 0.8, 0, 1);
      return tmpCol.copy(dampCol).lerp(shallowBedCol, t * 0.45);
    }
    const u = THREE.MathUtils.clamp((x - shoreX) / (OCEAN_OUTER_X - shoreX), 0, 1);
    return tmpCol.copy(shallowBedCol).lerp(deepBedCol, Math.pow(u, 0.8));
  };

  const pushVertex = (x: number, y: number, z: number, col: THREE.Color): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    colors.push(col.r, col.g, col.b);
    return idx;
  };

  // 1. Top sculpted surface grid
  const topGrid: number[][] = [];
  for (let iz = 0; iz <= segZ; iz++) {
    const z = THREE.MathUtils.lerp(OCEAN_MIN_Z, OCEAN_MAX_Z, iz / segZ);
    const row: number[] = [];
    for (let ix = 0; ix <= segX; ix++) {
      const x = THREE.MathUtils.lerp(BEACH_MIN_X, OCEAN_OUTER_X, ix / segX);
      const y = getSandElevation(x, z);
      row.push(pushVertex(x, y, z, sampleSandColor(x, z)));
    }
    topGrid.push(row);
  }

  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = topGrid[iz][ix];
      const b = topGrid[iz + 1][ix];
      const c = topGrid[iz + 1][ix + 1];
      const d = topGrid[iz][ix + 1];
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Helper to append a vertical cross-section wall from perimeter samples (CCW outward)
  const addVerticalWall = (samples: Array<[number, number]>): void => {
    const topVerts: number[] = [];
    const botVerts: number[] = [];
    for (const [wx, wz] of samples) {
      const wy = getSandElevation(wx, wz);
      topVerts.push(pushVertex(wx, wy, wz, sampleSandColor(wx, wz)));
      botVerts.push(pushVertex(wx, SAND_BASE_BOTTOM_Y, wz, stratumCol));
    }
    for (let i = 0; i < samples.length - 1; i++) {
      const t0 = topVerts[i];
      const t1 = topVerts[i + 1];
      const b0 = botVerts[i];
      const b1 = botVerts[i + 1];
      indices.push(t0, b0, t1);
      indices.push(b0, b1, t1);
    }
  };

  // Front wall (+Z = 11.90): left-to-right (X: 4.2 -> 11.9) faces +Z
  const frontSamples: Array<[number, number]> = [];
  for (let ix = 0; ix <= segX; ix++) {
    frontSamples.push([
      THREE.MathUtils.lerp(BEACH_MIN_X, OCEAN_OUTER_X, ix / segX),
      OCEAN_MAX_Z,
    ]);
  }
  addVerticalWall(frontSamples);

  // Right wall (+X = 11.90): front-to-back (Z: 11.9 -> -11.9) faces +X
  const rightSamples: Array<[number, number]> = [];
  for (let iz = segZ; iz >= 0; iz--) {
    rightSamples.push([
      OCEAN_OUTER_X,
      THREE.MathUtils.lerp(OCEAN_MIN_Z, OCEAN_MAX_Z, iz / segZ),
    ]);
  }
  addVerticalWall(rightSamples);

  // Back wall (-Z = -11.90): right-to-left (X: 11.9 -> 4.2) faces -Z
  const backSamples: Array<[number, number]> = [];
  for (let ix = segX; ix >= 0; ix--) {
    backSamples.push([
      THREE.MathUtils.lerp(BEACH_MIN_X, OCEAN_OUTER_X, ix / segX),
      OCEAN_MIN_Z,
    ]);
  }
  addVerticalWall(backSamples);

  // Inner west wall (X = 4.20): back-to-front (Z: -11.9 -> 11.9) faces -X
  const innerSamples: Array<[number, number]> = [];
  for (let iz = 0; iz <= segZ; iz++) {
    innerSamples.push([
      BEACH_MIN_X,
      THREE.MathUtils.lerp(OCEAN_MIN_Z, OCEAN_MAX_Z, iz / segZ),
    ]);
  }
  addVerticalWall(innerSamples);

  // Bottom cap at SAND_BASE_BOTTOM_Y
  const b00 = pushVertex(BEACH_MIN_X, SAND_BASE_BOTTOM_Y, OCEAN_MIN_Z, stratumCol);
  const b10 = pushVertex(OCEAN_OUTER_X, SAND_BASE_BOTTOM_Y, OCEAN_MIN_Z, stratumCol);
  const b11 = pushVertex(OCEAN_OUTER_X, SAND_BASE_BOTTOM_Y, OCEAN_MAX_Z, stratumCol);
  const b01 = pushVertex(BEACH_MIN_X, SAND_BASE_BOTTOM_Y, OCEAN_MAX_Z, stratumCol);
  indices.push(b00, b10, b11);
  indices.push(b00, b11, b01);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds a shore-hugging ribbon geometry (used for wet sand band & painted foam strip).
 */
function createShorelineRibbonGeometry(
  zStart: number,
  zEnd: number,
  segZ: number,
  offsetMinFn: (z: number) => number,
  offsetMaxFn: (z: number) => number,
  yAtFn: (x: number, z: number) => number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const cols = 5;
  for (let iz = 0; iz <= segZ; iz++) {
    const v = iz / segZ;
    const z = THREE.MathUtils.lerp(zStart, zEnd, v);
    const shoreX = getShorelineX(z);
    const xStart = shoreX + offsetMinFn(z);
    const xEnd = shoreX + offsetMaxFn(z);

    for (let ix = 0; ix <= cols; ix++) {
      const u = ix / cols;
      const x = THREE.MathUtils.lerp(xStart, xEnd, u);
      const y = yAtFn(x, z);
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }

  const stride = cols + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < cols; ix++) {
      const a = iz * stride + ix;
      const b = (iz + 1) * stride + ix;
      const c = (iz + 1) * stride + ix + 1;
      const d = iz * stride + ix + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds the top ocean surface grid from the curved shoreline out to X = 11.90,
 * mapping uv.x = 0 at shoreline to uv.x = 1 at the outer cut-edge.
 */
function createOceanSurfaceGeometry(segX = 28, segZ = 48): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= segZ; iz++) {
    const v = iz / segZ;
    const z = THREE.MathUtils.lerp(OCEAN_MIN_Z, OCEAN_MAX_Z, v);
    const xMin = getShorelineX(z) - 0.1;

    for (let ix = 0; ix <= segX; ix++) {
      const u = ix / segX;
      const x = THREE.MathUtils.lerp(xMin, OCEAN_OUTER_X, u);
      positions.push(x, WATER_SURFACE_Y, z);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }

  const stride = segX + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * stride + ix;
      const b = (iz + 1) * stride + ix;
      const c = (iz + 1) * stride + ix + 1;
      const d = iz * stride + ix + 1;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds a vertical crystal-clear epoxy resin cut-face wall matching the exact sand
 * seabed contour at the bottom and `WATER_SURFACE_Y` at the top.
 */
function createResinCutWallGeometry(
  samples: Array<[number, number]>,
  outwardNormal: THREE.Vector3,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const count = samples.length;
  for (let i = 0; i < count; i++) {
    const [x, z] = samples[i];
    const u = i / Math.max(1, count - 1);
    const bottomY = Math.min(WATER_SURFACE_Y - 0.015, getSandElevation(x, z) - 0.005);

    // Top vertex
    positions.push(x, WATER_SURFACE_Y, z);
    normals.push(outwardNormal.x, outwardNormal.y, outwardNormal.z);
    uvs.push(u, 1);

    // Bottom vertex
    positions.push(x, bottomY, z);
    normals.push(outwardNormal.x, outwardNormal.y, outwardNormal.z);
    uvs.push(u, 0);
  }

  for (let i = 0; i < count - 1; i++) {
    const t0 = i * 2;
    const b0 = i * 2 + 1;
    const t1 = (i + 1) * 2;
    const b1 = (i + 1) * 2 + 1;
    indices.push(t0, b0, t1);
    indices.push(b0, b1, t1);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds an authentic 4-legged tetrahedral concrete wave-dissipating block (消波ブロック)
 * with legs separated by the exact tetrahedral angle arccos(-1/3) ≈ 109.47°.
 */
function createConcreteTetrapod(scale: number, mat: THREE.Material): THREE.Group {
  const pod = new THREE.Group();

  const tetraDirs = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3((2 * Math.sqrt(2)) / 3, -1 / 3, 0),
    new THREE.Vector3(-Math.sqrt(2) / 3, -1 / 3, Math.sqrt(2 / 3)),
    new THREE.Vector3(-Math.sqrt(2) / 3, -1 / 3, -Math.sqrt(2 / 3)),
  ];

  const up = new THREE.Vector3(0, 1, 0);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 10, 8), mat);
  pod.add(hub);

  const legLength = 0.52 * scale;
  const legGeom = new THREE.CylinderGeometry(0.105 * scale, 0.165 * scale, legLength, 10);

  for (const dir of tetraDirs) {
    const unitDir = dir.clone().normalize();
    const leg = new THREE.Mesh(legGeom, mat);
    leg.quaternion.setFromUnitVectors(up, unitDir);
    leg.position.copy(unitDir).multiplyScalar(legLength * 0.44);
    pod.add(leg);
  }

  return pod;
}

export function buildSeasideZone(): SeasideZoneResult {
  const group = new THREE.Group();
  group.name = 'seaside-zone';

  // ---------------------------------------------------------------------------
  // 1. Sculpted Dry-to-Submerged Sand Beach Wedge ('sand-beach')
  // ---------------------------------------------------------------------------
  const sandBeach = new THREE.Group();
  sandBeach.name = 'sand-beach';
  group.add(sandBeach);

  const sandMat = createToonMaterial({ color: '#ffffff' });
  sandMat.vertexColors = true;
  const sandWedgeMesh = new THREE.Mesh(createSolidSandWedgeGeometry(34, 48), sandMat);
  sandWedgeMesh.name = 'sand-beach-wedge';
  sandWedgeMesh.userData.outlineThickness = 0.012;
  sandWedgeMesh.receiveShadow = true;
  sandBeach.add(sandWedgeMesh);

  // ---------------------------------------------------------------------------
  // 2. Damp Sunset-Reflective Shoreline Band ('wet-sand-band')
  // ---------------------------------------------------------------------------
  const wetSandBand = markNoOutline(new THREE.Group());
  wetSandBand.name = 'wet-sand-band';
  group.add(wetSandBand);

  const wetSandMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.wetSand,
    roughness: 0.18,
    metalness: 0.06,
    emissive: new THREE.Color(PALETTE.peachOrange),
    emissiveIntensity: 0.11,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  wetSandMaterial.userData.noOutline = true;

  const wetRibbonGeom = createShorelineRibbonGeometry(
    -8.85,
    11.88,
    46,
    (z) => -0.92 + 0.08 * Math.sin(z * 0.7),
    () => 0.26,
    (x, z) => getSandElevation(x, z) + 0.006,
  );
  const wetSandMesh = markNoOutline(new THREE.Mesh(wetRibbonGeom, wetSandMaterial));
  wetSandMesh.name = 'wet-sand-ribbon-mesh';
  wetSandBand.add(wetSandMesh);

  // ---------------------------------------------------------------------------
  // 3. Collector-Grade Translucent Resin Ocean Block ('resin-ocean')
  // ---------------------------------------------------------------------------
  const resinOcean = markNoOutline(new THREE.Group());
  resinOcean.name = 'resin-ocean';
  group.add(resinOcean);

  const waterSurfaceMaterial = createResinWaterSurfaceMaterial();
  const waterSurfaceMesh = markNoOutline(
    new THREE.Mesh(createOceanSurfaceGeometry(28, 48), waterSurfaceMaterial),
  );
  waterSurfaceMesh.name = 'resin-water-surface';
  waterSurfaceMesh.renderOrder = 2;
  resinOcean.add(waterSurfaceMesh);

  // Painted-model-style scalloped white shoreline foam strip (`foamStripMesh`)
  const foamMat = new THREE.MeshToonMaterial({
    color: PALETTE.foamWhite,
    emissive: new THREE.Color('#fffaf2'),
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  foamMat.userData.noOutline = true;

  const foamRibbonGeom = createShorelineRibbonGeometry(
    -8.82,
    11.85,
    56,
    (z) => -0.22 + 0.06 * Math.sin(z * 1.65) + 0.03 * Math.cos(z * 3.4),
    (z) => 0.14 + 0.05 * Math.cos(z * 1.9 - 0.5),
    (x, z) => Math.max(WATER_SURFACE_Y + 0.008, getSandElevation(x, z) + 0.012),
  );
  const foamStripMesh = markNoOutline(new THREE.Mesh(foamRibbonGeom, foamMat));
  foamStripMesh.name = 'shoreline-foam-strip';
  foamStripMesh.position.set(0, 0, 0);
  foamStripMesh.renderOrder = 3;
  resinOcean.add(foamStripMesh);

  // Crystal-clear vertical epoxy resin cut-face walls at X = 11.90 and Z = ±11.90
  const resinCutEdgeMat = createResinCutEdgeMaterial();

  // +X outer resin cut-face (Z: 11.90 -> -11.90)
  const rightCutSamples: Array<[number, number]> = [];
  for (let i = 0; i <= 48; i++) {
    rightCutSamples.push([
      OCEAN_OUTER_X,
      THREE.MathUtils.lerp(OCEAN_MAX_Z, OCEAN_MIN_Z, i / 48),
    ]);
  }
  const rightCutSlab = markNoOutline(
    new THREE.Mesh(
      createResinCutWallGeometry(rightCutSamples, new THREE.Vector3(1, 0, 0)),
      resinCutEdgeMat,
    ),
  );
  rightCutSlab.name = 'resin-cut-face-east';
  rightCutSlab.renderOrder = 2;
  resinOcean.add(rightCutSlab);

  // +Z front resin cut-face wedge (X: shoreX -> 11.90 at Z = +11.90)
  const frontShoreX = getShorelineX(OCEAN_MAX_Z) - 0.06;
  const frontCutSamples: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    frontCutSamples.push([
      THREE.MathUtils.lerp(frontShoreX, OCEAN_OUTER_X, i / 24),
      OCEAN_MAX_Z,
    ]);
  }
  const frontCutSlab = markNoOutline(
    new THREE.Mesh(
      createResinCutWallGeometry(frontCutSamples, new THREE.Vector3(0, 0, 1)),
      resinCutEdgeMat,
    ),
  );
  frontCutSlab.name = 'resin-cut-face-south';
  frontCutSlab.renderOrder = 2;
  resinOcean.add(frontCutSlab);

  // -Z back resin cut-face wedge (X: 11.90 -> shoreX at Z = -11.90)
  const backShoreX = getShorelineX(OCEAN_MIN_Z) - 0.06;
  const backCutSamples: Array<[number, number]> = [];
  for (let i = 0; i <= 24; i++) {
    backCutSamples.push([
      THREE.MathUtils.lerp(OCEAN_OUTER_X, backShoreX, i / 24),
      OCEAN_MIN_Z,
    ]);
  }
  const backCutSlab = markNoOutline(
    new THREE.Mesh(
      createResinCutWallGeometry(backCutSamples, new THREE.Vector3(0, 0, -1)),
      resinCutEdgeMat,
    ),
  );
  backCutSlab.name = 'resin-cut-face-north';
  backCutSlab.renderOrder = 2;
  resinOcean.add(backCutSlab);

  // Subtle internal aquamarine resin volume layer for rich optical depth
  const resinDepthLayerMat = new THREE.MeshBasicMaterial({
    color: PALETTE.resinShallow,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const resinDepthPlane = markNoOutline(
    new THREE.Mesh(new THREE.PlaneGeometry(3.5, 23.75), resinDepthLayerMat),
  );
  resinDepthPlane.name = 'resin-internal-tint-plane';
  resinDepthPlane.rotation.x = -Math.PI * 0.5;
  resinDepthPlane.position.set(10.12, -0.26, 0);
  resinOcean.add(resinDepthPlane);

  // ---------------------------------------------------------------------------
  // 4. Wooden Beach Stairs with Post Handrails ('wooden-stairs')
  // ---------------------------------------------------------------------------
  const woodenStairs = new THREE.Group();
  woodenStairs.name = 'wooden-stairs';
  group.add(woodenStairs);

  const weatheredWoodMat = createToonMaterial({ color: '#b9936c' });
  const darkTimberMat = createToonMaterial({ color: '#8c694a' });
  const boltIronMat = createToonMaterial({ color: '#454d61' });

  const stepCount = 6;
  const stairStartX = 4.35;
  const stairEndX = 5.62;
  const stairStartY = 0.31;
  const stairEndY = getSandElevation(stairEndX, -0.8) + 0.015;
  const stairCenterZ = -0.8;
  const stairWidthZ = 1.46;

  // Twin diagonal stringer beams supporting the treads
  const dxStair = stairEndX - stairStartX;
  const dyStair = stairStartY - stairEndY;
  const stringerLen = Math.hypot(dxStair, dyStair) + 0.16;
  const stringerSlope = Math.atan2(dyStair, dxStair);
  const stringerGeom = new THREE.BoxGeometry(stringerLen, 0.09, 0.065);

  for (const zSide of [-0.62, 0.62]) {
    const stringer = new THREE.Mesh(stringerGeom, darkTimberMat);
    stringer.position.set(
      (stairStartX + stairEndX) * 0.5,
      (stairStartY + stairEndY) * 0.5 - 0.05,
      stairCenterZ + zSide,
    );
    stringer.rotation.z = -stringerSlope;
    woodenStairs.add(stringer);
  }

  // Individual weathered cedar plank treads
  const treadGeom = new THREE.BoxGeometry(0.24, 0.042, stairWidthZ);
  for (let i = 0; i < stepCount; i++) {
    const t = i / (stepCount - 1);
    const tx = THREE.MathUtils.lerp(stairStartX, stairEndX, t);
    const ty = THREE.MathUtils.lerp(stairStartY, stairEndY, t);
    const tread = new THREE.Mesh(treadGeom, weatheredWoodMat);
    tread.position.set(tx, ty, stairCenterZ);
    woodenStairs.add(tread);
  }

  // Timber handrail posts + sloped top & mid rails on both sides
  const postGeom = new THREE.BoxGeometry(0.068, 0.62, 0.068);
  const postCapGeom = new THREE.BoxGeometry(0.086, 0.028, 0.086);
  const railLen = stringerLen + 0.12;
  const topRailGeom = new THREE.BoxGeometry(railLen, 0.048, 0.058);
  const midRailGeom = new THREE.BoxGeometry(railLen, 0.032, 0.04);

  for (const zSign of [-1, 1]) {
    const railZ = stairCenterZ + zSign * (stairWidthZ * 0.5 + 0.02);

    for (const postT of [0, 0.5, 1]) {
      const px = THREE.MathUtils.lerp(stairStartX, stairEndX, postT);
      const py = THREE.MathUtils.lerp(stairStartY, stairEndY, postT);

      const post = new THREE.Mesh(postGeom, darkTimberMat);
      post.position.set(px, py + 0.24, railZ);
      woodenStairs.add(post);

      const cap = new THREE.Mesh(postCapGeom, weatheredWoodMat);
      cap.position.set(px, py + 0.56, railZ);
      woodenStairs.add(cap);

      const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.022, 0.022), boltIronMat);
      bolt.position.set(px, py + 0.45, railZ);
      woodenStairs.add(bolt);
    }

    const topRail = new THREE.Mesh(topRailGeom, weatheredWoodMat);
    topRail.position.set(
      (stairStartX + stairEndX) * 0.5,
      (stairStartY + stairEndY) * 0.5 + 0.53,
      railZ,
    );
    topRail.rotation.z = -stringerSlope;
    woodenStairs.add(topRail);

    const midRail = new THREE.Mesh(midRailGeom, darkTimberMat);
    midRail.position.set(
      (stairStartX + stairEndX) * 0.5,
      (stairStartY + stairEndY) * 0.5 + 0.31,
      railZ,
    );
    midRail.rotation.z = -stringerSlope;
    woodenStairs.add(midRail);
  }

  // ---------------------------------------------------------------------------
  // 5. Low Concrete Seawall Jetty ('seawall', X ∈ [4.8, 10.6], Z ∈ [-10.6, -8.9])
  // ---------------------------------------------------------------------------
  const seawall = new THREE.Group();
  seawall.name = 'seawall';
  group.add(seawall);

  const jettyConcreteMat = createToonMaterial({ color: '#cfd5df' });
  const jettyTrimMat = createToonMaterial({ color: '#b7c0cd' });
  const tidalAlgaeMat = createToonMaterial({ color: '#617d76' });

  // Segmented poured-concrete breakwater caissons from shore (X = 4.85) out to pierhead (X = 9.5)
  const caissonCount = 4;
  for (let i = 0; i < caissonCount; i++) {
    const cx = 5.42 + i * 1.18;
    const caisson = new THREE.Mesh(
      new THREE.BoxGeometry(1.14, 1.24, 1.35),
      jettyConcreteMat,
    );
    caisson.position.set(cx, 0.03, -9.65); // top right at Y = 0.65
    seawall.add(caisson);

    // Damp tidal moss band near waterline
    const mossBand = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 1.37), tidalAlgaeMat),
    );
    mossBand.position.set(cx, -0.04, -9.65);
    seawall.add(mossBand);
  }

  // Seaward wave-deflector parapet wall along outer -Z edge
  const parapetWall = new THREE.Mesh(
    new THREE.BoxGeometry(4.75, 0.3, 0.24),
    jettyTrimMat,
  );
  parapetWall.position.set(7.18, 0.8, -10.21);
  seawall.add(parapetWall);

  // Shoreward concrete access steps up onto the jetty at X = 4.9
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.14 + s * 0.12, 0.9),
      jettyTrimMat,
    );
    step.position.set(4.92 + s * 0.18, 0.24 + s * 0.06, -9.55);
    seawall.add(step);
  }

  // Circular concrete lighthouse bastion head centered at (x: 9.5, z: -9.5), top Y = 0.65
  const pierHead = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 1.08, 1.3, 20),
    jettyConcreteMat,
  );
  pierHead.name = 'seawall-pier-head';
  pierHead.position.set(9.5, 0.0, -9.5);
  seawall.add(pierHead);

  const pierAlgaeRing = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(1.055, 1.065, 0.22, 20), tidalAlgaeMat),
  );
  pierAlgaeRing.position.set(9.5, -0.04, -9.5);
  seawall.add(pierAlgaeRing);

  // Cast-iron mooring bollards (係船柱) along jetty deck
  for (const bx of [6.1, 7.9]) {
    const bollardBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.05, 0.22),
      boltIronMat,
    );
    bollardBase.position.set(bx, 0.675, -9.15);
    const bollardPost = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.075, 0.2, 10),
      boltIronMat,
    );
    bollardPost.position.set(bx, 0.77, -9.15);
    const bollardCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.065, 0.045, 10),
      boltIronMat,
    );
    bollardCap.position.set(bx, 0.88, -9.15);
    seawall.add(bollardBase, bollardPost, bollardCap);
  }

  // ---------------------------------------------------------------------------
  // 6. Clusters of 4-Legged Concrete Tetrapods ('tetrapods')
  // ---------------------------------------------------------------------------
  const tetrapods = new THREE.Group();
  tetrapods.name = 'tetrapods';
  group.add(tetrapods);

  const tetrapodLightMat = createToonMaterial({ color: '#d6dce4' });
  const tetrapodMidMat = createToonMaterial({ color: '#bfc7d3' });

  const tetrapodPlacements: Array<{
    x: number;
    y: number;
    z: number;
    scale: number;
    rx: number;
    ry: number;
    rz: number;
    altMat?: boolean;
  }> = [
    // Cove-side breakwater cluster (X ∈ [7.2, 11.0], Z ∈ [-8.75, -6.4])
    { x: 7.35, y: 0.14, z: -8.45, scale: 0.92, rx: 0.08, ry: 0.4, rz: -0.1 },
    { x: 8.05, y: 0.08, z: -8.25, scale: 0.98, rx: -0.15, ry: 1.35, rz: 0.12, altMat: true },
    { x: 7.72, y: 0.1, z: -7.58, scale: 0.88, rx: 0.22, ry: 2.4, rz: -0.18 },
    { x: 8.68, y: 0.02, z: -7.95, scale: 1.02, rx: -0.08, ry: 0.85, rz: 0.2, altMat: true },
    { x: 8.38, y: -0.02, z: -7.12, scale: 0.9, rx: 0.18, ry: 3.1, rz: -0.08 },
    { x: 9.35, y: -0.04, z: -8.18, scale: 0.96, rx: -0.2, ry: 1.9, rz: -0.14 },
    { x: 10.15, y: -0.06, z: -8.28, scale: 0.94, rx: 0.12, ry: 2.75, rz: 0.16, altMat: true },
    { x: 10.75, y: -0.08, z: -8.65, scale: 0.92, rx: -0.14, ry: 0.55, rz: -0.12 },
    { x: 9.05, y: -0.08, z: -6.55, scale: 0.85, rx: 0.15, ry: 4.1, rz: 0.1, altMat: true },
    // Seaward outer toe cluster (strictly inside [-11.3, 11.3])
    { x: 8.65, y: -0.02, z: -10.85, scale: 0.92, rx: 0.1, ry: 1.1, rz: -0.15 },
    { x: 10.65, y: -0.05, z: -10.55, scale: 0.95, rx: -0.12, ry: 2.25, rz: 0.14, altMat: true },
  ];

  for (let i = 0; i < tetrapodPlacements.length; i++) {
    const p = tetrapodPlacements[i];
    const pod = createConcreteTetrapod(p.scale, p.altMat ? tetrapodMidMat : tetrapodLightMat);
    pod.name = `tetrapod-${i}`;
    pod.position.set(p.x, p.y, p.z);
    pod.rotation.set(p.rx, p.ry, p.rz);
    tetrapods.add(pod);
  }

  // ---------------------------------------------------------------------------
  // 7. Red-and-White Mini Lighthouse & 360° Sweeping Rotor ('mini-lighthouse')
  // ---------------------------------------------------------------------------
  const miniLighthouse = new THREE.Group();
  miniLighthouse.name = 'mini-lighthouse';
  miniLighthouse.position.set(9.5, 0.65, -9.5);
  group.add(miniLighthouse);

  const lhRedMat = createToonMaterial({ color: '#e35550' });
  const lhWhiteMat = createToonMaterial({ color: PALETTE.creamWhite });
  const lhStoneBaseMat = createToonMaterial({ color: '#d8dee8' });

  // Flared octagonal/cylindrical base pedestal (local Y: 0 .. 0.36)
  const lhPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.55, 0.36, 12),
    lhStoneBaseMat,
  );
  lhPedestal.position.y = 0.18;
  miniLighthouse.add(lhPedestal);

  // 4 alternating white and coral-red tapered cylindrical tower courses
  const bandSpecs: Array<{ yBottom: number; h: number; rBot: number; rTop: number; red: boolean }> = [
    { yBottom: 0.36, h: 0.52, rBot: 0.44, rTop: 0.405, red: false },
    { yBottom: 0.88, h: 0.52, rBot: 0.405, rTop: 0.37, red: true },
    { yBottom: 1.4, h: 0.5, rBot: 0.37, rTop: 0.335, red: false },
    { yBottom: 1.9, h: 0.48, rBot: 0.335, rTop: 0.305, red: true },
  ];

  for (const b of bandSpecs) {
    const course = new THREE.Mesh(
      new THREE.CylinderGeometry(b.rTop, b.rBot, b.h, 16),
      b.red ? lhRedMat : lhWhiteMat,
    );
    course.position.y = b.yBottom + b.h * 0.5;
    miniLighthouse.add(course);
  }

  // Tiny shore-facing maintenance door + two brass-rimmed porthole windows
  const lhDoor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.38, 0.2), boltIronMat);
  lhDoor.position.set(-0.41, 0.55, 0);
  miniLighthouse.add(lhDoor);

  const portholeGlowMat = createEmissiveLightboxMaterial({
    color: '#ffe0a3',
    intensity: 0.9,
  });
  portholeGlowMat.userData.noOutline = true;

  for (const py of [1.15, 1.66]) {
    const porthole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12),
      boltIronMat,
    );
    porthole.position.set(0, py, 0.36);
    porthole.rotation.set(Math.PI * 0.5, 0, 0);
    miniLighthouse.add(porthole);

    const portholePane = markNoOutline(
      new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.065, 12), portholeGlowMat),
    );
    portholePane.position.set(0, py, 0.36);
    portholePane.rotation.set(Math.PI * 0.5, 0, 0);
    miniLighthouse.add(portholePane);
  }

  // Gallery observation deck & delicate iron safety railing
  const galleryDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.33, 0.1, 16),
    lhWhiteMat,
  );
  galleryDeck.position.y = 2.43;
  miniLighthouse.add(galleryDeck);

  const railRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.016, 8, 20),
    boltIronMat,
  );
  railRing.rotation.x = Math.PI * 0.5;
  railRing.position.y = 2.63;
  miniLighthouse.add(railRing);

  for (let p = 0; p < 8; p++) {
    const ang = (p / 8) * Math.PI * 2;
    const stanchion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6),
      boltIronMat,
    );
    stanchion.position.set(Math.cos(ang) * 0.42, 2.55, Math.sin(ang) * 0.42);
    miniLighthouse.add(stanchion);
  }

  // Glazed lantern room (`noOutline = true`) + glowing Fresnel lamp core
  const lanternGlass = markNoOutline(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.265, 0.265, 0.42, 16),
      createGlassMaterial({ tint: '#fff5d8', opacity: 0.16 }),
    ),
  );
  lanternGlass.name = 'lighthouse-lantern-glass';
  lanternGlass.position.y = 2.69;
  miniLighthouse.add(lanternGlass);

  const fresnelLampMat = createEmissiveLightboxMaterial({
    color: '#ffe59e',
    intensity: 1.45,
  });
  fresnelLampMat.userData.noOutline = true;
  const fresnelCore = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 14), fresnelLampMat),
  );
  fresnelCore.name = 'lighthouse-fresnel-core';
  fresnelCore.position.y = 2.69;
  miniLighthouse.add(fresnelCore);

  // Red cupola dome roof + ventilator ball & finial
  const cupolaRoof = new THREE.Mesh(
    new THREE.SphereGeometry(0.295, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
    lhRedMat,
  );
  cupolaRoof.position.y = 2.89;
  miniLighthouse.add(cupolaRoof);

  const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), lhRedMat);
  finialBall.position.y = 3.21;
  const finialSpike = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.016, 0.18, 8),
    boltIronMat,
  );
  finialSpike.position.y = 3.31;
  miniLighthouse.add(finialBall, finialSpike);

  // Rotating `lighthouseRotor` carrying reflector hood + short warm-white beam cone (length <= 1.72)
  // At (x: 9.5, z: -9.5), max horizontal reach during full 360° rotation is ~1.75 => max X/Z = 11.25 < 12.0!
  const lighthouseRotor = markNoOutline(new THREE.Group());
  lighthouseRotor.name = 'lighthouse-rotor';
  lighthouseRotor.position.set(0, 2.69, 0);
  miniLighthouse.add(lighthouseRotor);

  const reflectorShield = markNoOutline(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.145, 0.24, 12, 1, true, Math.PI * 0.65, Math.PI * 1.1),
      boltIronMat,
    ),
  );
  lighthouseRotor.add(reflectorShield);

  const beamOuterGeom = new THREE.ConeGeometry(0.35, 1.72, 20, 1, true);
  beamOuterGeom.translate(0, -0.86, 0); // apex at rotor origin (0, 0, 0)
  beamOuterGeom.rotateZ(Math.PI * 0.5 - 0.1); // extends along +X, tilted gently downward

  const beamOuterMat = new THREE.MeshBasicMaterial({
    color: '#fff2be',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  beamOuterMat.userData.noOutline = true;

  const beamOuterCone = markNoOutline(new THREE.Mesh(beamOuterGeom, beamOuterMat));
  beamOuterCone.name = 'lighthouse-beam-cone';
  beamOuterCone.renderOrder = 4;
  lighthouseRotor.add(beamOuterCone);

  const beamInnerGeom = new THREE.ConeGeometry(0.16, 1.32, 16, 1, true);
  beamInnerGeom.translate(0, -0.66, 0);
  beamInnerGeom.rotateZ(Math.PI * 0.5 - 0.1);

  const beamInnerMat = new THREE.MeshBasicMaterial({
    color: '#fff9de',
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  beamInnerMat.userData.noOutline = true;

  const beamInnerCone = markNoOutline(new THREE.Mesh(beamInnerGeom, beamInnerMat));
  beamInnerCone.name = 'lighthouse-beam-core';
  beamInnerCone.renderOrder = 4;
  lighthouseRotor.add(beamInnerCone);

  // ---------------------------------------------------------------------------
  // 8. Red-White Lifebuoy ('lifebuoy') resting near wooden stairs / seawall
  // ---------------------------------------------------------------------------
  const lifebuoy = new THREE.Group();
  lifebuoy.name = 'lifebuoy';
  const buoyX = 5.78;
  const buoyZ = -3.15;
  const buoyGroundY = getSandElevation(buoyX, buoyZ);
  lifebuoy.position.set(buoyX, buoyGroundY, buoyZ);
  group.add(lifebuoy);

  // Short weathered driftwood stake supporting the lifebuoy
  const buoyStake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.062, 0.72, 8),
    darkTimberMat,
  );
  buoyStake.position.set(-0.12, 0.3, -0.04);
  buoyStake.rotation.z = 0.08;
  lifebuoy.add(buoyStake);

  const ringPivot = new THREE.Group();
  ringPivot.position.set(0.04, 0.33, 0.04);
  ringPivot.rotation.set(0.18, 0.42, -0.34);
  lifebuoy.add(ringPivot);

  const buoyMainTorus = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.082, 14, 28),
    lhWhiteMat,
  );
  ringPivot.add(buoyMainTorus);

  // 4 coral-red painted band sleeves at 90-degree intervals
  for (let q = 0; q < 4; q++) {
    const bandArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.086, 12, 10, Math.PI * 0.24),
      lhRedMat,
    );
    bandArc.rotation.z = q * (Math.PI * 0.5) - Math.PI * 0.12;
    ringPivot.add(bandArc);
  }

  // Hemp perimeter grab-rope ring
  const ropeMat = createToonMaterial({ color: '#d8be96' });
  const grabRope = new THREE.Mesh(
    new THREE.TorusGeometry(0.365, 0.014, 8, 24),
    ropeMat,
  );
  ringPivot.add(grabRope);

  // ---------------------------------------------------------------------------
  // 9. Folded Striped Beach Umbrella ('folded-beach-umbrella') on dry sand
  // ---------------------------------------------------------------------------
  const foldedUmbrella = new THREE.Group();
  foldedUmbrella.name = 'folded-beach-umbrella';
  const umbX = 6.08;
  const umbZ = 3.4;
  const umbGroundY = getSandElevation(umbX, umbZ);
  foldedUmbrella.position.set(umbX, umbGroundY, umbZ);
  group.add(foldedUmbrella);

  // Casual mint/cream beach mat underneath the folded umbrella
  const towelStripeTex = createStripedFabricTexture(PALETTE.mintGreen, PALETTE.creamWhite, 8);
  const towelMat = createToonMaterial({ color: '#ffffff', map: towelStripeTex });
  const beachTowel = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.018, 1.45), towelMat),
  );
  beachTowel.position.set(0, 0.015, 0);
  beachTowel.rotation.set(0.02, 0.28, -0.07);
  foldedUmbrella.add(beachTowel);

  // Furled striped umbrella assembly resting diagonally across the sand/towel
  const umbrellaRig = new THREE.Group();
  umbrellaRig.position.set(0.05, 0.11, 0.02);
  umbrellaRig.rotation.set(0.05, -0.45, Math.PI * 0.47);
  foldedUmbrella.add(umbrellaRig);

  const umbrellaShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.026, 1.72, 10),
    weatheredWoodMat,
  );
  umbrellaRig.add(umbrellaShaft);

  const canopyStripeTex = createStripedFabricTexture(PALETTE.peachOrange, PALETTE.creamWhite, 10);
  const furledCanopyMat = createToonMaterial({ color: '#ffffff', map: canopyStripeTex });
  const furledCanopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.145, 1.08, 12),
    furledCanopyMat,
  );
  furledCanopy.position.y = 0.22;
  umbrellaRig.add(furledCanopy);

  const tieStrap = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.016, 8, 14),
    lhWhiteMat,
  );
  tieStrap.rotation.x = Math.PI * 0.5;
  tieStrap.position.y = 0.12;
  umbrellaRig.add(tieStrap);

  const woodFinial = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.09, 8),
    darkTimberMat,
  );
  woodFinial.position.y = 0.88;
  umbrellaRig.add(woodFinial);

  // ---------------------------------------------------------------------------
  // 10. Pastel Seashells ('seashells') scattered along the sand
  // ---------------------------------------------------------------------------
  const seashells = new THREE.Group();
  seashells.name = 'seashells';
  group.add(seashells);

  const shellPalette = [
    createToonMaterial({ color: '#ff9aa2' }),
    createToonMaterial({ color: '#ffb594' }),
    createToonMaterial({ color: '#fff3dc' }),
    createToonMaterial({ color: '#f2c2d8' }),
  ];

  const shellCoords: Array<[number, number, number, boolean]> = [
    [5.62, -2.1, 0.4, false],
    [6.15, -1.25, 1.2, true],
    [6.45, 0.35, 2.1, false],
    [5.85, 1.65, 0.8, false],
    [6.72, 2.35, 2.8, true],
    [6.32, 4.65, 1.5, false],
    [5.92, 5.75, 0.2, true],
    [6.68, 6.85, 2.4, false],
    [7.05, -4.4, 1.9, false],
  ];

  const scallopGeom = new THREE.SphereGeometry(0.075, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  scallopGeom.scale(1.15, 0.45, 1.0);
  const conchGeom = new THREE.ConeGeometry(0.048, 0.13, 8);
  conchGeom.rotateZ(Math.PI * 0.45);

  for (let i = 0; i < shellCoords.length; i++) {
    const [sx, sz, yaw, isConch] = shellCoords[i];
    const sy = getSandElevation(sx, sz) + 0.016;
    const mat = shellPalette[i % shellPalette.length];
    const shell = new THREE.Mesh(isConch ? conchGeom : scallopGeom, mat);
    shell.name = `seashell-${i}`;
    shell.userData.outlineThickness = 0.008;
    shell.position.set(sx, sy, sz);
    shell.rotation.y = yaw;
    seashells.add(shell);
  }

  // ---------------------------------------------------------------------------
  // 11. Translucent Mint & Sea-Salt Sea-Glass Gems ('sea-glass', noOutline = true)
  // ---------------------------------------------------------------------------
  const seaGlass = markNoOutline(new THREE.Group());
  seaGlass.name = 'sea-glass';
  group.add(seaGlass);

  const seaGlassMats = [
    createGlassMaterial({ tint: PALETTE.mintGreen, opacity: 0.18 }),
    createGlassMaterial({ tint: PALETTE.seaSaltLight, opacity: 0.18 }),
    createGlassMaterial({ tint: PALETTE.softNeonCyan, opacity: 0.18 }),
  ];

  // Soft frosted translucent inner gem tint (still transparent + noOutline)
  const frostedCoreMats = [
    new THREE.MeshStandardMaterial({
      color: PALETTE.mintGreen,
      emissive: new THREE.Color(PALETTE.mintGreen),
      emissiveIntensity: 0.18,
      roughness: 0.22,
      transparent: true,
      opacity: 0.62,
    }),
    new THREE.MeshStandardMaterial({
      color: PALETTE.seaSaltLight,
      emissive: new THREE.Color(PALETTE.seaSaltLight),
      emissiveIntensity: 0.16,
      roughness: 0.22,
      transparent: true,
      opacity: 0.62,
    }),
    new THREE.MeshStandardMaterial({
      color: PALETTE.softNeonCyan,
      emissive: new THREE.Color(PALETTE.softNeonCyan),
      emissiveIntensity: 0.18,
      roughness: 0.22,
      transparent: true,
      opacity: 0.62,
    }),
  ];
  for (const m of frostedCoreMats) {
    m.userData.noOutline = true;
  }

  const gemGeom = new THREE.IcosahedronGeometry(0.062, 0);
  gemGeom.scale(1.25, 0.42, 0.95);

  const seaGlassCoords: Array<[number, number, number]> = [
    [6.42, -1.75, 0.3],
    [6.85, -0.45, 1.4],
    [6.58, 1.05, 2.2],
    [7.02, 2.95, 0.9],
    [6.64, 4.15, 1.8],
    [7.12, 5.45, 2.7],
    [6.78, 6.95, 0.5],
    [6.95, -5.15, 1.1],
  ];

  for (let i = 0; i < seaGlassCoords.length; i++) {
    const [gx, gz, gyaw] = seaGlassCoords[i];
    const gy = getSandElevation(gx, gz) + 0.018;

    const pebbleCore = markNoOutline(
      new THREE.Mesh(gemGeom, frostedCoreMats[i % frostedCoreMats.length]),
    );
    pebbleCore.name = `sea-glass-gem-${i}`;
    pebbleCore.position.set(gx, gy, gz);
    pebbleCore.rotation.y = gyaw;

    const pebbleGlaze = markNoOutline(
      new THREE.Mesh(gemGeom, seaGlassMats[i % seaGlassMats.length]),
    );
    pebbleGlaze.scale.setScalar(1.06);
    pebbleCore.add(pebbleGlaze);

    seaGlass.add(pebbleCore);
  }

  // Apply cel-shaded inverted-hull outlines to opaque solid seaside structures & props
  applyOutlinesToHierarchy(group, 0.018);

  return {
    group,
    waterSurfaceMaterial,
    wetSandMaterial,
    foamStripMesh,
    lighthouseRotor,
  };
}
