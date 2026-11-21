import * as THREE from 'three';
import { PALETTE } from '../config/paletteAndBounds';
import {
  createKonbiniSignTexture,
  createPylonSignTexture,
  createStripedFabricTexture,
} from '../rendering/canvasTextures';
import {
  applyOutlinesToHierarchy,
  createEmissiveLightboxMaterial,
  createGlassMaterial,
  createToonMaterial,
} from '../rendering/toonMaterials';

export interface StoreStructureResult {
  group: THREE.Group; // name: 'konbini-structure'
  slidingDoorLeft: THREE.Object3D; // closed X = -3.05, slides -X up to 0.95
  slidingDoorRight: THREE.Object3D; // closed X = -1.95, slides +X up to 0.95
  awningValance: THREE.Object3D;
  windChimePendulum: THREE.Object3D;
  signLightboxMaterials: THREE.MeshStandardMaterial[];
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

function createWindowGlassPane(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  name: string,
): THREE.Mesh {
  const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  pane.position.set(x, y, z);
  pane.name = name;
  pane.castShadow = false;
  pane.receiveShadow = false;
  pane.userData.noOutline = true;
  pane.renderOrder = 2;
  return pane;
}

export function buildStoreStructure(): StoreStructureResult {
  const group = new THREE.Group();
  group.name = 'konbini-structure';

  const signLightboxMaterials: THREE.MeshStandardMaterial[] = [];

  // Core architectural materials
  const wallMat = createToonMaterial({ color: PALETTE.warmWall });
  const creamTrimMat = createToonMaterial({ color: PALETTE.creamWhite });
  const seaSaltMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const seaSaltLightMat = createToonMaterial({ color: PALETTE.seaSaltLight });
  const mintMat = createToonMaterial({ color: PALETTE.mintGreen });
  const peachMat = createToonMaterial({ color: PALETTE.peachOrange });
  const coralMat = createToonMaterial({ color: PALETTE.coralPink });
  const darkMullionMat = createToonMaterial({ color: '#2b3346' });
  const metalCopingMat = createToonMaterial({ color: '#607188' });
  const roofDeckMat = createToonMaterial({ color: '#dfd8cb' });
  const concretePlinthMat = createToonMaterial({ color: '#cdc7bc' });

  const storefrontGlassMat = createGlassMaterial({
    tint: '#e9f8ff',
    opacity: 0.13,
  });
  storefrontGlassMat.depthWrite = false;

  const doorGlassMat = createGlassMaterial({
    tint: '#eefaff',
    opacity: 0.14,
  });
  doorGlassMat.depthWrite = false;

  // ---------------------------------------------------------------------------
  // 1. Konbini Building Shell ('konbini-building')
  // Footprint: X in [-7.2, 2.2] (width 9.4, center -2.5), Z in [-7.8, -0.6] (depth 7.2, center -4.2)
  // Floor top Y = 0.55, ceiling soffit Y = 3.75, parapet top Y = 4.35
  // ---------------------------------------------------------------------------
  const buildingGroup = new THREE.Group();
  buildingGroup.name = 'konbini-building';

  // Structural floor slab (Y in [0.515, 0.55], interior tiles sit at 0.56)
  buildingGroup.add(
    makeBox(9.4, 0.035, 7.2, concretePlinthMat, -2.5, 0.5325, -4.2, 'building-floor-slab'),
  );

  // Back wall (Z in [-7.80, -7.64], strictly outside interior Z = -7.60)
  buildingGroup.add(
    makeBox(9.4, 3.2, 0.16, wallMat, -2.5, 2.15, -7.72, 'building-back-wall'),
  );
  // Exterior back lower tile dado
  buildingGroup.add(
    makeBox(9.42, 0.48, 0.02, seaSaltMat, -2.5, 0.79, -7.805, 'building-back-dado'),
  );

  // Left parking-side wall (X in [-7.20, -7.04], strictly outside interior X = -7.00)
  buildingGroup.add(
    makeBox(0.16, 3.2, 7.2, wallMat, -7.12, 2.15, -4.2, 'building-left-wall'),
  );
  buildingGroup.add(
    makeBox(0.025, 0.48, 7.22, seaSaltMat, -7.205, 0.79, -4.2, 'building-left-dado'),
  );
  // Left wall architectural details (electric meter box, conduit pipe, exhaust louver)
  buildingGroup.add(
    makeBox(0.08, 0.42, 0.32, metalCopingMat, -7.23, 1.72, -5.35, 'electric-meter-box'),
  );
  const meterConduit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 2.15, 8),
    metalCopingMat,
  );
  meterConduit.position.set(-7.22, 2.85, -5.35);
  buildingGroup.add(meterConduit);
  buildingGroup.add(
    makeBox(0.05, 0.34, 0.46, darkMullionMat, -7.22, 2.95, -3.1, 'side-exhaust-louver'),
  );

  // Right alley wall (X in [2.04, 2.20])
  // Solid rear section Z in [-7.80, -5.58]
  buildingGroup.add(
    makeBox(0.16, 3.2, 2.22, wallMat, 2.12, 2.15, -6.69, 'building-right-rear-wall'),
  );
  buildingGroup.add(
    makeBox(0.025, 0.48, 2.24, seaSaltMat, 2.205, 0.79, -6.69, 'building-right-rear-dado'),
  );
  // Slim structural pier at Z in [-3.90, -3.30] (backing the wall-mounted AC unit at z = -3.6)
  buildingGroup.add(
    makeBox(0.16, 3.2, 0.6, wallMat, 2.12, 2.15, -3.6, 'building-right-ac-pier'),
  );
  // Front-right corner pilaster Z in [-0.76, -0.60]
  buildingGroup.add(
    makeBox(0.16, 3.2, 0.16, wallMat, 2.12, 2.15, -0.68, 'building-front-right-pilaster'),
  );
  // Right window low sill kickwalls (Y in [0.55, 0.72]) & upper header spandrel (Y in [3.42, 3.75])
  buildingGroup.add(
    makeBox(0.16, 0.17, 1.68, seaSaltMat, 2.12, 0.635, -4.74, 'right-rear-window-sill'),
  );
  buildingGroup.add(
    makeBox(0.16, 0.17, 2.54, seaSaltMat, 2.12, 0.635, -2.03, 'right-front-window-sill'),
  );
  buildingGroup.add(
    makeBox(0.16, 0.33, 4.98, wallMat, 2.12, 3.585, -3.09, 'right-window-header'),
  );

  // Front wall framing (Z in [-0.74, -0.60])
  // Front-left corner pilaster X in [-7.20, -6.92]
  buildingGroup.add(
    makeBox(0.28, 3.2, 0.16, wallMat, -7.06, 2.15, -0.68, 'building-front-left-pilaster'),
  );
  // Vending / storefront divider pilaster X in [-4.72, -4.52]
  buildingGroup.add(
    makeBox(0.2, 3.2, 0.16, wallMat, -4.62, 2.15, -0.68, 'building-vending-pilaster'),
  );
  // Lower wall behind left vending bay (Y in [0.55, 1.15], X in [-6.92, -4.72])
  buildingGroup.add(
    makeBox(2.2, 0.6, 0.14, wallMat, -5.82, 0.85, -0.68, 'front-vending-lower-wall'),
  );
  // Low storefront window sills left and right of automatic doors (Y in [0.55, 0.72])
  buildingGroup.add(
    makeBox(0.9, 0.17, 0.15, seaSaltMat, -4.07, 0.635, -0.675, 'front-left-window-sill'),
  );
  buildingGroup.add(
    makeBox(3.42, 0.17, 0.15, seaSaltMat, 0.33, 0.635, -0.675, 'front-right-window-sill'),
  );
  // Upper front lintel header across entire front (Y in [3.42, 3.75])
  buildingGroup.add(
    makeBox(9.4, 0.33, 0.16, wallMat, -2.5, 3.585, -0.68, 'front-upper-header'),
  );

  // Roof structure & parapet (Y in [3.75, 4.35])
  buildingGroup.add(
    makeBox(9.4, 0.27, 7.2, wallMat, -2.5, 3.885, -4.2, 'building-roof-slab'),
  );
  buildingGroup.add(
    makeBox(9.0, 0.03, 6.8, roofDeckMat, -2.5, 4.035, -4.2, 'building-roof-membrane'),
  );

  // 4 Perimeter parapet walls (Y in [4.02, 4.31]) + metal coping flashing (Y in [4.31, 4.35] -> exact max Y = 4.35)
  buildingGroup.add(makeBox(9.4, 0.29, 0.2, wallMat, -2.5, 4.165, -0.7, 'parapet-front'));
  buildingGroup.add(makeBox(9.4, 0.29, 0.2, wallMat, -2.5, 4.165, -7.7, 'parapet-back'));
  buildingGroup.add(makeBox(0.2, 0.29, 6.8, wallMat, -7.1, 4.165, -4.2, 'parapet-left'));
  buildingGroup.add(makeBox(0.2, 0.29, 6.8, wallMat, 2.1, 4.165, -4.2, 'parapet-right'));

  buildingGroup.add(makeBox(9.42, 0.04, 0.23, metalCopingMat, -2.5, 4.33, -0.7, 'coping-front'));
  buildingGroup.add(makeBox(9.42, 0.04, 0.23, metalCopingMat, -2.5, 4.33, -7.7, 'coping-back'));
  buildingGroup.add(makeBox(0.23, 0.04, 6.8, metalCopingMat, -7.1, 4.33, -4.2, 'coping-left'));
  buildingGroup.add(makeBox(0.23, 0.04, 6.8, metalCopingMat, 2.1, 4.33, -4.2, 'coping-right'));

  // Low-profile collector rooftop details (strictly <= Y = 4.34)
  buildingGroup.add(
    makeBox(1.15, 0.22, 0.95, creamTrimMat, -5.2, 4.15, -5.6, 'rooftop-access-hatch'),
  );
  buildingGroup.add(
    makeBox(1.21, 0.04, 1.01, metalCopingMat, -5.2, 4.28, -5.6, 'rooftop-hatch-lid'),
  );
  for (const vx of [-2.4, 0.2]) {
    const ventBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.19, 0.18, 12),
      metalCopingMat,
    );
    ventBase.position.set(vx, 4.13, -5.8);
    buildingGroup.add(ventBase);
    const ventCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.09, 12),
      creamTrimMat,
    );
    ventCap.position.set(vx, 4.26, -5.8);
    buildingGroup.add(ventCap);
  }

  // Rear rainwater downspout pipe
  const downspout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 3.65, 10),
    creamTrimMat,
  );
  downspout.position.set(-6.85, 2.38, -7.83);
  buildingGroup.add(downspout);

  group.add(buildingGroup);

  // ---------------------------------------------------------------------------
  // 2. Crystal-Clear Floor-to-Ceiling Storefront & Side Windows ('storefront-windows')
  // ---------------------------------------------------------------------------
  const windowsGroup = new THREE.Group();
  windowsGroup.name = 'storefront-windows';

  // Doorframe stiles & automatic sensor transom header (gap X in [-3.60, -1.40], height Y in [0.55, 2.94])
  windowsGroup.add(makeBox(0.06, 2.87, 0.09, darkMullionMat, -3.62, 1.985, -0.63, 'door-jamb-left'));
  windowsGroup.add(makeBox(0.06, 2.87, 0.09, darkMullionMat, -1.38, 1.985, -0.63, 'door-jamb-right'));
  windowsGroup.add(makeBox(2.34, 0.11, 0.13, darkMullionMat, -2.5, 2.975, -0.59, 'auto-door-header'));
  // Stainless threshold rail
  const thresholdMesh = makeBox(2.24, 0.012, 0.12, metalCopingMat, -2.5, 0.556, -0.59, 'door-threshold');
  thresholdMesh.userData.noOutline = true;
  windowsGroup.add(thresholdMesh);

  // Tiny cyan-green sensor indicator lens on auto-door header
  const sensorMat = createEmissiveLightboxMaterial({
    color: PALETTE.softNeonCyan,
    intensity: 0.9,
  });
  const sensorDot = makeBox(0.14, 0.028, 0.02, sensorMat, -2.5, 2.98, -0.52, 'auto-door-sensor');
  sensorDot.userData.noOutline = true;
  windowsGroup.add(sensorDot);

  // Slim mullions for front & right panoramic windows
  windowsGroup.add(makeBox(0.05, 2.7, 0.07, darkMullionMat, -4.52, 2.07, -0.64, 'mullion-front-far-left'));
  windowsGroup.add(makeBox(0.05, 2.7, 0.07, darkMullionMat, 0.35, 2.07, -0.64, 'mullion-front-right-mid'));
  windowsGroup.add(makeBox(0.05, 2.7, 0.07, darkMullionMat, 2.03, 2.07, -0.64, 'mullion-front-right-end'));
  // Top/bottom slim aluminum window rails along front
  windowsGroup.add(makeBox(0.88, 0.045, 0.07, darkMullionMat, -4.07, 0.74, -0.64, 'rail-front-left-bot'));
  windowsGroup.add(makeBox(0.88, 0.045, 0.07, darkMullionMat, -4.07, 3.4, -0.64, 'rail-front-left-top'));
  windowsGroup.add(makeBox(3.4, 0.045, 0.07, darkMullionMat, 0.33, 0.74, -0.64, 'rail-front-right-bot'));
  windowsGroup.add(makeBox(3.4, 0.045, 0.07, darkMullionMat, 0.33, 3.4, -0.64, 'rail-front-right-top'));

  // Right alley window mullions & rails
  windowsGroup.add(makeBox(0.07, 2.7, 0.05, darkMullionMat, 2.12, 2.07, -2.03, 'mullion-side-front-mid'));
  windowsGroup.add(makeBox(0.07, 0.045, 2.52, darkMullionMat, 2.12, 0.74, -2.03, 'rail-side-front-bot'));
  windowsGroup.add(makeBox(0.07, 0.045, 2.52, darkMullionMat, 2.12, 3.4, -2.03, 'rail-side-front-top'));
  windowsGroup.add(makeBox(0.07, 0.045, 1.66, darkMullionMat, 2.12, 0.74, -4.74, 'rail-side-rear-bot'));
  windowsGroup.add(makeBox(0.07, 0.045, 1.66, darkMullionMat, 2.12, 3.4, -4.74, 'rail-side-rear-top'));

  // Crystal-clear glass panes (all marked noOutline = true, opacity <= 0.14)
  // 1) Upper window behind drink bar / above vending bay
  windowsGroup.add(
    createWindowGlassPane(2.16, 2.22, 0.022, storefrontGlassMat, -5.82, 2.28, -0.65, 'glass-front-drinkbar'),
  );
  // 2) Front window left of sliding doors
  windowsGroup.add(
    createWindowGlassPane(0.84, 2.62, 0.022, storefrontGlassMat, -4.07, 2.07, -0.65, 'glass-front-left'),
  );
  // 3) Transom glass above automatic doors
  windowsGroup.add(
    createWindowGlassPane(2.18, 0.38, 0.022, storefrontGlassMat, -2.5, 3.21, -0.65, 'glass-door-transom'),
  );
  // 4) Front panoramic windows right of doors (framing Summer Limited Display)
  windowsGroup.add(
    createWindowGlassPane(1.66, 2.62, 0.022, storefrontGlassMat, -0.51, 2.07, -0.65, 'glass-front-summer-a'),
  );
  windowsGroup.add(
    createWindowGlassPane(1.62, 2.62, 0.022, storefrontGlassMat, 1.19, 2.07, -0.65, 'glass-front-summer-b'),
  );
  // 5) Right alley panoramic windows (framing Magazine Rack & Bento Chiller)
  windowsGroup.add(
    createWindowGlassPane(0.022, 2.62, 1.21, storefrontGlassMat, 2.12, 2.07, -1.39, 'glass-side-front-a'),
  );
  windowsGroup.add(
    createWindowGlassPane(0.022, 2.62, 1.21, storefrontGlassMat, 2.12, 2.07, -2.67, 'glass-side-front-b'),
  );
  windowsGroup.add(
    createWindowGlassPane(0.022, 2.62, 1.62, storefrontGlassMat, 2.12, 2.07, -4.74, 'glass-side-bento'),
  );

  group.add(windowsGroup);

  // ---------------------------------------------------------------------------
  // 3. Double Automatic Sliding Glass Doors ('sliding-door-left' & 'sliding-door-right')
  // Closed positions: X = -3.05 and X = -1.95, Z = -0.58
  // ---------------------------------------------------------------------------
  const buildSlidingDoorPanel = (name: string, closedX: number): THREE.Group => {
    const door = new THREE.Group();
    door.name = name;
    door.position.set(closedX, 0, -0.58);
    door.userData.closedX = closedX;

    const panelW = 1.1;
    const panelBottom = 0.56;
    const panelTop = 2.91;
    const panelH = panelTop - panelBottom;
    const midY = (panelBottom + panelTop) * 0.5;

    // Slim aluminum stiles & rails
    door.add(makeBox(0.042, panelH, 0.04, darkMullionMat, -panelW * 0.5 + 0.021, midY, 0));
    door.add(makeBox(0.042, panelH, 0.04, darkMullionMat, panelW * 0.5 - 0.021, midY, 0));
    door.add(makeBox(panelW, 0.05, 0.04, darkMullionMat, 0, panelTop - 0.025, 0));
    door.add(makeBox(panelW, 0.11, 0.042, metalCopingMat, 0, panelBottom + 0.055, 0));

    // Subtle mint & peach safety decal ribbon across middle so sliding motion reads clearly
    const decalRibbon = makeBox(panelW - 0.09, 0.032, 0.026, mintMat, 0, 1.42, 0);
    decalRibbon.userData.noOutline = true;
    door.add(decalRibbon);
    const decalSub = makeBox(panelW - 0.09, 0.018, 0.026, peachMat, 0, 1.38, 0);
    decalSub.userData.noOutline = true;
    door.add(decalSub);

    // Clear glass pane
    door.add(
      createWindowGlassPane(
        panelW - 0.084,
        panelH - 0.16,
        0.018,
        doorGlassMat,
        0,
        midY + 0.03,
        0,
        `${name}-glass`,
      ),
    );

    return door;
  };

  const slidingDoorLeft = buildSlidingDoorPanel('sliding-door-left', -3.05);
  const slidingDoorRight = buildSlidingDoorPanel('sliding-door-right', -1.95);
  group.add(slidingDoorLeft);
  group.add(slidingDoorRight);

  // ---------------------------------------------------------------------------
  // 4. Original Fascia Lightbox Signboard ('konbini-signboard') -> 'うみかぜマート'
  // Wraps front (Z = -0.52), right alley, and left corner at Y in [3.65, 4.22]
  // ---------------------------------------------------------------------------
  const signboardGroup = new THREE.Group();
  signboardGroup.name = 'konbini-signboard';

  const konbiniSignTex = createKonbiniSignTexture();
  const frontSignGlowMat = createEmissiveLightboxMaterial({
    color: '#fffdf7',
    map: konbiniSignTex,
    intensity: 0.9,
  });
  const sideSignGlowMat = createEmissiveLightboxMaterial({
    color: '#fffcf2',
    map: konbiniSignTex,
    intensity: 0.84,
  });
  const cornerRibbonGlowMat = createEmissiveLightboxMaterial({
    color: PALETTE.creamWhite,
    intensity: 0.78,
  });
  signLightboxMaterials.push(frontSignGlowMat, sideSignGlowMat, cornerRibbonGlowMat);

  // Front fascia housing & coastal 3-color trim bars (X in [-7.28, 2.28], Y in [3.65, 4.22])
  signboardGroup.add(makeBox(9.56, 0.57, 0.14, creamTrimMat, -2.5, 3.935, -0.52, 'fascia-front-box'));
  signboardGroup.add(makeBox(9.58, 0.075, 0.16, seaSaltMat, -2.5, 4.18, -0.515, 'fascia-front-band-blue'));
  signboardGroup.add(makeBox(9.58, 0.055, 0.16, mintMat, -2.5, 3.73, -0.515, 'fascia-front-band-mint'));
  signboardGroup.add(makeBox(9.58, 0.055, 0.16, peachMat, -2.5, 3.675, -0.515, 'fascia-front-band-peach'));

  // Full-width warm cream glowing fascia ribbon + natural ~4.4:1 centerpiece kana signboard
  const frontRibbonBg = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 0.36), cornerRibbonGlowMat);
  frontRibbonBg.position.set(-2.5, 3.94, -0.444);
  frontRibbonBg.name = 'fascia-front-ribbon';
  frontRibbonBg.userData.noOutline = true;
  signboardGroup.add(frontRibbonBg);

  const frontPlaqueBezel = makeBox(1.88, 0.43, 0.014, creamTrimMat, -2.5, 3.94, -0.442);
  frontPlaqueBezel.userData.noOutline = true;
  signboardGroup.add(frontPlaqueBezel);

  const frontSignFace = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.4), frontSignGlowMat);
  frontSignFace.position.set(-2.5, 3.94, -0.433);
  frontSignFace.name = 'fascia-front-kana-panel';
  frontSignFace.userData.noOutline = true;
  signboardGroup.add(frontSignFace);

  // Right alley fascia wrap (Z in [-5.85, -0.45], X = 2.24)
  signboardGroup.add(makeBox(0.13, 0.57, 5.4, creamTrimMat, 2.24, 3.935, -3.15, 'fascia-right-box'));
  signboardGroup.add(makeBox(0.15, 0.075, 5.42, seaSaltMat, 2.245, 4.18, -3.15, 'fascia-right-band-blue'));
  signboardGroup.add(makeBox(0.15, 0.055, 5.42, mintMat, 2.245, 3.73, -3.15, 'fascia-right-band-mint'));
  signboardGroup.add(makeBox(0.15, 0.055, 5.42, peachMat, 2.245, 3.675, -3.15, 'fascia-right-band-peach'));

  const rightRibbonBg = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.35), cornerRibbonGlowMat);
  rightRibbonBg.rotation.y = Math.PI / 2;
  rightRibbonBg.position.set(2.312, 3.94, -3.18);
  rightRibbonBg.name = 'fascia-right-ribbon';
  rightRibbonBg.userData.noOutline = true;
  signboardGroup.add(rightRibbonBg);

  const rightPlaqueBezel = makeBox(0.014, 0.42, 1.78, creamTrimMat, 2.314, 3.94, -3.18);
  rightPlaqueBezel.userData.noOutline = true;
  signboardGroup.add(rightPlaqueBezel);

  const rightSignFace = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 0.39), sideSignGlowMat);
  rightSignFace.rotation.y = Math.PI / 2;
  rightSignFace.position.set(2.323, 3.94, -3.18);
  rightSignFace.name = 'fascia-right-kana-panel';
  rightSignFace.userData.noOutline = true;
  signboardGroup.add(rightSignFace);

  // Left corner fascia wrap (Z in [-3.45, -0.45], X = -7.24)
  signboardGroup.add(makeBox(0.13, 0.57, 3.0, creamTrimMat, -7.24, 3.935, -1.95, 'fascia-left-box'));
  signboardGroup.add(makeBox(0.15, 0.075, 3.02, seaSaltMat, -7.245, 4.18, -1.95, 'fascia-left-band-blue'));
  signboardGroup.add(makeBox(0.15, 0.055, 3.02, mintMat, -7.245, 3.73, -1.95, 'fascia-left-band-mint'));
  signboardGroup.add(makeBox(0.15, 0.055, 3.02, peachMat, -7.245, 3.675, -1.95, 'fascia-left-band-peach'));

  const leftSignFace = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.34), cornerRibbonGlowMat);
  leftSignFace.rotation.y = -Math.PI / 2;
  leftSignFace.position.set(-7.312, 3.94, -1.98);
  leftSignFace.userData.noOutline = true;
  signboardGroup.add(leftSignFace);

  group.add(signboardGroup);

  // ---------------------------------------------------------------------------
  // 5. Street-Corner Free-Standing Pylon Sign ('pylon-sign')
  // Centered at (x: -7.1, z: 0.15), top Y = 5.38
  // ---------------------------------------------------------------------------
  const pylonGroup = new THREE.Group();
  pylonGroup.name = 'pylon-sign';
  pylonGroup.position.set(-7.1, 0, 0.15);

  // Concrete base pedestal
  pylonGroup.add(makeBox(0.78, 0.28, 0.42, concretePlinthMat, 0, 0.66, 0, 'pylon-pedestal'));

  // Twin vertical steel poles
  for (const px of [-0.22, 0.22]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 4.5, 12), seaSaltMat);
    pole.position.set(px, 3.02, 0);
    pole.castShadow = true;
    pole.receiveShadow = true;
    pylonGroup.add(pole);
  }

  // Main upper illuminated pylon cabinet (Y in [3.95, 5.36])
  pylonGroup.add(makeBox(1.04, 1.4, 0.22, creamTrimMat, 0, 4.65, 0, 'pylon-cabinet'));
  pylonGroup.add(makeBox(1.08, 0.08, 0.25, seaSaltMat, 0, 5.34, 0, 'pylon-top-cap'));
  pylonGroup.add(makeBox(1.08, 0.06, 0.25, peachMat, 0, 3.96, 0, 'pylon-bottom-trim'));

  const pylonTex = createPylonSignTexture();
  const pylonGlowMat = createEmissiveLightboxMaterial({
    color: '#fffdf8',
    map: pylonTex,
    intensity: 0.92,
  });
  signLightboxMaterials.push(pylonGlowMat);

  for (const dir of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 1.24), pylonGlowMat);
    face.position.set(0, 4.65, dir * 0.114);
    if (dir < 0) {
      face.rotation.y = Math.PI;
    }
    face.userData.noOutline = true;
    pylonGroup.add(face);
  }

  // Lower 24H coastal sub-sign panel (Y in [3.42, 3.80])
  pylonGroup.add(makeBox(0.86, 0.36, 0.18, mintMat, 0, 3.6, 0, 'pylon-subsign-box'));
  const subGlowMat = createEmissiveLightboxMaterial({
    color: '#ffe9be',
    intensity: 0.78,
  });
  signLightboxMaterials.push(subGlowMat);
  for (const dir of [1, -1]) {
    const subFace = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.24), subGlowMat);
    subFace.position.set(0, 3.6, dir * 0.094);
    if (dir < 0) {
      subFace.rotation.y = Math.PI;
    }
    subFace.userData.noOutline = true;
    pylonGroup.add(subFace);
  }

  group.add(pylonGroup);

  // ---------------------------------------------------------------------------
  // 6. Mint/Cream Striped Fabric Awning ('striped-awning') + Swayable 'awningValance'
  // Spans X in [-3.76, 2.12] (center -0.82, width 5.88), Z from -0.56 to +0.25 at Y ~ 3.45
  // ---------------------------------------------------------------------------
  const awningGroup = new THREE.Group();
  awningGroup.name = 'striped-awning';

  const stripedTex = createStripedFabricTexture(PALETTE.mintGreen, PALETTE.creamWhite, 16);
  const awningFabricMat = createToonMaterial({
    color: '#ffffff',
    map: stripedTex,
  });

  // Wall ledger bar
  awningGroup.add(makeBox(5.92, 0.07, 0.07, darkMullionMat, -0.82, 3.57, -0.56, 'awning-ledger'));

  // Sloped main fabric canopy
  const canopySlopeGroup = new THREE.Group();
  canopySlopeGroup.position.set(-0.82, 3.475, -0.155);
  canopySlopeGroup.rotation.x = 0.23;
  canopySlopeGroup.add(makeBox(5.88, 0.04, 0.84, awningFabricMat, 0, 0, 0, 'awning-canopy-slope'));
  awningGroup.add(canopySlopeGroup);

  // Metal support struts under awning
  for (const sx of [-3.65, -1.35, 0.35, 2.02]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.88, 8), darkMullionMat);
    strut.position.set(sx, 3.28, -0.18);
    strut.rotation.x = 1.15;
    awningGroup.add(strut);
  }

  // Front roller tube at Z = 0.25, Y = 3.38
  const rollerBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 5.9, 10),
    darkMullionMat,
  );
  rollerBar.rotation.z = Math.PI / 2;
  rollerBar.position.set(-0.82, 3.38, 0.25);
  awningGroup.add(rollerBar);

  // Swayable front awningValance (pivoted along top edge at Y = 3.38, Z = 0.25, initial rotation 0)
  const awningValance = new THREE.Group();
  awningValance.name = 'awning-valance';
  awningValance.position.set(-0.82, 3.38, 0.25);

  awningValance.add(makeBox(5.88, 0.19, 0.025, awningFabricMat, 0, -0.095, 0, 'valance-main-strip'));
  const valancePiping = makeBox(5.89, 0.028, 0.03, peachMat, 0, -0.195, 0, 'valance-peach-hem');
  awningValance.add(valancePiping);

  // Cute scalloped tabs along bottom edge
  const tabCount = 16;
  const tabSpan = 5.84 / tabCount;
  for (let i = 0; i < tabCount; i++) {
    const tx = -2.92 + (i + 0.5) * tabSpan;
    const tabMat = i % 2 === 0 ? mintMat : creamTrimMat;
    const tab = new THREE.Mesh(new THREE.CylinderGeometry(tabSpan * 0.44, tabSpan * 0.44, 0.024, 12), tabMat);
    tab.rotation.x = Math.PI / 2;
    tab.scale.set(1, 1, 0.42);
    tab.position.set(tx, -0.2, 0);
    tab.userData.noOutline = true;
    awningValance.add(tab);
  }

  awningGroup.add(awningValance);
  group.add(awningGroup);

  // ---------------------------------------------------------------------------
  // 7. Hanging Japanese Glass Wind Chime ('wind-chime' / 風鈴) at (1.85, 3.25, 0.05)
  // ---------------------------------------------------------------------------
  const windChimeGroup = new THREE.Group();
  windChimeGroup.name = 'wind-chime';
  windChimeGroup.position.set(1.85, 3.25, 0.05);

  // Top suspension cord to awning eave
  const topCord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), darkMullionMat);
  topCord.position.set(0, 0.1, 0);
  topCord.userData.noOutline = true;
  windChimeGroup.add(topCord);

  // Translucent glass fūrin bell dome
  const chimeGlassMat = createGlassMaterial({
    tint: '#b8eef8',
    opacity: 0.34,
  });
  chimeGlassMat.depthWrite = false;
  chimeGlassMat.side = THREE.DoubleSide;

  const bellDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.68),
    chimeGlassMat,
  );
  bellDome.name = 'wind-chime-dome';
  bellDome.userData.noOutline = true;
  windChimeGroup.add(bellDome);

  // Painted wave accent band around bell rim
  const bellRing = new THREE.Mesh(new THREE.TorusGeometry(0.079, 0.008, 8, 20), coralMat);
  bellRing.rotation.x = Math.PI / 2;
  bellRing.position.set(0, -0.036, 0);
  bellRing.userData.noOutline = true;
  windChimeGroup.add(bellRing);

  // Swayable pendulum (clapper + cord + paper tanzaku strip)
  const windChimePendulum = new THREE.Group();
  windChimePendulum.name = 'wind-chime-pendulum';
  windChimePendulum.position.set(0, 0.02, 0);

  const clapperBead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), coralMat);
  clapperBead.position.set(0, -0.055, 0);
  clapperBead.userData.noOutline = true;
  windChimePendulum.add(clapperBead);

  const lowerString = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.13, 6),
    darkMullionMat,
  );
  lowerString.position.set(0, -0.12, 0);
  lowerString.userData.noOutline = true;
  windChimePendulum.add(lowerString);

  const tanzakuPaper = makeBox(0.068, 0.24, 0.005, creamTrimMat, 0, -0.29, 0, 'wind-chime-tanzaku');
  tanzakuPaper.userData.noOutline = true;
  windChimePendulum.add(tanzakuPaper);

  const tanzakuWaveStripe = makeBox(0.069, 0.045, 0.007, seaSaltLightMat, 0, -0.35, 0);
  tanzakuWaveStripe.userData.noOutline = true;
  windChimePendulum.add(tanzakuWaveStripe);

  const tanzakuSunDot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 12), coralMat);
  tanzakuSunDot.rotation.x = Math.PI / 2;
  tanzakuSunDot.position.set(0, -0.24, 0);
  tanzakuSunDot.userData.noOutline = true;
  windChimePendulum.add(tanzakuSunDot);

  windChimeGroup.add(windChimePendulum);
  group.add(windChimeGroup);

  // ---------------------------------------------------------------------------
  // 8. Entrance Welcome Mat ('welcome-mat') at X = -2.5, Z = 0.0, Y = 0.53
  // ---------------------------------------------------------------------------
  const welcomeMatGroup = new THREE.Group();
  welcomeMatGroup.name = 'welcome-mat';
  welcomeMatGroup.position.set(-2.5, 0.53, 0.0);

  welcomeMatGroup.add(makeBox(1.56, 0.016, 0.84, darkMullionMat, 0, 0, 0, 'welcome-mat-border'));
  welcomeMatGroup.add(makeBox(1.42, 0.022, 0.7, seaSaltMat, 0, 0.003, 0, 'welcome-mat-carpet'));

  const matStripeA = makeBox(1.26, 0.025, 0.07, mintMat, 0, 0.004, -0.22, 'welcome-mat-stripe-a');
  matStripeA.userData.noOutline = true;
  welcomeMatGroup.add(matStripeA);
  const matStripeB = makeBox(1.26, 0.025, 0.07, creamTrimMat, 0, 0.004, 0.22, 'welcome-mat-stripe-b');
  matStripeB.userData.noOutline = true;
  welcomeMatGroup.add(matStripeB);

  group.add(welcomeMatGroup);

  // Apply crisp anime cel-shaded outlines to solid architectural elements
  // (glass panes, flat decals, and glowing sign faces marked noOutline are skipped)
  applyOutlinesToHierarchy(group, 0.016);

  return {
    group,
    slidingDoorLeft,
    slidingDoorRight,
    awningValance,
    windChimePendulum,
    signLightboxMaterials,
  };
}
