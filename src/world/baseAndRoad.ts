import * as THREE from 'three';
import { PALETTE } from '../config/paletteAndBounds';
import {
  applyOutlinesToHierarchy,
  createToonMaterial,
  createWetPuddleMaterial,
} from '../rendering/toonMaterials';

export interface BaseAndRoadResult {
  group: THREE.Group; // name: 'base-and-road'
  puddleMaterials: THREE.ShaderMaterial[];
  crosswalkMaterial: THREE.ShaderMaterial | THREE.MeshStandardMaterial;
  trafficLightBulbs: {
    red: THREE.MeshStandardMaterial;
    yellow: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  };
}

function markNoOutline<T extends THREE.Object3D>(obj: T): T {
  obj.userData.noOutline = true;
  return obj;
}

/**
 * Builds a flat organic puddle mesh geometry on XZ (Y = 0) with normalized [0, 1] UVs
 * centered at (0.5, 0.5) so concentric droplet ripples originate cleanly from the center.
 */
function createOrganicPuddleGeometry(
  radiusX: number,
  radiusZ: number,
  seed: number,
  segments = 40,
): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  const maxMod = 1.28;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const mod =
      1.0 +
      0.14 * Math.sin(theta * 2 + seed) +
      0.09 * Math.cos(theta * 3 - seed * 1.35) +
      0.05 * Math.sin(theta * 5 + seed * 2.1);

    const x = Math.cos(theta) * radiusX * mod;
    const z = Math.sin(theta) * radiusZ * mod;
    positions.push(x, 0, z);
    normals.push(0, 1, 0);

    const u = 0.5 + 0.48 * (x / (radiusX * maxMod));
    const v = 0.5 + 0.48 * (z / (radiusZ * maxMod));
    uvs.push(u, v);

    if (i < segments) {
      indices.push(0, i + 2, i + 1);
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
 * Builds a single arched Japanese pedestrian guardrail section (ガードパイプ) along local X.
 */
function createGuardrailSection(
  length: number,
  pipeMat: THREE.Material,
  collarMat: THREE.Material,
): THREE.Group {
  const unit = new THREE.Group();
  const height = 0.72;
  const pipeRadius = 0.028;
  const cornerRadius = 0.14;
  const halfSpan = Math.max(0.18, length * 0.5 - cornerRadius);

  // Left and right vertical legs
  const legHeight = height - cornerRadius;
  const legGeom = new THREE.CylinderGeometry(pipeRadius, pipeRadius, legHeight, 10);
  const leftLeg = new THREE.Mesh(legGeom, pipeMat);
  leftLeg.position.set(-halfSpan - cornerRadius, legHeight * 0.5, 0);
  leftLeg.castShadow = true;

  const rightLeg = new THREE.Mesh(legGeom, pipeMat);
  rightLeg.position.set(halfSpan + cornerRadius, legHeight * 0.5, 0);
  rightLeg.castShadow = true;
  unit.add(leftLeg, rightLeg);

  // Base flange collars
  const flangeGeom = new THREE.CylinderGeometry(0.052, 0.058, 0.035, 10);
  const leftFlange = new THREE.Mesh(flangeGeom, pipeMat);
  leftFlange.position.set(-halfSpan - cornerRadius, 0.018, 0);
  const rightFlange = new THREE.Mesh(flangeGeom, pipeMat);
  rightFlange.position.set(halfSpan + cornerRadius, 0.018, 0);
  unit.add(leftFlange, rightFlange);

  // Curved top corners (quarter torus)
  const elbowGeom = new THREE.TorusGeometry(cornerRadius, pipeRadius, 8, 10, Math.PI * 0.5);
  const leftElbow = new THREE.Mesh(elbowGeom, pipeMat);
  leftElbow.position.set(-halfSpan, height - cornerRadius, 0);
  leftElbow.rotation.z = Math.PI * 0.5;
  leftElbow.castShadow = true;

  const rightElbow = new THREE.Mesh(elbowGeom, pipeMat);
  rightElbow.position.set(halfSpan, height - cornerRadius, 0);
  rightElbow.castShadow = true;
  unit.add(leftElbow, rightElbow);

  // Top horizontal rail + two inner horizontal rails
  const topBarGeom = new THREE.CylinderGeometry(pipeRadius, pipeRadius, halfSpan * 2, 10);
  topBarGeom.rotateZ(Math.PI * 0.5);
  const topBar = new THREE.Mesh(topBarGeom, pipeMat);
  topBar.position.set(0, height, 0);
  topBar.castShadow = true;
  unit.add(topBar);

  const innerSpan = (halfSpan + cornerRadius) * 2;
  const subBarGeom = new THREE.CylinderGeometry(pipeRadius * 0.72, pipeRadius * 0.72, innerSpan, 8);
  subBarGeom.rotateZ(Math.PI * 0.5);
  for (const yBar of [0.28, 0.48]) {
    const bar = new THREE.Mesh(subBarGeom, pipeMat);
    bar.position.set(0, yBar, 0);
    bar.castShadow = true;
    unit.add(bar);
  }

  // Safety orange reflector bands near upper corners
  const collarGeom = new THREE.CylinderGeometry(pipeRadius * 1.18, pipeRadius * 1.18, 0.065, 10);
  collarGeom.rotateZ(Math.PI * 0.5);
  for (const sign of [-1, 1]) {
    const collar = new THREE.Mesh(collarGeom, collarMat);
    collar.position.set(sign * Math.max(0.08, halfSpan - 0.08), height, 0);
    unit.add(collar);
  }

  return unit;
}

/**
 * Builds a metallic slotted stormwater grate (グレーチング) centered at (0, 0, 0).
 */
function createStormwaterGrate(
  widthX: number,
  depthZ: number,
  frameMat: THREE.Material,
  recessMat: THREE.Material,
): THREE.Group {
  const grate = new THREE.Group();
  markNoOutline(grate);

  const basin = new THREE.Mesh(new THREE.BoxGeometry(widthX, 0.016, depthZ), recessMat);
  basin.position.y = 0.008;
  grate.add(basin);

  const rimThickness = 0.03;
  const longBarGeom = new THREE.BoxGeometry(widthX, 0.024, rimThickness);
  const frontRim = new THREE.Mesh(longBarGeom, frameMat);
  frontRim.position.set(0, 0.014, depthZ * 0.5 - rimThickness * 0.5);
  const backRim = new THREE.Mesh(longBarGeom, frameMat);
  backRim.position.set(0, 0.014, -depthZ * 0.5 + rimThickness * 0.5);
  grate.add(frontRim, backRim);

  const slotCount = 6;
  const slatGeom = new THREE.BoxGeometry(0.022, 0.022, depthZ - rimThickness * 1.5);
  for (let i = 0; i < slotCount; i++) {
    const t = (i + 0.5) / slotCount - 0.5;
    const slat = new THREE.Mesh(slatGeom, frameMat);
    slat.position.set(t * (widthX - rimThickness * 2), 0.014, 0);
    grate.add(slat);
  }

  return grate;
}

/**
 * Builds a 3-light horizontal Japanese traffic signal head facing +Z in its local space.
 */
function createTrafficSignalHead(
  housingMat: THREE.Material,
  visorMat: THREE.Material,
  bulbs: {
    red: THREE.MeshStandardMaterial;
    yellow: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  },
): THREE.Group {
  const head = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.32, 0.24), housingMat);
  body.castShadow = true;
  head.add(body);

  // Rounded end-caps for authentic Japanese flat-capsule signal housing
  const capGeom = new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12);
  capGeom.rotateX(Math.PI * 0.5);
  const leftCap = new THREE.Mesh(capGeom, housingMat);
  leftCap.position.x = -0.48;
  const rightCap = new THREE.Mesh(capGeom, housingMat);
  rightCap.position.x = 0.48;
  head.add(leftCap, rightCap);

  // Green (left), Yellow (center), Red (right) per Japanese horizontal traffic light standard
  const specs: Array<{ x: number; mat: THREE.MeshStandardMaterial; name: string }> = [
    { x: -0.31, mat: bulbs.green, name: 'traffic-bulb-green' },
    { x: 0.0, mat: bulbs.yellow, name: 'traffic-bulb-yellow' },
    { x: 0.31, mat: bulbs.red, name: 'traffic-bulb-red' },
  ];

  const lensGeom = new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  lensGeom.rotateX(Math.PI * 0.5);

  const visorGeom = new THREE.CylinderGeometry(
    0.118,
    0.118,
    0.14,
    12,
    1,
    true,
    -Math.PI * 0.15,
    Math.PI * 1.3,
  );
  visorGeom.rotateX(Math.PI * 0.5);
  visorGeom.rotateZ(Math.PI * 0.5);

  for (const spec of specs) {
    const lens = markNoOutline(new THREE.Mesh(lensGeom, spec.mat));
    lens.name = spec.name;
    lens.position.set(spec.x, -0.01, 0.11);
    head.add(lens);

    const visor = new THREE.Mesh(visorGeom, visorMat);
    visor.position.set(spec.x, 0.02, 0.175);
    head.add(visor);
  }

  return head;
}

export function buildBaseAndRoad(): BaseAndRoadResult {
  const group = new THREE.Group();
  group.name = 'base-and-road';

  // ---------------------------------------------------------------------------
  // 1. Collector Square Display Tray, Cross-Section Strata & Sidewalk/Alley Plinths
  // ---------------------------------------------------------------------------
  const baseTray = new THREE.Group();
  baseTray.name = 'base-tray';
  group.add(baseTray);

  const woodMat = createToonMaterial({ color: PALETTE.collectorBaseWood });
  const trimMat = createToonMaterial({ color: PALETTE.collectorBaseTrim });
  const shadowFootMat = createToonMaterial({ color: '#1b1d28' });
  const brassInlayMat = new THREE.MeshStandardMaterial({
    color: '#c4a478',
    roughness: 0.32,
    metalness: 0.72,
  });

  // Recessed shadow foot (-1.45 .. -1.32)
  const recessedFoot = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(23.48, 0.13, 23.48), shadowFootMat),
  );
  recessedFoot.name = 'collector-recessed-foot';
  recessedFoot.position.set(0, -1.385, 0);
  baseTray.add(recessedFoot);

  // Main collector tray wood/resin plinth (-1.32 .. -1.02), X,Z ∈ [-11.94, 11.94]
  const trayBody = new THREE.Mesh(new THREE.BoxGeometry(23.88, 0.3, 23.88), woodMat);
  trayBody.name = 'collector-tray-body';
  trayBody.userData.outlineThickness = 0.015;
  trayBody.position.set(0, -1.17, 0);
  trayBody.receiveShadow = true;
  baseTray.add(trayBody);

  // Subtle brass collector inlay ribbon around all 4 sides (strictly inside [-11.95, 11.95])
  const brassBand = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(23.9, 0.024, 23.9), brassInlayMat),
  );
  brassBand.name = 'collector-brass-inlay';
  brassBand.position.set(0, -1.17, 0);
  baseTray.add(brassBand);

  // Upper slate bezel collar (-1.02 .. -0.92), X,Z ∈ [-11.91, 11.91]
  const trayCollar = new THREE.Mesh(new THREE.BoxGeometry(23.82, 0.1, 23.82), trimMat);
  trayCollar.name = 'collector-tray-collar';
  trayCollar.userData.outlineThickness = 0.014;
  trayCollar.position.set(0, -0.97, 0);
  baseTray.add(trayCollar);

  // Continuous deep sandstone geological foundation (-0.92 .. -0.84) under both town and sea
  const deepSandstoneMat = createToonMaterial({ color: '#8a7866' });
  const deepFoundation = new THREE.Mesh(
    new THREE.BoxGeometry(23.8, 0.08, 23.8),
    deepSandstoneMat,
  );
  deepFoundation.name = 'subsurface-sandstone-bed';
  deepFoundation.userData.outlineThickness = 0.012;
  deepFoundation.position.set(0, -0.88, 0);
  baseTray.add(deepFoundation);

  // Town-side stratified geological cross-section (X ∈ [-11.90, 4.22], Z ∈ [-11.90, 11.90])
  const townWidth = 16.12; // -11.90 to +4.22
  const townCenterX = -3.84;
  const fullSpanZ = 23.8;

  const earthLayerMat = createToonMaterial({ color: '#7a6b5d' });
  const gravelSubbaseMat = createToonMaterial({ color: '#6b7485' });
  const concreteSubslabMat = createToonMaterial({ color: '#9aa2b2' });

  const earthStratum = new THREE.Mesh(
    new THREE.BoxGeometry(townWidth, 0.52, fullSpanZ),
    earthLayerMat,
  );
  earthStratum.name = 'stratum-earth';
  earthStratum.userData.outlineThickness = 0.012;
  earthStratum.position.set(townCenterX, -0.58, 0);
  baseTray.add(earthStratum);

  const gravelStratum = new THREE.Mesh(
    new THREE.BoxGeometry(townWidth, 0.46, fullSpanZ),
    gravelSubbaseMat,
  );
  gravelStratum.name = 'stratum-gravel';
  gravelStratum.userData.outlineThickness = 0.012;
  gravelStratum.position.set(townCenterX, -0.09, 0);
  baseTray.add(gravelStratum);

  const concreteStratum = new THREE.Mesh(
    new THREE.BoxGeometry(townWidth, 0.172, fullSpanZ),
    concreteSubslabMat,
  );
  concreteStratum.name = 'stratum-concrete-bed';
  concreteStratum.userData.outlineThickness = 0.012;
  concreteStratum.position.set(townCenterX, 0.226, 0);
  concreteStratum.receiveShadow = true;
  baseTray.add(concreteStratum);

  // Miniature buried utility drain pipe cross-sections exposed on +Z and -X cut walls
  const pipeOuterMat = createToonMaterial({ color: '#b87a5e' });
  const pipeBoreMat = createToonMaterial({ color: '#1b2030' });
  const pipeRingGeom = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14);
  const pipeBoreGeom = new THREE.CylinderGeometry(0.075, 0.075, 0.034, 14);

  const frontPipeOuter = markNoOutline(new THREE.Mesh(pipeRingGeom, pipeOuterMat));
  frontPipeOuter.rotation.x = Math.PI * 0.5;
  frontPipeOuter.position.set(-5.2, -0.16, 11.895);
  const frontPipeBore = markNoOutline(new THREE.Mesh(pipeBoreGeom, pipeBoreMat));
  frontPipeBore.rotation.x = Math.PI * 0.5;
  frontPipeBore.position.set(-5.2, -0.16, 11.896);
  baseTray.add(frontPipeOuter, frontPipeBore);

  const leftPipeOuter = markNoOutline(new THREE.Mesh(pipeRingGeom, pipeOuterMat));
  leftPipeOuter.rotation.z = Math.PI * 0.5;
  leftPipeOuter.position.set(-11.895, -0.22, 3.4);
  const leftPipeBore = markNoOutline(new THREE.Mesh(pipeBoreGeom, pipeBoreMat));
  leftPipeBore.rotation.z = Math.PI * 0.5;
  leftPipeBore.position.set(-11.896, -0.22, 3.4);
  baseTray.add(leftPipeOuter, leftPipeBore);

  // Raised Konbini sidewalk plinth: X ∈ [-7.58, 2.60], Z ∈ [-7.98, 0.40], top Y = 0.52
  const sidewalkMat = createToonMaterial({ color: '#e4ded3' });
  const sidewalkTileSeamMat = createToonMaterial({ color: '#cfc8bc' });

  const konbiniPlinth = new THREE.Mesh(new THREE.BoxGeometry(10.18, 0.208, 8.38), sidewalkMat);
  konbiniPlinth.name = 'konbini-sidewalk-plinth';
  konbiniPlinth.userData.outlineThickness = 0.014;
  konbiniPlinth.position.set(-2.49, 0.416, -3.79);
  konbiniPlinth.receiveShadow = true;
  baseTray.add(konbiniPlinth);

  // Subtle front sidewalk paving joint strips
  for (let x = -7.0; x <= 2.2; x += 1.15) {
    const seam = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 1.05), sidewalkTileSeamMat),
    );
    seam.position.set(x, 0.521, -0.12);
    baseTray.add(seam);
  }

  // Tactile yellow warning pavers (点字ブロック) facing the crosswalk
  const tactileMat = createToonMaterial({ color: '#efc448' });
  const tactileStrip = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.008, 0.28), tactileMat),
  );
  tactileStrip.name = 'tactile-paving-strip';
  tactileStrip.position.set(-3.6, 0.523, 0.2);
  baseTray.add(tactileStrip);

  // Stepped seaside alley walkway:
  // Strip 1 (X ∈ [2.60, 3.25], Z ∈ [-7.98, 0.40]) at Y = 0.50 -> supports AC drip puddle at (2.85, -3.6)
  // Strip 2 (X ∈ [3.25, 4.12], Z ∈ [-7.98, 0.40]) at Y = 0.48 -> supports pole (3.4), tree (3.7), noticeboard (3.9)
  // Rear step (Z ∈ [-8.28, -7.98]) steps cleanly down to the flush Y = 0.362 rear service lane
  const alleyConcreteMat = createToonMaterial({ color: '#d7d2c8' });
  const alleyStoneMat = createToonMaterial({ color: '#c4bdb0' });

  const alleyUpperStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.188, 8.38),
    alleyConcreteMat,
  );
  alleyUpperStrip.name = 'alley-upper-strip';
  alleyUpperStrip.userData.outlineThickness = 0.012;
  alleyUpperStrip.position.set(2.925, 0.406, -3.79);
  alleyUpperStrip.receiveShadow = true;
  baseTray.add(alleyUpperStrip);

  const alleyMainWalk = new THREE.Mesh(new THREE.BoxGeometry(0.87, 0.168, 8.38), alleyStoneMat);
  alleyMainWalk.name = 'alley-main-walkway';
  alleyMainWalk.userData.outlineThickness = 0.012;
  alleyMainWalk.position.set(3.685, 0.396, -3.79);
  alleyMainWalk.receiveShadow = true;
  baseTray.add(alleyMainWalk);

  // Rear transition step from alley walkway (Y = 0.48) down to rear service lane (Y = 0.362)
  const alleyRearStep = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.108, 0.3),
    alleyConcreteMat,
  );
  alleyRearStep.name = 'alley-rear-step';
  alleyRearStep.userData.outlineThickness = 0.012;
  alleyRearStep.position.set(3.36, 0.366, -8.13);
  alleyRearStep.receiveShadow = true;
  baseTray.add(alleyRearStep);

  // Backroom staff entrance step behind konbini back door (X = -5.2, Z = -8.14)
  const backDoorStep = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.095, 0.34),
    alleyConcreteMat,
  );
  backDoorStep.name = 'konbini-back-door-step';
  backDoorStep.userData.outlineThickness = 0.012;
  backDoorStep.position.set(-5.2, 0.41, -8.15);
  backDoorStep.receiveShadow = true;
  baseTray.add(backDoorStep);

  // Decorative warm flagstone pavers leading along the alley toward the beach stairs
  const flagstoneMat = createToonMaterial({ color: '#e2d8c7' });
  const flagstoneCoords: Array<[number, number, number, number]> = [
    [3.52, -0.15, 0.38, 0.32],
    [3.68, -0.58, 0.42, 0.34],
    [3.84, -0.95, 0.38, 0.32],
    [3.58, -1.45, 0.36, 0.3],
    [3.65, -2.85, 0.4, 0.34],
    [3.55, -4.4, 0.38, 0.32],
  ];
  for (const [fx, fz, fw, fd] of flagstoneCoords) {
    const stone = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(fw, 0.01, fd), flagstoneMat),
    );
    stone.position.set(fx, 0.483, fz);
    stone.receiveShadow = true;
    baseTray.add(stone);
  }

  // Stepped stone landing leading to wooden beach stairs (X ∈ [4.10, 4.50], Z ∈ [-1.80, 0.25])
  const alleyMidStep = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 2.05), alleyConcreteMat);
  alleyMidStep.userData.outlineThickness = 0.012;
  alleyMidStep.position.set(4.18, 0.34, -0.78);
  alleyMidStep.receiveShadow = true;

  const alleyStairLanding = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.14, 1.9),
    alleyStoneMat,
  );
  alleyStairLanding.name = 'alley-stair-landing';
  alleyStairLanding.userData.outlineThickness = 0.012;
  alleyStairLanding.position.set(4.36, 0.25, -0.8); // top surface right at Y = 0.32!
  alleyStairLanding.receiveShadow = true;
  baseTray.add(alleyMidStep, alleyStairLanding);

  // Low coastal stone border separating town road/apron from dry sand beach along X = 4.19
  const coastalCurbMat = createToonMaterial({ color: '#b8b4aa' });
  const southSeaCurb = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 11.55),
    coastalCurbMat,
  );
  southSeaCurb.userData.outlineThickness = 0.012;
  southSeaCurb.position.set(4.19, 0.34, 6.1);
  const northSeaCurb = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.14, 10.0),
    coastalCurbMat,
  );
  northSeaCurb.userData.outlineThickness = 0.012;
  northSeaCurb.position.set(4.19, 0.35, -6.85);
  baseTray.add(southSeaCurb, northSeaCurb);

  // ---------------------------------------------------------------------------
  // 2. L-Corner Cool-Toned Asphalt Road
  // ---------------------------------------------------------------------------
  const asphaltRoad = new THREE.Group();
  asphaltRoad.name = 'asphalt-road';
  group.add(asphaltRoad);

  const asphaltMat = createToonMaterial({ color: PALETTE.asphaltCool });
  const dampAsphaltMat = createToonMaterial({ color: PALETTE.wetAsphalt });
  const roadLineMat = createToonMaterial({ color: '#e6edf5' });
  const ironCoverMat = new THREE.MeshStandardMaterial({
    color: '#465066',
    roughness: 0.45,
    metalness: 0.65,
  });

  // Front road strip: X ∈ [-11.90, 4.18], Z ∈ [0.40, 11.90], top at Y = 0.362
  const frontRoad = new THREE.Mesh(new THREE.BoxGeometry(16.08, 0.05, 11.5), asphaltMat);
  frontRoad.name = 'front-asphalt-strip';
  frontRoad.userData.outlineThickness = 0.012;
  frontRoad.position.set(-3.86, 0.337, 6.15);
  frontRoad.receiveShadow = true;
  asphaltRoad.add(frontRoad);

  // Left road strip: X ∈ [-11.90, -7.58], Z ∈ [-11.90, 0.40], top at Y = 0.362
  const leftRoad = new THREE.Mesh(new THREE.BoxGeometry(4.32, 0.05, 12.3), asphaltMat);
  leftRoad.name = 'left-asphalt-strip';
  leftRoad.userData.outlineThickness = 0.012;
  leftRoad.position.set(-9.74, 0.337, -5.75);
  leftRoad.receiveShadow = true;
  asphaltRoad.add(leftRoad);

  // Rear service lane behind Konbini: X ∈ [-7.65, 4.18], Z ∈ [-11.90, -7.75], top at Y = 0.362
  // Completely flush with leftRoad and seamlessly joining the right alley for 360° orbit views
  const rearServiceLane = new THREE.Mesh(
    new THREE.BoxGeometry(11.83, 0.05, 4.15),
    asphaltMat,
  );
  rearServiceLane.name = 'rear-service-lane';
  rearServiceLane.userData.outlineThickness = 0.012;
  rearServiceLane.position.set(-1.735, 0.337, -9.825);
  rearServiceLane.receiveShadow = true;
  asphaltRoad.add(rearServiceLane);

  // Subtle damp dusk tire-wear bands along the L-corner roadway & rear service lane
  const frontWearBand = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.003, 2.4), dampAsphaltMat),
  );
  frontWearBand.position.set(-3.8, 0.363, 6.2);
  const leftWearBand = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.003, 9.6), dampAsphaltMat),
  );
  leftWearBand.position.set(-9.6, 0.363, -5.8);
  const rearWearBand = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.003, 1.35), dampAsphaltMat),
  );
  rearWearBand.position.set(-2.2, 0.363, -9.85);
  asphaltRoad.add(frontWearBand, leftWearBand, rearWearBand);

  // Crisp white outer road shoulder lines (外側線) & dashed center lane markings
  const frontOuterLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.004, 0.11), roadLineMat),
  );
  frontOuterLine.position.set(-3.9, 0.364, 11.25);

  const leftOuterLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 22.67), roadLineMat),
  );
  leftOuterLine.position.set(-11.42, 0.364, -0.085);

  const rearOuterLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(15.35, 0.004, 0.11), roadLineMat),
  );
  rearOuterLine.position.set(-3.75, 0.364, -11.42);
  asphaltRoad.add(frontOuterLine, leftOuterLine, rearOuterLine);

  for (const dashX of [-0.1, 1.45, 3.0]) {
    const dash = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.004, 0.12), roadLineMat),
    );
    dash.position.set(dashX, 0.365, 6.15);
    asphaltRoad.add(dash);
  }

  // Detailed circular Japanese cast-iron manhole cover on front street
  const manholeOuter = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.008, 20), ironCoverMat),
  );
  manholeOuter.name = 'street-manhole-cover';
  manholeOuter.position.set(-5.4, 0.365, 7.6);
  const manholeInner = markNoOutline(
    new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.26, 20),
      createToonMaterial({ color: '#2b3244', side: THREE.DoubleSide }),
    ),
  );
  manholeInner.rotation.x = -Math.PI * 0.5;
  manholeInner.position.set(-5.4, 0.37, 7.6);
  asphaltRoad.add(manholeOuter, manholeInner);

  // ---------------------------------------------------------------------------
  // 3. Damp Reflective Zebra Crosswalk
  // ---------------------------------------------------------------------------
  const zebraCrosswalk = new THREE.Group();
  zebraCrosswalk.name = 'zebra-crosswalk';
  group.add(zebraCrosswalk);

  const crosswalkMaterial = new THREE.MeshStandardMaterial({
    color: '#eef3f9',
    roughness: 0.22,
    metalness: 0.08,
    emissive: new THREE.Color(PALETTE.peachOrange),
    emissiveIntensity: 0.09,
  });

  // 6 zebra stripes spanning X ∈ [-6.0, -1.2], Z ∈ [1.55, 4.25]
  const stripeCount = 6;
  for (let i = 0; i < stripeCount; i++) {
    const zPos = 1.62 + i * 0.51;
    const stripe = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.006, 0.28), crosswalkMaterial),
    );
    stripe.name = `zebra-stripe-${i}`;
    stripe.position.set(-3.6, 0.366, zPos);
    stripe.receiveShadow = true;
    zebraCrosswalk.add(stripe);
  }

  // Vehicle stop line (停止線) before crosswalk
  const stopLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.006, 3.8), crosswalkMaterial),
  );
  stopLine.name = 'crosswalk-stop-line';
  stopLine.position.set(-6.55, 0.366, 3.15);
  stopLine.receiveShadow = true;
  zebraCrosswalk.add(stopLine);

  // ---------------------------------------------------------------------------
  // 4. Kei Truck Parking Bay Markings & Concrete Wheel Stops
  // ---------------------------------------------------------------------------
  const parkingBay = new THREE.Group();
  parkingBay.name = 'parking-bay';
  group.add(parkingBay);

  const bayLineMat = createToonMaterial({ color: '#f2f6fa' });
  const wheelStopMat = createToonMaterial({ color: '#cfd4dc' });
  const wheelReflectorMat = createToonMaterial({
    color: '#ffb84d',
    emissive: '#ff9e44',
    emissiveIntensity: 0.25,
  });

  // White parking bay lines: X ∈ [-10.8, -8.0], Z ∈ [-5.6, -1.2], Y = 0.365
  const bayLeftLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.005, 4.35), bayLineMat),
  );
  bayLeftLine.position.set(-10.75, 0.365, -3.4);

  const bayRightLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.005, 4.35), bayLineMat),
  );
  bayRightLine.position.set(-8.05, 0.365, -3.4);

  const bayBackLine = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.005, 0.1), bayLineMat),
  );
  bayBackLine.position.set(-9.4, 0.365, -5.55);

  const bayFrontLeftTick = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.005, 0.1), bayLineMat),
  );
  bayFrontLeftTick.position.set(-10.52, 0.365, -1.25);

  const bayFrontRightTick = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.005, 0.1), bayLineMat),
  );
  bayFrontRightTick.position.set(-8.28, 0.365, -1.25);

  parkingBay.add(bayLeftLine, bayRightLine, bayBackLine, bayFrontLeftTick, bayFrontRightTick);

  // Two precast concrete wheel-stop chocks (車止めブロック) at back of stall
  for (const chockX of [-9.92, -8.88]) {
    const chock = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.095, 0.16), wheelStopMat);
    chock.position.set(chockX, 0.408, -5.08);
    chock.castShadow = true;
    chock.receiveShadow = true;
    parkingBay.add(chock);

    const sticker = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.01), wheelReflectorMat),
    );
    sticker.position.set(chockX, 0.415, -4.995);
    parkingBay.add(sticker);
  }

  // ---------------------------------------------------------------------------
  // 5. Concrete Curbs, Recessed Drainage Gutter & Metallic Slotted Grates
  // ---------------------------------------------------------------------------
  const drainageGutter = new THREE.Group();
  drainageGutter.name = 'drainage-gutter';
  group.add(drainageGutter);

  const gutterChannelMat = createToonMaterial({ color: '#78808f' });
  const curbStoneMat = createToonMaterial({ color: '#d0cbc0' });
  const curbDarkJointMat = createToonMaterial({ color: '#99958c' });
  const grateIronMat = new THREE.MeshStandardMaterial({
    color: '#394152',
    roughness: 0.38,
    metalness: 0.78,
  });
  const grateRecessMat = createToonMaterial({ color: '#171b26' });

  // Gutter apron strips along front curb (Z = 0.50) and left curb (X = -7.48)
  const frontGutterApron = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(11.75, 0.005, 0.32), gutterChannelMat),
  );
  frontGutterApron.position.set(-1.72, 0.363, 0.54);

  const leftGutterApron = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.005, 8.65), gutterChannelMat),
  );
  leftGutterApron.position.set(-7.44, 0.363, -3.75);

  const rearGutterApron = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(10.35, 0.005, 0.28), gutterChannelMat),
  );
  rearGutterApron.position.set(-2.42, 0.363, -8.12);
  drainageGutter.add(frontGutterApron, leftGutterApron, rearGutterApron);

  // Segmented precast Japanese curb blocks along front edge Z = 0.38 (with dropped ramp at crosswalk/door)
  for (let i = 0; i < 11; i++) {
    const cx = -7.05 + i * 1.05;
    const isDroppedRamp = cx >= -4.5 && cx <= -1.6;
    const curbH = isDroppedRamp ? 0.075 : 0.168;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(1.01, curbH, 0.14), curbStoneMat);
    curb.position.set(cx, 0.36 + curbH * 0.5, 0.38);
    curb.castShadow = true;
    curb.receiveShadow = true;
    drainageGutter.add(curb);

    const joint = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.025, curbH * 0.96, 0.142), curbDarkJointMat),
    );
    joint.position.set(cx + 0.52, 0.36 + curbH * 0.5, 0.38);
    drainageGutter.add(joint);
  }

  // Segmented curb blocks along left sidewalk edge X = -7.54
  for (let j = 0; j < 8; j++) {
    const cz = -7.45 + j * 1.05;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.168, 1.01), curbStoneMat);
    curb.position.set(-7.54, 0.444, cz);
    curb.castShadow = true;
    curb.receiveShadow = true;
    drainageGutter.add(curb);
  }

  // Segmented curb blocks along rear plinth edge Z = -8.02 separating plinth from rear service lane
  for (let k = 0; k < 10; k++) {
    const rx = -7.05 + k * 1.05;
    const isBackDoorStep = Math.abs(rx - -5.2) < 0.65;
    const curbH = isBackDoorStep ? 0.08 : 0.168;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(1.01, curbH, 0.14), curbStoneMat);
    curb.position.set(rx, 0.36 + curbH * 0.5, -8.02);
    curb.castShadow = true;
    curb.receiveShadow = true;
    drainageGutter.add(curb);
  }

  // 4 metallic slotted stormwater grates
  const frontGratePositions: Array<[number, number, boolean]> = [
    [-6.35, 0.54, false],
    [-0.55, 0.54, false],
    [2.15, 0.54, false],
    [-7.44, -2.55, true],
  ];
  for (const [gx, gz, rotate90] of frontGratePositions) {
    const grate = createStormwaterGrate(0.56, 0.26, grateIronMat, grateRecessMat);
    grate.position.set(gx, 0.361, gz);
    if (rotate90) {
      grate.rotation.y = Math.PI * 0.5;
    }
    drainageGutter.add(grate);
  }

  // ---------------------------------------------------------------------------
  // 6. Wet Reflective Puddles (including AC Drip Puddle at x: 2.85, z: -3.6, y: 0.505)
  // ---------------------------------------------------------------------------
  const wetPuddles = markNoOutline(new THREE.Group());
  wetPuddles.name = 'wet-puddles';
  group.add(wetPuddles);

  const puddleMaterials: THREE.ShaderMaterial[] = [];
  const dampHaloMat = new THREE.MeshBasicMaterial({
    color: '#232a3e',
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });

  const puddleConfigs: Array<{
    name: string;
    x: number;
    y: number;
    z: number;
    rx: number;
    rz: number;
    seed: number;
    rippleCenter: THREE.Vector2;
  }> = [
    {
      name: 'puddle-storefront-road',
      x: -3.2,
      y: 0.368,
      z: 5.6,
      rx: 1.28,
      rz: 0.82,
      seed: 0.7,
      rippleCenter: new THREE.Vector2(2.85, -3.6), // world AC drip coords -> calm dusk sky mirror on street
    },
    {
      name: 'puddle-corner-intersection',
      x: -9.2,
      y: 0.368,
      z: 2.2,
      rx: 0.96,
      rz: 0.64,
      seed: 2.1,
      rippleCenter: new THREE.Vector2(2.85, -3.6),
    },
    {
      name: 'puddle-alley-ac-drip',
      x: 2.85,
      y: 0.505,
      z: -3.6,
      rx: 0.42,
      rz: 0.36,
      seed: 3.8,
      rippleCenter: new THREE.Vector2(0.5, 0.5), // centered directly under AC condensate hose (2.85, -3.6)
    },
  ];

  for (const cfg of puddleConfigs) {
    const haloGeom = createOrganicPuddleGeometry(cfg.rx * 1.14, cfg.rz * 1.14, cfg.seed, 36);
    const halo = markNoOutline(new THREE.Mesh(haloGeom, dampHaloMat));
    halo.name = `${cfg.name}-damp-halo`;
    halo.position.set(cfg.x, cfg.y - 0.0015, cfg.z);
    wetPuddles.add(halo);

    const puddleMat = createWetPuddleMaterial();
    if (puddleMat.uniforms?.uRippleCenter?.value instanceof THREE.Vector2) {
      puddleMat.uniforms.uRippleCenter.value.copy(cfg.rippleCenter);
    }
    puddleMaterials.push(puddleMat);

    const puddleGeom = createOrganicPuddleGeometry(cfg.rx, cfg.rz, cfg.seed, 44);
    const puddleMesh = markNoOutline(new THREE.Mesh(puddleGeom, puddleMat));
    puddleMesh.name = cfg.name;
    puddleMesh.position.set(cfg.x, cfg.y, cfg.z);
    wetPuddles.add(puddleMesh);
  }

  // ---------------------------------------------------------------------------
  // 7. Arched White Japanese Street-Corner Guardrails (ガードパイプ)
  // ---------------------------------------------------------------------------
  const streetGuardrails = new THREE.Group();
  streetGuardrails.name = 'street-guardrails';
  group.add(streetGuardrails);

  const guardrailWhiteMat = createToonMaterial({ color: '#f6f8fc' });
  const guardrailCollarMat = createToonMaterial({ color: PALETTE.peachOrange });

  // Front-left sidewalk corner guardrail
  const railFrontLeft = createGuardrailSection(1.08, guardrailWhiteMat, guardrailCollarMat);
  railFrontLeft.position.set(-6.82, 0.52, 0.3);
  streetGuardrails.add(railFrontLeft);

  // Side-left sidewalk corner guardrail (turned 90 deg)
  const railSideLeft = createGuardrailSection(1.12, guardrailWhiteMat, guardrailCollarMat);
  railSideLeft.rotation.y = Math.PI * 0.5;
  railSideLeft.position.set(-7.44, 0.52, -0.48);
  streetGuardrails.add(railSideLeft);

  // Front-right sidewalk corner guardrail near alley entrance
  const railFrontRight = createGuardrailSection(0.96, guardrailWhiteMat, guardrailCollarMat);
  railFrontRight.position.set(1.62, 0.52, 0.3);
  streetGuardrails.add(railFrontRight);

  // Distant intersection verge guardrails near the traffic signal
  const railSignalA = createGuardrailSection(1.22, guardrailWhiteMat, guardrailCollarMat);
  railSignalA.position.set(-9.55, 0.362, 10.45);
  const railSignalB = createGuardrailSection(1.22, guardrailWhiteMat, guardrailCollarMat);
  railSignalB.position.set(-8.15, 0.362, 10.45);
  streetGuardrails.add(railSignalA, railSignalB);

  // ---------------------------------------------------------------------------
  // 8. Blue Road Sign + Orange-Rimmed Convex Corner Mirror at (x: 2.3, z: 0.25)
  // ---------------------------------------------------------------------------
  const streetSigns = new THREE.Group();
  streetSigns.name = 'street-signs';
  streetSigns.position.set(2.3, 0.52, 0.25);
  group.add(streetSigns);

  const steelPostMat = createToonMaterial({ color: '#c8d0dc' });
  const bracketMat = createToonMaterial({ color: '#6b7588' });
  const mirrorOrangeMat = createToonMaterial({ color: '#ff7a33' });
  const signBlueMat = createToonMaterial({ color: '#2968b2' });
  const signWhiteMat = createToonMaterial({ color: '#f8fbff' });
  const convexMirrorGlassMat = new THREE.MeshStandardMaterial({
    color: '#cce6f8',
    roughness: 0.09,
    metalness: 0.88,
    emissive: new THREE.Color(PALETTE.peachOrange),
    emissiveIntensity: 0.14,
  });

  // Main galvanized sign & mirror post
  const signPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.05, 2.72, 12),
    steelPostMat,
  );
  signPost.position.y = 1.36;
  signPost.castShadow = true;
  streetSigns.add(signPost);

  const signBaseCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.11, 0.06, 12),
    bracketMat,
  );
  signBaseCollar.position.y = 0.03;
  streetSigns.add(signBaseCollar);

  // Orange-rimmed convex corner traffic mirror (カーブミラー) angled toward intersection
  const mirrorPivot = new THREE.Group();
  mirrorPivot.name = 'convex-corner-mirror';
  mirrorPivot.position.set(-0.06, 2.58, 0.08);
  mirrorPivot.rotation.set(0.12, -0.52, 0);
  streetSigns.add(mirrorPivot);

  const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), bracketMat);
  mirrorArm.position.set(0.03, 0, -0.09);
  mirrorPivot.add(mirrorArm);

  const mirrorDish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.29, 0.075, 20),
    mirrorOrangeMat,
  );
  mirrorDish.rotation.x = Math.PI * 0.5;
  mirrorDish.castShadow = true;
  mirrorPivot.add(mirrorDish);

  // Curved upper rain visor rim on convex mirror
  const mirrorVisor = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.028, 10, 20, Math.PI * 1.15),
    mirrorOrangeMat,
  );
  mirrorVisor.position.set(0, 0, 0.035);
  mirrorVisor.rotation.z = -0.22;
  mirrorPivot.add(mirrorVisor);

  // Reflective convex dome
  const mirrorDomeGeom = new THREE.SphereGeometry(0.285, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.34);
  mirrorDomeGeom.rotateX(Math.PI * 0.5);
  const mirrorDome = markNoOutline(new THREE.Mesh(mirrorDomeGeom, convexMirrorGlassMat));
  mirrorDome.scale.set(1, 1, 0.38);
  mirrorDome.position.set(0, 0, -0.18);
  mirrorPivot.add(mirrorDome);

  // Crisp blue diamond Japanese crosswalk road sign mounted mid-post
  const blueSignAssembly = new THREE.Group();
  blueSignAssembly.name = 'blue-crosswalk-sign';
  blueSignAssembly.position.set(0, 1.88, 0.07);
  blueSignAssembly.rotation.y = -0.18;
  streetSigns.add(blueSignAssembly);

  const signClamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.09), bracketMat);
  signClamp.position.z = -0.04;
  blueSignAssembly.add(signClamp);

  const diamondGroup = new THREE.Group();
  diamondGroup.rotation.z = Math.PI * 0.25;
  blueSignAssembly.add(diamondGroup);

  const signBacking = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.022), signWhiteMat);
  signBacking.castShadow = true;
  const signFace = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.026), signBlueMat),
  );
  diamondGroup.add(signBacking, signFace);

  // Clean geometric crosswalk stripe relief inside the blue sign (zero text/garble)
  for (let s = -1; s <= 1; s++) {
    const reliefBar = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.03), signWhiteMat),
    );
    reliefBar.position.set(s * 0.085, -0.05, 0);
    blueSignAssembly.add(reliefBar);
  }
  const signTriangleRoof = markNoOutline(
    new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.11, 3), signWhiteMat),
  );
  signTriangleRoof.rotation.y = Math.PI * 0.5;
  signTriangleRoof.position.set(0, 0.09, 0.015);
  blueSignAssembly.add(signTriangleRoof);

  // ---------------------------------------------------------------------------
  // 9. Distant Street-Corner Traffic Signal at (x: -10.6, z: 9.8, y: 0.36)
  // ---------------------------------------------------------------------------
  const trafficSignal = new THREE.Group();
  trafficSignal.name = 'traffic-signal';
  trafficSignal.position.set(-10.6, 0.36, 9.8);
  group.add(trafficSignal);

  const signalPoleMat = createToonMaterial({ color: '#cfd6e2' });
  const signalBoxMat = createToonMaterial({ color: '#aeb7c6' });
  const signalHeadMat = createToonMaterial({ color: '#e9eef5' });
  const signalVisorMat = createToonMaterial({ color: '#394256', side: THREE.DoubleSide });

  const trafficLightBulbs = {
    red: new THREE.MeshStandardMaterial({
      color: '#ff5964',
      emissive: new THREE.Color('#ff3b4e'),
      emissiveIntensity: 0.06,
      roughness: 0.25,
    }),
    yellow: new THREE.MeshStandardMaterial({
      color: '#ffd154',
      emissive: new THREE.Color('#ffbe2e'),
      emissiveIntensity: 0.06,
      roughness: 0.25,
    }),
    green: new THREE.MeshStandardMaterial({
      color: '#4be39a',
      emissive: new THREE.Color('#2ce68b'),
      emissiveIntensity: 1.15,
      roughness: 0.25,
    }),
  };

  // Main tapered utility signal pole (strictly inside X ∈ [-10.9, -8.0], Z ∈ [9.4, 10.2])
  const mainSignalPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.135, 4.55, 12),
    signalPoleMat,
  );
  mainSignalPole.position.y = 2.275;
  mainSignalPole.castShadow = true;
  trafficSignal.add(mainSignalPole);

  const polePlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.21, 0.22, 12),
    signalBoxMat,
  );
  polePlinth.position.y = 0.11;
  trafficSignal.add(polePlinth);

  // Pole-mounted signal controller cabinet
  const controllerCabinet = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.54, 0.24),
    signalBoxMat,
  );
  controllerCabinet.position.set(0.16, 1.55, 0);
  controllerCabinet.castShadow = true;
  trafficSignal.add(controllerCabinet);

  // Cantilevered horizontal mast arm extending +X over the intersection (+0.1 -> +2.25 => world X: -10.5 -> -8.35)
  const mastArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.065, 2.25, 10),
    signalPoleMat,
  );
  mastArm.rotation.z = Math.PI * 0.5;
  mastArm.position.set(1.15, 4.22, 0);
  mastArm.castShadow = true;
  trafficSignal.add(mastArm);

  const tensionRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 1.85, 8),
    signalBoxMat,
  );
  tensionRod.rotation.z = 1.38;
  tensionRod.position.set(0.92, 4.42, 0);
  trafficSignal.add(tensionRod);

  // Dual-facing signal heads (+Z toward viewer/front & -Z toward konbini, plus angled cross-road visibility)
  const frontSignalHead = createTrafficSignalHead(signalHeadMat, signalVisorMat, trafficLightBulbs);
  frontSignalHead.name = 'traffic-signal-head-front';
  frontSignalHead.position.set(1.58, 4.2, 0.14);
  frontSignalHead.rotation.y = 0.18; // slightly angled toward the 3/4 default camera!
  trafficSignal.add(frontSignalHead);

  const backSignalHead = createTrafficSignalHead(signalHeadMat, signalVisorMat, trafficLightBulbs);
  backSignalHead.name = 'traffic-signal-head-back';
  backSignalHead.position.set(1.58, 4.2, -0.14);
  backSignalHead.rotation.y = Math.PI;
  trafficSignal.add(backSignalHead);

  // Apply cel-shaded inverted-hull outlines to solid 3D street furniture & props
  applyOutlinesToHierarchy(group, 0.02);

  return {
    group,
    puddleMaterials,
    crosswalkMaterial,
    trafficLightBulbs,
  };
}
