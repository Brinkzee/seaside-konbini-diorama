import * as THREE from 'three';
import { PALETTE } from '../config/paletteAndBounds';
import {
  createFestivalPosterTexture,
  createStripedFabricTexture,
  createTrashLabelsTexture,
  createVendingFrontTexture,
} from '../rendering/canvasTextures';
import {
  applyOutlinesToHierarchy,
  createEmissiveLightboxMaterial,
  createGlassMaterial,
  createToonMaterial,
} from '../rendering/toonMaterials';

export interface ExteriorPropsResult {
  group: THREE.Group; // name: 'exterior-props'
  acFanWheel: THREE.Object3D;
  acWaterDrop: THREE.Object3D; // starts at Y = 1.32, drops to puddle Y = 0.51 at (x: 2.85, z: -3.6)
  acRippleRing: THREE.Mesh; // ring mesh on puddle at (x: 2.85, y: 0.512, z: -3.6)
  flutteringPosterCorner: THREE.Object3D;
  treeFoliageClusters: THREE.Object3D[];
  overheadWires: THREE.Object3D[];
  vendingGlowMaterials: THREE.MeshStandardMaterial[];
  streetlampLight: THREE.PointLight;
}

function makeBox(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  name?: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) {
    mesh.name = name;
  }
  return mesh;
}

function createCatenaryWire(
  start: THREE.Vector3,
  end: THREE.Vector3,
  sag: number,
  material: THREE.Material,
  name: string,
): THREE.Group {
  const pivot = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const wireHolder = new THREE.Group();
  wireHolder.name = name;
  wireHolder.position.copy(pivot);

  const p0 = start.clone().sub(pivot);
  const p4 = end.clone().sub(pivot);
  const p1 = new THREE.Vector3().lerpVectors(p0, p4, 0.25);
  p1.y -= sag * 0.75;
  const p2 = new THREE.Vector3().lerpVectors(p0, p4, 0.5);
  p2.y -= sag;
  const p3 = new THREE.Vector3().lerpVectors(p0, p4, 0.75);
  p3.y -= sag * 0.75;

  const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4]);
  const geo = new THREE.TubeGeometry(curve, 28, 0.013, 6, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noOutline = true;
  wireHolder.add(mesh);

  return wireHolder;
}

function createSurfboardGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Classic coastal longboard contour in XY (height ~1.86 along Y, max width ~0.44 along X)
  shape.moveTo(0, -0.92); // tail center
  shape.bezierCurveTo(0.16, -0.92, 0.21, -0.75, 0.22, -0.35);
  shape.bezierCurveTo(0.23, 0.18, 0.19, 0.62, 0, 0.94); // pointed nose
  shape.bezierCurveTo(-0.19, 0.62, -0.23, 0.18, -0.22, -0.35);
  shape.bezierCurveTo(-0.21, -0.75, -0.16, -0.92, 0, -0.92);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.032,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.014,
    bevelThickness: 0.014,
  });
  geo.center();
  return geo;
}

function createFlipFlopSoleGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.12);
  shape.bezierCurveTo(0.048, -0.12, 0.052, -0.04, 0.055, 0.04);
  shape.bezierCurveTo(0.056, 0.095, 0.032, 0.125, 0, 0.125);
  shape.bezierCurveTo(-0.032, 0.125, -0.056, 0.095, -0.055, 0.04);
  shape.bezierCurveTo(-0.052, -0.04, -0.048, -0.12, 0, -0.12);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.004,
    bevelThickness: 0.004,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildExteriorProps(): ExteriorPropsResult {
  const group = new THREE.Group();
  group.name = 'exterior-props';

  const vendingGlowMaterials: THREE.MeshStandardMaterial[] = [];
  const treeFoliageClusters: THREE.Object3D[] = [];
  const overheadWires: THREE.Object3D[] = [];

  // Shared cel-shaded miniature materials
  const keiBlueMat = createToonMaterial({ color: PALETTE.keiTruckBlue });
  const seaSaltMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const seaSaltLightMat = createToonMaterial({ color: PALETTE.seaSaltLight });
  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const mintMat = createToonMaterial({ color: PALETTE.mintGreen });
  const peachMat = createToonMaterial({ color: PALETTE.peachOrange });
  const coralMat = createToonMaterial({ color: PALETTE.coralPink });
  const warmAmberMat = createToonMaterial({ color: PALETTE.warmAmber });
  const darkMetalMat = createToonMaterial({ color: '#2b3346' });
  const tireRubberMat = createToonMaterial({ color: '#242936' });
  const silverMetalMat = createToonMaterial({ color: '#cfd6e2' });
  const galvanizedMat = createToonMaterial({ color: '#9aa5b5' });
  const concretePoleMat = createToonMaterial({ color: '#b9b6ae' });
  const woodCedarMat = createToonMaterial({ color: '#8a5d3b' });
  const woodLightMat = createToonMaterial({ color: '#c89d6c' });
  const wickerMat = createToonMaterial({ color: '#b57944' });
  const wickerRimMat = createToonMaterial({ color: '#8a572c' });
  const wireInkMat = new THREE.MeshBasicMaterial({ color: PALETTE.outlineInk });

  // ---------------------------------------------------------------------------
  // 1. Light-Blue Kei Truck ('kei-truck') at (x: -9.4, z: -3.4, y: 0.36) facing +Z
  // Strictly inside parking bay X in [-10.6, -8.2], Z in [-5.3, -1.5]
  // ---------------------------------------------------------------------------
  const keiTruck = new THREE.Group();
  keiTruck.name = 'kei-truck';
  keiTruck.position.set(-9.4, 0.36, -3.4);

  // Chassis underframe
  keiTruck.add(makeBox(1.22, 0.14, 3.04, darkMetalMat, 0, 0.28, -0.02, 'truck-chassis'));

  // 4 Wheels + steel rims + hubcaps
  const wheelPositions: Array<[number, number]> = [
    [-0.66, 1.02],
    [0.66, 1.02],
    [-0.66, -0.96],
    [0.66, -0.96],
  ];
  for (const [wx, wz] of wheelPositions) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(wx, 0.26, wz);

    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.17, 18), tireRubberMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;
    wheelGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 14), silverMetalMat);
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.19, 10), darkMetalMat);
    cap.rotation.z = Math.PI / 2;
    wheelGroup.add(cap);

    keiTruck.add(wheelGroup);
  }

  // Cute boxy Japanese Kei cab (Z in [0.38, 1.58])
  keiTruck.add(makeBox(1.48, 0.66, 1.18, keiBlueMat, 0, 0.66, 0.98, 'truck-cab-lower'));
  keiTruck.add(makeBox(1.46, 0.18, 0.16, keiBlueMat, 0, 1.04, 1.48, 'truck-cab-nose- cowl'));
  // Cab rear wall & window frame
  keiTruck.add(makeBox(1.44, 0.68, 0.08, keiBlueMat, 0, 1.33, 0.43, 'truck-cab-backwall'));
  // Cab roof cap
  keiTruck.add(makeBox(1.44, 0.09, 1.04, creamMat, 0, 1.69, 0.9, 'truck-cab-roof'));
  // 4 Cab pillars
  keiTruck.add(makeBox(0.07, 0.66, 0.07, keiBlueMat, -0.68, 1.34, 1.38));
  keiTruck.add(makeBox(0.07, 0.66, 0.07, keiBlueMat, 0.68, 1.34, 1.38));
  keiTruck.add(makeBox(0.08, 0.66, 0.09, keiBlueMat, -0.68, 1.34, 0.52));
  keiTruck.add(makeBox(0.08, 0.66, 0.09, keiBlueMat, 0.68, 1.34, 0.52));

  // Unoccupied cab interior (dashboard, right-hand-drive steering wheel, empty vinyl bench seats)
  keiTruck.add(makeBox(1.32, 0.22, 0.24, darkMetalMat, 0, 0.98, 1.34, 'truck-dashboard'));
  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.016, 8, 16), darkMetalMat);
  steeringWheel.position.set(-0.34, 1.12, 1.22);
  steeringWheel.rotation.x = -0.65;
  steeringWheel.userData.noOutline = true;
  keiTruck.add(steeringWheel);
  keiTruck.add(makeBox(0.52, 0.12, 0.44, woodLightMat, -0.34, 0.88, 0.78, 'truck-seat-r'));
  keiTruck.add(makeBox(0.52, 0.12, 0.44, woodLightMat, 0.34, 0.88, 0.78, 'truck-seat-l'));

  // Cab windshield & side windows catching peach/indigo dusk tint
  const truckWindshieldMat = createGlassMaterial({
    tint: '#ffd7c2',
    opacity: 0.28,
  });
  truckWindshieldMat.depthWrite = false;

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.58, 0.024), truckWindshieldMat);
  windshield.position.set(0, 1.34, 1.42);
  windshield.rotation.x = -0.16;
  windshield.userData.noOutline = true;
  keiTruck.add(windshield);

  for (const sx of [-0.71, 0.71]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.54, 0.78), truckWindshieldMat);
    sideGlass.position.set(sx, 1.34, 0.95);
    sideGlass.userData.noOutline = true;
    keiTruck.add(sideGlass);

    // Side wing mirrors
    const mirrorArm = makeBox(0.11, 0.02, 0.02, darkMetalMat, sx + Math.sign(sx) * 0.05, 1.26, 1.33);
    mirrorArm.userData.noOutline = true;
    keiTruck.add(mirrorArm);
    keiTruck.add(makeBox(0.035, 0.15, 0.09, darkMetalMat, sx + Math.sign(sx) * 0.11, 1.29, 1.33));
  }

  // Front bumper, grille, yellow Kei plate, and round warm headlights
  keiTruck.add(makeBox(1.52, 0.15, 0.11, darkMetalMat, 0, 0.38, 1.6, 'truck-front-bumper'));
  keiTruck.add(makeBox(0.68, 0.16, 0.04, darkMetalMat, 0, 0.62, 1.58, 'truck-grille'));
  const keiPlateMat = createToonMaterial({ color: '#f4d35e' });
  const frontPlate = makeBox(0.28, 0.14, 0.02, keiPlateMat, 0.34, 0.38, 1.66, 'truck-kei-plate');
  frontPlate.userData.noOutline = true;
  keiTruck.add(frontPlate);

  const headlightGlowMat = createEmissiveLightboxMaterial({
    color: '#ffe5a8',
    intensity: 0.65,
  });
  for (const hx of [-0.49, 0.49]) {
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.05, 16), silverMetalMat);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(hx, 0.72, 1.58);
    keiTruck.add(bezel);

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.098, 0.06, 16), headlightGlowMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(hx, 0.72, 1.59);
    lens.userData.noOutline = true;
    keiTruck.add(lens);

    const blinker = makeBox(0.14, 0.065, 0.04, warmAmberMat, hx, 0.52, 1.59);
    blinker.userData.noOutline = true;
    keiTruck.add(blinker);
  }

  // Flatbed cargo box with drop sides (Z in [-1.62, 0.36])
  keiTruck.add(makeBox(1.46, 0.07, 1.98, woodCedarMat, 0, 0.54, -0.63, 'truck-bed-floor'));
  keiTruck.add(makeBox(0.06, 0.33, 1.98, keiBlueMat, -0.71, 0.73, -0.63, 'truck-drop-side-r'));
  keiTruck.add(makeBox(0.06, 0.33, 1.98, keiBlueMat, 0.71, 0.73, -0.63, 'truck-drop-side-l'));
  keiTruck.add(makeBox(1.48, 0.33, 0.06, keiBlueMat, 0, 0.73, -1.6, 'truck-tailgate'));
  // Headache rack behind cab
  keiTruck.add(makeBox(1.42, 0.05, 0.05, keiBlueMat, 0, 1.66, 0.34));
  keiTruck.add(makeBox(0.05, 0.78, 0.05, keiBlueMat, -0.68, 1.28, 0.34));
  keiTruck.add(makeBox(0.05, 0.78, 0.05, keiBlueMat, 0.68, 1.28, 0.34));

  // Coastal delivery crates & rolled tarp in bed
  keiTruck.add(makeBox(0.48, 0.26, 0.36, seaSaltMat, -0.34, 0.7, -0.28, 'truck-crate-blue'));
  keiTruck.add(makeBox(0.46, 0.24, 0.36, creamMat, -0.32, 0.69, -0.72, 'truck-crate-cream'));
  const rolledTarp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.92, 12), mintMat);
  rolledTarp.rotation.x = Math.PI / 2;
  rolledTarp.position.set(0.28, 0.69, -0.65);
  keiTruck.add(rolledTarp);

  // Rear tail lights
  const tailLightMat = createEmissiveLightboxMaterial({ color: '#ff6464', intensity: 0.45 });
  for (const tx of [-0.54, 0.54]) {
    const tail = makeBox(0.18, 0.08, 0.04, tailLightMat, tx, 0.43, -1.63);
    tail.userData.noOutline = true;
    keiTruck.add(tail);
  }

  group.add(keiTruck);

  // ---------------------------------------------------------------------------
  // 2. Two Beverage Vending Machines ('vending-machines') at X in [-6.8, -4.8], Z = -0.25, Y = 0.53
  // ---------------------------------------------------------------------------
  const vendingGroup = new THREE.Group();
  vendingGroup.name = 'vending-machines';

  const buildVendingUnit = (
    unitName: string,
    centerX: number,
    height: number,
    bodyMat: THREE.Material,
    accentMat: THREE.Material,
    variant: 'blue' | 'cream',
  ): THREE.Group => {
    const vm = new THREE.Group();
    vm.name = unitName;
    vm.position.set(centerX, 0.53, -0.25);

    // Main cabinet
    vm.add(makeBox(0.92, height, 0.58, bodyMat, 0, height * 0.5, 0, `${unitName}-cabinet`));
    vm.add(makeBox(0.94, 0.07, 0.6, accentMat, 0, height - 0.035, 0, `${unitName}-cap`));

    // Illuminated product showcase window
    const frontTex = createVendingFrontTexture(variant);
    const displayGlowMat = createEmissiveLightboxMaterial({
      color: '#fffef8',
      map: frontTex,
      intensity: 0.88,
    });
    vendingGlowMaterials.push(displayGlowMat);

    const showcasePanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.76, height * 0.48),
      displayGlowMat,
    );
    showcasePanel.position.set(0, height * 0.64, 0.294);
    showcasePanel.userData.noOutline = true;
    vm.add(showcasePanel);

    // Clear protective front acrylic pane
    const vmGlassMat = createGlassMaterial({ tint: '#eefaff', opacity: 0.13 });
    vmGlassMat.depthWrite = false;
    const acrylic = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, height * 0.5, 0.015),
      vmGlassMat,
    );
    acrylic.position.set(0, height * 0.64, 0.302);
    acrylic.userData.noOutline = true;
    vm.add(acrylic);

    // Warm / cool selection button bar & coin bezel
    const coolTag = makeBox(0.46, 0.045, 0.02, seaSaltLightMat, -0.14, height * 0.36, 0.295);
    coolTag.userData.noOutline = true;
    vm.add(coolTag);
    const warmTag = makeBox(0.24, 0.045, 0.02, coralMat, 0.24, height * 0.36, 0.295);
    warmTag.userData.noOutline = true;
    vm.add(warmTag);
    vm.add(makeBox(0.18, 0.28, 0.03, silverMetalMat, 0.28, height * 0.24, 0.295));

    // Softly glowing pickup slot
    const pickupGlowMat = createEmissiveLightboxMaterial({
      color: '#ffe2a6',
      intensity: 0.56,
    });
    vendingGlowMaterials.push(pickupGlowMat);
    vm.add(makeBox(0.54, 0.22, 0.04, darkMetalMat, -0.1, 0.24, 0.285));
    const pickupGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.15), pickupGlowMat);
    pickupGlow.position.set(-0.1, 0.24, 0.308);
    pickupGlow.userData.noOutline = true;
    vm.add(pickupGlow);

    return vm;
  };

  vendingGroup.add(
    buildVendingUnit('vending-machine-blue', -6.28, 1.86, seaSaltMat, creamMat, 'blue'),
  );
  vendingGroup.add(
    buildVendingUnit('vending-machine-cream', -5.28, 1.82, creamMat, mintMat, 'cream'),
  );
  group.add(vendingGroup);

  // ---------------------------------------------------------------------------
  // 3. Three-Bin Sorting Trash Cans ('trash-cans') at (x: -4.2, z: -0.25, y: 0.53)
  // ---------------------------------------------------------------------------
  const trashGroup = new THREE.Group();
  trashGroup.name = 'trash-cans';
  trashGroup.position.set(-4.2, 0.53, -0.25);

  trashGroup.add(makeBox(1.04, 0.04, 0.46, darkMetalMat, 0, 0.02, 0, 'trash-base'));

  const binConfigs: Array<{ x: number; hoodMat: THREE.Material; roundHoles: boolean }> = [
    { x: -0.34, hoodMat: peachMat, roundHoles: false },
    { x: 0, hoodMat: seaSaltMat, roundHoles: true },
    { x: 0.34, hoodMat: mintMat, roundHoles: true },
  ];

  for (const cfg of binConfigs) {
    trashGroup.add(makeBox(0.32, 0.62, 0.42, creamMat, cfg.x, 0.35, 0));
    // Sloped sorting hood
    const hood = makeBox(0.33, 0.22, 0.43, cfg.hoodMat, cfg.x, 0.76, 0);
    trashGroup.add(hood);

    if (cfg.roundHoles) {
      for (const hx of [-0.07, 0.07]) {
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.042, 0.042, 0.03, 12),
          darkMetalMat,
        );
        hole.rotation.x = Math.PI / 2;
        hole.position.set(cfg.x + hx, 0.77, 0.215);
        hole.userData.noOutline = true;
        trashGroup.add(hole);
      }
    } else {
      const slot = makeBox(0.2, 0.09, 0.025, darkMetalMat, cfg.x, 0.77, 0.215);
      slot.userData.noOutline = true;
      trashGroup.add(slot);
    }
  }

  const trashLabelsTex = createTrashLabelsTexture();
  const trashLabelMat = createToonMaterial({ color: '#ffffff', map: trashLabelsTex });
  const trashLabelPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.46), trashLabelMat);
  trashLabelPanel.position.set(0, 0.38, 0.216);
  trashLabelPanel.userData.noOutline = true;
  trashGroup.add(trashLabelPanel);

  group.add(trashGroup);

  // ---------------------------------------------------------------------------
  // 4. Pair of Beach Flip-Flops ('flip-flops') at (x: -1.65, z: 0.12, y: 0.535)
  // Casually slipped off slightly askew beside the welcome mat
  // ---------------------------------------------------------------------------
  const flipFlopsGroup = new THREE.Group();
  flipFlopsGroup.name = 'flip-flops';
  flipFlopsGroup.position.set(-1.65, 0.535, 0.12);

  const soleGeo = createFlipFlopSoleGeometry();
  const buildSingleSandal = (offsetX: number, offsetZ: number, yaw: number): THREE.Group => {
    const sandal = new THREE.Group();
    sandal.position.set(offsetX, 0, offsetZ);
    sandal.rotation.y = yaw;

    const bottomSole = new THREE.Mesh(soleGeo, seaSaltMat);
    bottomSole.position.y = 0.002;
    bottomSole.castShadow = true;
    sandal.add(bottomSole);

    const topFootbed = new THREE.Mesh(soleGeo, coralMat);
    topFootbed.scale.set(0.95, 0.75, 0.95);
    topFootbed.position.y = 0.011;
    topFootbed.userData.noOutline = true;
    sandal.add(topFootbed);

    // Y-thong straps
    for (const side of [-1, 1]) {
      const strapCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.018, 0.055),
        new THREE.Vector3(side * 0.025, 0.044, 0.01),
        new THREE.Vector3(side * 0.044, 0.016, -0.035),
      ]);
      const strap = new THREE.Mesh(
        new THREE.TubeGeometry(strapCurve, 10, 0.0065, 6, false),
        creamMat,
      );
      strap.userData.noOutline = true;
      sandal.add(strap);
    }

    return sandal;
  };

  flipFlopsGroup.add(buildSingleSandal(-0.085, 0.025, 0.24));
  flipFlopsGroup.add(buildSingleSandal(0.085, -0.028, -0.12));
  group.add(flipFlopsGroup);

  // ---------------------------------------------------------------------------
  // 5. Bicycle with Wicker Basket ('bicycle-wicker-basket') at (x: -0.4, z: 0.12, y: 0.53)
  // ---------------------------------------------------------------------------
  const bicycleGroup = new THREE.Group();
  bicycleGroup.name = 'bicycle-wicker-basket';
  bicycleGroup.position.set(-0.4, 0.53, 0.12);
  bicycleGroup.rotation.set(0.05, -0.42, 0);

  const buildSpokedWheel = (wx: number): THREE.Group => {
    const wg = new THREE.Group();
    wg.position.set(wx, 0.31, 0);

    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.028, 10, 28), tireRubberMat);
    tire.castShadow = true;
    wg.add(tire);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.011, 8, 24), silverMetalMat);
    rim.userData.noOutline = true;
    wg.add(rim);

    // Cream mudguard fender
    const fender = new THREE.Mesh(
      new THREE.TorusGeometry(0.318, 0.018, 8, 18, Math.PI * 0.92),
      creamMat,
    );
    fender.rotation.z = Math.PI * 0.04;
    wg.add(fender);

    // Delicate spokes
    for (let s = 0; s < 6; s++) {
      const spoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, 0.51, 5),
        silverMetalMat,
      );
      spoke.rotation.z = (s * Math.PI) / 6;
      spoke.userData.noOutline = true;
      wg.add(spoke);
    }

    return wg;
  };

  bicycleGroup.add(buildSpokedWheel(0.5)); // front wheel (+X)
  bicycleGroup.add(buildSpokedWheel(-0.5)); // rear wheel (-X)

  // Step-through mint-green tubular frame
  const addFrameTube = (pA: THREE.Vector3, pB: THREE.Vector3, radius: number, mat: THREE.Material) => {
    const curve = new THREE.LineCurve3(pA, pB);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 6, radius, 8, false), mat);
    tube.castShadow = true;
    bicycleGroup.add(tube);
  };

  // Front fork & head tube
  addFrameTube(new THREE.Vector3(0.5, 0.31, 0.04), new THREE.Vector3(0.39, 0.72, 0), 0.016, mintMat);
  addFrameTube(new THREE.Vector3(0.5, 0.31, -0.04), new THREE.Vector3(0.39, 0.72, 0), 0.016, mintMat);
  addFrameTube(new THREE.Vector3(0.39, 0.68, 0), new THREE.Vector3(0.35, 0.88, 0), 0.022, mintMat);
  // Curved step-through down tube & seat tube
  const stepCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.37, 0.78, 0),
    new THREE.Vector3(0.12, 0.44, 0),
    new THREE.Vector3(-0.12, 0.34, 0),
  ]);
  const stepTube = new THREE.Mesh(new THREE.TubeGeometry(stepCurve, 14, 0.021, 8, false), mintMat);
  stepTube.castShadow = true;
  bicycleGroup.add(stepTube);

  addFrameTube(new THREE.Vector3(-0.12, 0.34, 0), new THREE.Vector3(-0.22, 0.78, 0), 0.02, mintMat);
  // Rear stays & luggage rack
  addFrameTube(new THREE.Vector3(-0.12, 0.34, 0), new THREE.Vector3(-0.5, 0.31, 0), 0.015, mintMat);
  addFrameTube(new THREE.Vector3(-0.2, 0.7, 0), new THREE.Vector3(-0.5, 0.31, 0), 0.014, mintMat);
  bicycleGroup.add(makeBox(0.38, 0.025, 0.18, mintMat, -0.46, 0.66, 0, 'bike-rear-rack'));

  // Chain guard
  bicycleGroup.add(makeBox(0.42, 0.11, 0.035, mintMat, -0.28, 0.33, 0.045, 'bike-chainguard'));

  // Seatpost & cream cruiser saddle
  addFrameTube(new THREE.Vector3(-0.22, 0.78, 0), new THREE.Vector3(-0.24, 0.89, 0), 0.014, silverMetalMat);
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), creamMat);
  saddle.scale.set(1.25, 0.42, 0.85);
  saddle.position.set(-0.25, 0.91, 0);
  saddle.castShadow = true;
  bicycleGroup.add(saddle);

  // Swept-back chrome handlebars + honey grips
  addFrameTube(new THREE.Vector3(0.35, 0.88, 0), new THREE.Vector3(0.32, 1.02, 0), 0.015, silverMetalMat);
  const barCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.22, 1.03, -0.24),
    new THREE.Vector3(0.32, 1.03, -0.1),
    new THREE.Vector3(0.33, 1.02, 0),
    new THREE.Vector3(0.32, 1.03, 0.1),
    new THREE.Vector3(0.22, 1.03, 0.24),
  ]);
  const handleBar = new THREE.Mesh(new THREE.TubeGeometry(barCurve, 14, 0.013, 8, false), silverMetalMat);
  bicycleGroup.add(handleBar);
  for (const gz of [-0.21, 0.21]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.09, 8), wickerMat);
    grip.rotation.z = Math.PI / 2;
    grip.rotation.y = gz > 0 ? -0.45 : 0.45;
    grip.position.set(0.23, 1.03, gz);
    bicycleGroup.add(grip);
  }

  // Brown woven front wicker basket + rolled sky towel inside
  const basketGroup = new THREE.Group();
  basketGroup.position.set(0.49, 0.84, 0);
  basketGroup.add(makeBox(0.24, 0.22, 0.31, wickerMat, 0, 0, 0, 'wicker-basket-body'));
  basketGroup.add(makeBox(0.26, 0.032, 0.33, wickerRimMat, 0, 0.11, 0, 'wicker-basket-rim'));
  // Rolled coastal towel peeking out of basket
  const basketTowel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.22, 10),
    seaSaltLightMat,
  );
  basketTowel.rotation.z = 0.25;
  basketTowel.position.set(-0.02, 0.11, 0.03);
  basketGroup.add(basketTowel);
  bicycleGroup.add(basketGroup);

  // Rear kickstand resting on sidewalk
  addFrameTube(
    new THREE.Vector3(-0.46, 0.31, -0.05),
    new THREE.Vector3(-0.5, 0.01, -0.16),
    0.01,
    silverMetalMat,
  );

  group.add(bicycleGroup);

  // ---------------------------------------------------------------------------
  // 6. Leaning Wet Surfboard ('leaning-surfboard') at (x: 0.9, z: -0.32, y: 0.53)
  // Glossy clearcoat wet sheen + tiny dark damp spot beneath tail
  // ---------------------------------------------------------------------------
  const surfboardGroup = new THREE.Group();
  surfboardGroup.name = 'leaning-surfboard';
  surfboardGroup.position.set(0.9, 0.53, -0.32);

  // Tiny dark damp spot on concrete sidewalk right under surfboard tail
  const dampSpotMat = new THREE.MeshStandardMaterial({
    color: '#343f56',
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.82,
  });
  const dampSpot = new THREE.Mesh(new THREE.CircleGeometry(0.23, 18), dampSpotMat);
  dampSpot.rotation.x = -Math.PI / 2;
  dampSpot.scale.set(1.15, 0.78, 1);
  dampSpot.position.set(0.02, 0.004, 0.14);
  dampSpot.userData.noOutline = true;
  surfboardGroup.add(dampSpot);

  // Angled surfboard pivot leaning back against storefront mullion
  const boardTilt = new THREE.Group();
  boardTilt.position.set(0, 0.91, -0.02);
  boardTilt.rotation.set(-0.22, 0.1, 0.07);

  const wetSurfboardMat = new THREE.MeshPhysicalMaterial({
    color: PALETTE.creamWhite,
    roughness: 0.1,
    metalness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const boardMesh = new THREE.Mesh(createSurfboardGeometry(), wetSurfboardMat);
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  boardMesh.name = 'wet-surfboard-body';
  boardTilt.add(boardMesh);

  // Center stringer & mint/peach stripes
  const stringer = makeBox(0.014, 1.72, 0.062, woodLightMat, 0, 0, 0);
  stringer.userData.noOutline = true;
  boardTilt.add(stringer);
  const surfStripeMint = makeBox(0.41, 0.13, 0.061, mintMat, 0, 0.14, 0);
  surfStripeMint.userData.noOutline = true;
  boardTilt.add(surfStripeMint);
  const surfStripePeach = makeBox(0.42, 0.08, 0.061, peachMat, 0, -0.02, 0);
  surfStripePeach.userData.noOutline = true;
  boardTilt.add(surfStripePeach);

  surfboardGroup.add(boardTilt);
  group.add(surfboardGroup);

  // ---------------------------------------------------------------------------
  // 7. Wooden Surfboard Rack ('surfboard-rack') & Open Beach Umbrella ('open-beach-umbrella')
  // ---------------------------------------------------------------------------
  const rackGroup = new THREE.Group();
  rackGroup.name = 'surfboard-rack';
  rackGroup.position.set(1.52, 0.53, -0.22);

  // Bleached wooden A-frame rack + compact coral bodyboard
  for (const rx of [-0.22, 0.22]) {
    rackGroup.add(makeBox(0.05, 0.05, 0.44, woodCedarMat, rx, 0.025, 0));
    const upright = makeBox(0.05, 0.92, 0.05, woodCedarMat, rx, 0.48, -0.14);
    upright.rotation.x = -0.12;
    rackGroup.add(upright);
    const armLow = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 8), woodLightMat);
    armLow.rotation.x = Math.PI / 2 - 0.15;
    armLow.position.set(rx, 0.32, 0.02);
    rackGroup.add(armLow);
    const armHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), woodLightMat);
    armHigh.rotation.x = Math.PI / 2 - 0.15;
    armHigh.position.set(rx, 0.72, -0.02);
    rackGroup.add(armHigh);
  }
  rackGroup.add(makeBox(0.5, 0.045, 0.045, woodCedarMat, 0, 0.88, -0.18));
  // Short bodyboard resting on rack
  const miniBoard = makeBox(0.36, 0.76, 0.04, coralMat, 0, 0.48, -0.02, 'rack-bodyboard');
  miniBoard.rotation.x = -0.22;
  rackGroup.add(miniBoard);
  group.add(rackGroup);

  // Open Beach Umbrella at (x: 2.0, z: 0.05, y: 0.53)
  const umbrellaGroup = new THREE.Group();
  umbrellaGroup.name = 'open-beach-umbrella';
  umbrellaGroup.position.set(2.0, 0.53, 0.05);

  const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.06, 16), creamMat);
  standBase.position.y = 0.03;
  standBase.castShadow = true;
  umbrellaGroup.add(standBase);

  const umbrellaRig = new THREE.Group();
  umbrellaRig.rotation.set(0.08, 0, -0.1);

  const umbrellaPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.024, 1.92, 10),
    woodLightMat,
  );
  umbrellaPole.position.y = 0.98;
  umbrellaPole.castShadow = true;
  umbrellaRig.add(umbrellaPole);

  const umbrellaTex = createStripedFabricTexture(PALETTE.peachOrange, PALETTE.creamWhite, 8);
  const umbrellaCanopyMat = createToonMaterial({
    color: '#ffffff',
    map: umbrellaTex,
    side: THREE.DoubleSide,
  });
  const canopyCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.86, 0.34, 8, 1, true),
    umbrellaCanopyMat,
  );
  canopyCone.position.y = 1.84;
  canopyCone.castShadow = true;
  umbrellaRig.add(canopyCone);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), creamMat);
  finial.position.y = 2.02;
  umbrellaRig.add(finial);

  umbrellaGroup.add(umbrellaRig);
  group.add(umbrellaGroup);

  // ---------------------------------------------------------------------------
  // 8. Wall-Mounted AC Outdoor Unit ('ac-outdoor-unit') at (x: 2.48, y: 1.55, z: -3.6)
  // Plus spinning 'acFanWheel', falling 'acWaterDrop' (Y: 1.32 -> 0.51), and 'acRippleRing' (Y: 0.512)
  // ---------------------------------------------------------------------------
  const acGroup = new THREE.Group();
  acGroup.name = 'ac-outdoor-unit';
  acGroup.position.set(2.48, 1.55, -3.6);

  // Steel wall mounting brackets bolted to konbini right pier (X = 2.20 -> local x = -0.28)
  for (const bz of [-0.32, 0.32]) {
    acGroup.add(makeBox(0.52, 0.04, 0.045, galvanizedMat, -0.02, -0.32, bz));
    acGroup.add(makeBox(0.04, 0.42, 0.045, galvanizedMat, -0.26, -0.5, bz));
  }

  // Main compressor cabinet
  const acBodyMat = createToonMaterial({ color: '#ece7dc' });
  acGroup.add(makeBox(0.48, 0.6, 0.84, acBodyMat, 0, 0, 0, 'ac-main-cabinet'));
  acGroup.add(makeBox(0.5, 0.035, 0.86, galvanizedMat, 0, 0.31, 0, 'ac-top-lid'));

  // Stacked secondary upper condenser unit
  acGroup.add(makeBox(0.44, 0.48, 0.76, acBodyMat, -0.02, 0.66, 0, 'ac-upper-cabinet'));
  for (const ubz of [-0.28, 0.28]) {
    acGroup.add(makeBox(0.48, 0.035, 0.04, galvanizedMat, -0.04, 0.4, ubz));
  }

  // Recessed dark fan chamber on +X alley face
  const fanChamber = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.04, 20),
    darkMetalMat,
  );
  fanChamber.rotation.z = Math.PI / 2;
  fanChamber.position.set(0.23, 0, 0.12);
  acGroup.add(fanChamber);

  // Parent holder rotates +90 deg around Y so local +Z points +X (out into alley),
  // allowing animationSystem's rotation around Z to spin the fan blades flat!
  const fanMount = new THREE.Group();
  fanMount.position.set(0.245, 0, 0.12);
  fanMount.rotation.y = Math.PI / 2;

  const acFanWheel = new THREE.Group();
  acFanWheel.name = 'ac-fan-wheel';

  const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.025, 12), silverMetalMat);
  fanHub.rotation.x = Math.PI / 2;
  fanHub.userData.noOutline = true;
  acFanWheel.add(fanHub);

  for (let b = 0; b < 3; b++) {
    const bladeHolder = new THREE.Group();
    bladeHolder.rotation.z = (b * Math.PI * 2) / 3;
    const blade = makeBox(0.075, 0.16, 0.012, galvanizedMat, 0, 0.095, 0);
    blade.rotation.y = 0.32;
    blade.userData.noOutline = true;
    bladeHolder.add(blade);
    acFanWheel.add(bladeHolder);
  }
  fanMount.add(acFanWheel);
  acGroup.add(fanMount);

  // Protective circular grille ring over fan
  const fanGrilleRing = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.01, 8, 20), galvanizedMat);
  fanGrilleRing.rotation.y = Math.PI / 2;
  fanGrilleRing.position.set(0.258, 0, 0.12);
  fanGrilleRing.userData.noOutline = true;
  acGroup.add(fanGrilleRing);

  // Wrapped copper refrigerant pipe bundle entering konbini wall
  const copperWrapMat = createToonMaterial({ color: '#d8ccb8' });
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, 0.1, -0.42),
    new THREE.Vector3(-0.08, 0.35, -0.48),
    new THREE.Vector3(-0.28, 0.42, -0.46),
  ]);
  const copperPipe = new THREE.Mesh(
    new THREE.TubeGeometry(pipeCurve, 12, 0.032, 8, false),
    copperWrapMat,
  );
  acGroup.add(copperPipe);

  // Condensate drain hose curving down to nozzle at world (2.85, 1.35, -3.6) -> local (0.37, -0.20, 0)
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.08, -0.3, 0),
    new THREE.Vector3(0.28, -0.34, 0),
    new THREE.Vector3(0.37, -0.2, 0),
  ]);
  const drainHose = new THREE.Mesh(
    new THREE.TubeGeometry(hoseCurve, 12, 0.015, 8, false),
    creamMat,
  );
  drainHose.userData.noOutline = true;
  acGroup.add(drainHose);

  group.add(acGroup);

  // Translucent falling condensate water drop in world space at (2.85, 1.32, -3.6)
  const dropGlassMat = createGlassMaterial({
    tint: '#9be7ff',
    opacity: 0.65,
  });
  dropGlassMat.depthWrite = false;

  const acWaterDrop = new THREE.Group();
  acWaterDrop.name = 'ac-water-drop';
  acWaterDrop.position.set(2.85, 1.32, -3.6);
  const dropBulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), dropGlassMat);
  dropBulb.scale.set(1, 1.35, 1);
  dropBulb.userData.noOutline = true;
  acWaterDrop.add(dropBulb);
  group.add(acWaterDrop);

  // Expanding concentric puddle ripple ring at (2.85, 0.512, -3.6)
  const rippleGeo = new THREE.RingGeometry(0.055, 0.09, 28);
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: PALETTE.foamWhite,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const acRippleRing = new THREE.Mesh(rippleGeo, rippleMat);
  acRippleRing.name = 'ac-ripple-ring';
  acRippleRing.position.set(2.85, 0.512, -3.6);
  acRippleRing.userData.noOutline = true;
  group.add(acRippleRing);

  // ---------------------------------------------------------------------------
  // 9. Wooden Roofed Community Noticeboard ('noticeboard') at (x: 3.9, y: 0.48, z: -2.2)
  // Plastered with 夏祭り, 花火大会, つめたい氷, なつ限定 posters + flutteringPosterCorner
  // ---------------------------------------------------------------------------
  const noticeboardGroup = new THREE.Group();
  noticeboardGroup.name = 'noticeboard';
  noticeboardGroup.position.set(3.9, 0.48, -2.2);
  noticeboardGroup.rotation.y = 0.42;

  // Two cedar posts
  for (const px of [-0.56, 0.56]) {
    noticeboardGroup.add(makeBox(0.08, 1.56, 0.08, woodCedarMat, px, 0.78, 0));
  }
  // Framed cork backing board
  noticeboardGroup.add(makeBox(1.24, 0.84, 0.06, woodCedarMat, 0, 1.08, 0, 'noticeboard-frame'));
  const corkBoard = makeBox(1.12, 0.72, 0.02, woodLightMat, 0, 1.08, 0.032, 'noticeboard-cork');
  corkBoard.userData.noOutline = true;
  noticeboardGroup.add(corkBoard);

  // Pitched wooden rain roof
  const roofLeft = makeBox(1.42, 0.045, 0.24, woodCedarMat, 0, 1.62, 0.09);
  roofLeft.rotation.x = 0.38;
  noticeboardGroup.add(roofLeft);
  const roofRight = makeBox(1.42, 0.045, 0.24, woodCedarMat, 0, 1.62, -0.09);
  roofRight.rotation.x = -0.38;
  noticeboardGroup.add(roofRight);

  // Summer festival & shaved-ice posters
  const matsuriPosterMat = createToonMaterial({
    color: '#ffffff',
    map: createFestivalPosterTexture('matsuri'),
  });
  const hanabiPosterMat = createToonMaterial({
    color: '#ffffff',
    map: createFestivalPosterTexture('hanabi'),
  });
  const kooriPosterMat = createToonMaterial({
    color: '#ffffff',
    map: createFestivalPosterTexture('koori'),
  });
  const natsuPosterMat = createToonMaterial({
    color: '#ffffff',
    map: createFestivalPosterTexture('natsu'),
    side: THREE.DoubleSide,
  });

  const addPinnedPoster = (
    w: number,
    h: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    tiltZ: number,
  ) => {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    poster.position.set(x, y, z);
    poster.rotation.z = tiltZ;
    poster.userData.noOutline = true;
    noticeboardGroup.add(poster);

    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), coralMat);
    pin.position.set(x, y + h * 0.44, z + 0.006);
    pin.userData.noOutline = true;
    noticeboardGroup.add(pin);
  };

  addPinnedPoster(0.34, 0.48, matsuriPosterMat, -0.35, 1.09, 0.046, 0.02);
  addPinnedPoster(0.36, 0.5, hanabiPosterMat, 0.03, 1.07, 0.048, -0.015);
  addPinnedPoster(0.28, 0.34, kooriPosterMat, 0.39, 1.18, 0.046, 0.03);
  addPinnedPoster(0.26, 0.22, natsuPosterMat, 0.38, 0.86, 0.047, -0.02);

  // Fluttering loose corner flap (mounted with rotation.y = PI so +rotation.x lifts OUTWARD away from corkboard!)
  const posterFlapMount = new THREE.Group();
  posterFlapMount.position.set(0.44, 0.89, 0.054);
  posterFlapMount.rotation.set(0, Math.PI, -0.35);

  const flutteringPosterCorner = new THREE.Group();
  flutteringPosterCorner.name = 'fluttering-poster-corner';

  const cornerFlapMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), natsuPosterMat);
  cornerFlapMesh.position.set(0, -0.06, -0.002);
  cornerFlapMesh.userData.noOutline = true;
  flutteringPosterCorner.add(cornerFlapMesh);

  posterFlapMount.add(flutteringPosterCorner);
  noticeboardGroup.add(posterFlapMount);
  group.add(noticeboardGroup);

  // ---------------------------------------------------------------------------
  // 10. Utility Poles, Catenary Overhead Wires & Warm Streetlamp ('utility-poles-wires', 'streetlamp')
  // Main pole at (3.4, 0.48, 0.25), secondary pole at (-10.8, 0.36, -7.8)
  // ---------------------------------------------------------------------------
  const utilityGroup = new THREE.Group();
  utilityGroup.name = 'utility-poles-wires';

  const buildUtilityPole = (
    poleName: string,
    px: number,
    baseY: number,
    pz: number,
    height: number,
    hasTransformer: boolean,
  ): THREE.Group => {
    const pole = new THREE.Group();
    pole.name = poleName;
    pole.position.set(px, baseY, pz);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.135, height, 14),
      concretePoleMat,
    );
    shaft.position.y = height * 0.5;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    pole.add(shaft);

    // Yellow/black caution lower band
    const cautionMat = createToonMaterial({ color: '#ecc846' });
    const cautionSleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.132, 0.138, 0.9, 14),
      cautionMat,
    );
    cautionSleeve.position.y = 0.72;
    pole.add(cautionSleeve);

    // Twin steel crossarms + white porcelain insulators
    for (const armOffset of [height - 0.38, height - 0.82]) {
      pole.add(makeBox(0.06, 0.06, 1.04, galvanizedMat, 0, armOffset, 0));
      for (const iz of [-0.42, 0, 0.42]) {
        const insulator = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.032, 0.085, 8),
          creamMat,
        );
        insulator.position.set(0, armOffset + 0.06, iz);
        insulator.userData.noOutline = true;
        pole.add(insulator);
      }
    }

    if (hasTransformer) {
      const transformer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.54, 14),
        galvanizedMat,
      );
      transformer.position.set(-0.24, height - 1.48, -0.14);
      transformer.castShadow = true;
      pole.add(transformer);
    }

    return pole;
  };

  utilityGroup.add(buildUtilityPole('utility-pole-main', 3.4, 0.48, 0.25, 5.85, true));
  utilityGroup.add(buildUtilityPole('utility-pole-secondary', -10.8, 0.36, -7.8, 5.75, false));

  // Warm curved gooseneck streetlamp ('streetlamp') mounted on main pole
  const streetlampGroup = new THREE.Group();
  streetlampGroup.name = 'streetlamp';
  streetlampGroup.position.set(3.4, 4.95, 0.25);

  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.26, 0.22, 0.28),
    new THREE.Vector3(-0.54, 0.12, 0.56),
  ]);
  const lampPipe = new THREE.Mesh(
    new THREE.TubeGeometry(armCurve, 14, 0.022, 8, false),
    galvanizedMat,
  );
  streetlampGroup.add(lampPipe);

  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.13, 16), creamMat);
  lampShade.position.set(-0.54, 0.09, 0.56);
  lampShade.castShadow = true;
  streetlampGroup.add(lampShade);

  const streetlampBulbMat = createEmissiveLightboxMaterial({
    color: '#ffe1a6',
    intensity: 1.45,
  });
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.082, 12, 10), streetlampBulbMat);
  lampBulb.position.set(-0.54, 0.02, 0.56);
  lampBulb.userData.noOutline = true;
  streetlampGroup.add(lampBulb);

  const streetlampLight = new THREE.PointLight('#ffcc82', 2.4, 11.5, 1.8);
  streetlampLight.position.set(-0.54, -0.14, 0.56);
  streetlampGroup.add(streetlampLight);

  utilityGroup.add(streetlampGroup);

  // Small rooftop service weatherhead risers on konbini edge so service wires terminate cleanly
  for (const [mx, mz] of [
    [1.85, -1.25],
    [-6.85, -6.6],
  ]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 8), galvanizedMat);
    mast.position.set(mx, 4.52, mz);
    utilityGroup.add(mast);
  }

  // 4 Catenary overhead wires strictly inside [-11.5, 11.5]
  const wireDefs: Array<[THREE.Vector3, THREE.Vector3, number, string]> = [
    [
      new THREE.Vector3(3.4, 6.01, -0.15),
      new THREE.Vector3(-10.8, 5.78, -8.18),
      0.46,
      'overhead-wire-high-a',
    ],
    [
      new THREE.Vector3(3.4, 6.01, 0.65),
      new THREE.Vector3(-10.8, 5.78, -7.42),
      0.48,
      'overhead-wire-high-b',
    ],
    [
      new THREE.Vector3(3.4, 5.56, 0.18),
      new THREE.Vector3(1.85, 4.68, -1.25),
      0.22,
      'overhead-wire-drop-front',
    ],
    [
      new THREE.Vector3(-10.8, 5.34, -7.62),
      new THREE.Vector3(-6.85, 4.68, -6.6),
      0.28,
      'overhead-wire-drop-rear',
    ],
  ];

  for (const [wStart, wEnd, sag, wName] of wireDefs) {
    const wireObj = createCatenaryWire(wStart, wEnd, sag, wireInkMat, wName);
    overheadWires.push(wireObj);
    utilityGroup.add(wireObj);
  }

  group.add(utilityGroup);

  // ---------------------------------------------------------------------------
  // 11. Seaside Alley Tree ('alley-tree') at (x: 3.7, z: -6.2, y: 0.48)
  // Crown radius <= 1.25, cel-shaded rounded leaf clusters ('treeFoliageClusters')
  // ---------------------------------------------------------------------------
  const treeGroup = new THREE.Group();
  treeGroup.name = 'alley-tree';
  treeGroup.position.set(3.7, 0.48, -6.2);

  // Stone tree-pit collar & soil
  const planterRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.5, 0.11, 16),
    concretePoleMat,
  );
  planterRing.position.y = 0.055;
  treeGroup.add(planterRing);

  const soilMat = createToonMaterial({ color: '#5c4636' });
  const soilDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 14), soilMat);
  soilDisc.position.y = 0.058;
  soilDisc.userData.noOutline = true;
  treeGroup.add(soilDisc);

  // Curved organic trunk + forked branches
  const trunkMat = createToonMaterial({ color: '#6e4e38' });
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.06, 0),
    new THREE.Vector3(0.06, 0.85, 0.04),
    new THREE.Vector3(-0.04, 1.65, -0.02),
    new THREE.Vector3(0.02, 2.25, 0.03),
  ]);
  const mainTrunk = new THREE.Mesh(
    new THREE.TubeGeometry(trunkCurve, 14, 0.12, 10, false),
    trunkMat,
  );
  mainTrunk.castShadow = true;
  mainTrunk.receiveShadow = true;
  treeGroup.add(mainTrunk);

  const branchSpecs: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(-0.02, 1.58, 0), new THREE.Vector3(-0.46, 2.15, 0.22)],
    [new THREE.Vector3(0.01, 1.68, 0), new THREE.Vector3(0.48, 2.2, -0.24)],
    [new THREE.Vector3(0, 1.75, 0), new THREE.Vector3(0.08, 2.38, 0.36)],
  ];
  for (const [b0, b1] of branchSpecs) {
    const bMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(b0, b1), 6, 0.055, 8, false),
      trunkMat,
    );
    bMesh.castShadow = true;
    treeGroup.add(bMesh);
  }

  // Cel-shaded coastal leaf clusters (each wrapped in its own sway pivot group)
  const leafDarkMat = createToonMaterial({ color: '#469e6d' });
  const leafMidMat = createToonMaterial({ color: '#5bbd86' });
  const leafLightMat = createToonMaterial({ color: '#78d59a' });

  const clusterConfigs: Array<{
    pos: [number, number, number];
    radius: number;
    mat: THREE.Material;
  }> = [
    { pos: [0, 2.68, 0], radius: 0.62, mat: leafLightMat },
    { pos: [-0.48, 2.26, 0.24], radius: 0.52, mat: leafMidMat },
    { pos: [0.5, 2.3, -0.22], radius: 0.5, mat: leafMidMat },
    { pos: [0.12, 2.38, 0.46], radius: 0.46, mat: leafLightMat },
    { pos: [-0.18, 2.18, -0.44], radius: 0.48, mat: leafDarkMat },
  ];

  clusterConfigs.forEach((cfg, idx) => {
    const clusterPivot = new THREE.Group();
    clusterPivot.name = `tree-foliage-cluster-${idx}`;
    clusterPivot.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(cfg.radius, 2), cfg.mat);
    puff.scale.set(1.06, 0.82, 1.04);
    puff.castShadow = true;
    puff.receiveShadow = true;
    clusterPivot.add(puff);

    treeFoliageClusters.push(clusterPivot);
    treeGroup.add(clusterPivot);
  });

  group.add(treeGroup);

  // Apply crisp anime ink outlines across solid exterior miniature props
  applyOutlinesToHierarchy(group, 0.015);

  return {
    group,
    acFanWheel,
    acWaterDrop,
    acRippleRing,
    flutteringPosterCorner,
    treeFoliageClusters,
    overheadWires,
    vendingGlowMaterials,
    streetlampLight,
  };
}
