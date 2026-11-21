import * as THREE from 'three';
import { PALETTE } from '../config/paletteAndBounds';
import { createFestivalPosterTexture } from '../rendering/canvasTextures';
import {
  applyOutlinesToHierarchy,
  createEmissiveLightboxMaterial,
  createGlassMaterial,
  createToonMaterial,
} from '../rendering/toonMaterials';

export interface StoreInteriorResult {
  group: THREE.Group; // name: 'konbini-interior'
  deskFanHead: THREE.Object3D;
  deskFanBlades: THREE.Object3D;
  coldMistParticles: THREE.Object3D[]; // each has userData.baseY & userData.phase
  interiorLightboxMaterials: THREE.MeshStandardMaterial[];
  interiorWarmLights: THREE.PointLight[];
}

const FLOOR_Y = 0.568;

function markNoOutline<T extends THREE.Object3D>(obj: T): T {
  obj.userData.noOutline = true;
  return obj;
}

function createSolidFallbackDataTexture(hexColor: string, label: string): THREE.DataTexture {
  const color = new THREE.Color(hexColor);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  tex.userData = { label };
  return tex;
}

function tryGet2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')) {
    const getCtx = canvas.getContext as unknown as { mock?: unknown } | undefined;
    if (!getCtx || !('mock' in getCtx)) {
      return null;
    }
  }
  try {
    return canvas.getContext('2d');
  } catch {
    return null;
  }
}

function createCheckeredTileTexture(): THREE.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = tryGet2DContext(canvas);
    if (ctx) {
      ctx.fillStyle = '#fcf5e8';
      ctx.fillRect(0, 0, 128, 128);

      ctx.fillStyle = '#f2e6d2';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillRect(64, 64, 64, 64);

      ctx.strokeStyle = '#e5d6be';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 62, 62);
      ctx.strokeRect(65, 1, 62, 62);
      ctx.strokeRect(1, 65, 62, 62);
      ctx.strokeRect(65, 65, 62, 62);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(13, 10);
      tex.needsUpdate = true;
      return tex;
    }
  }
  const tex = createSolidFallbackDataTexture('#f8efe0', 'interior-tile-floor');
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(13, 10);
  return tex;
}

function createCategoryLightboxTexture(
  kanaTitle: string,
  subLabel: string,
  accentHex: string,
): THREE.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = tryGet2DContext(canvas);
    if (ctx) {
      ctx.fillStyle = '#fffaf0';
      ctx.fillRect(0, 0, 512, 128);

      ctx.fillStyle = accentHex;
      ctx.fillRect(0, 0, 512, 18);
      ctx.fillRect(0, 112, 512, 16);
      ctx.fillRect(16, 28, 14, 72);

      ctx.fillStyle = '#25324a';
      ctx.font = 'bold 42px "Hiragino Maru Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(kanaTitle, 46, 56);

      ctx.fillStyle = '#5a6b82';
      ctx.font = 'bold 20px "Segoe UI", "Hiragino Sans", sans-serif';
      ctx.fillText(subLabel, 48, 94);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      tex.userData = { label: subLabel, textContent: kanaTitle };
      return tex;
    }
  }
  const fallback = createSolidFallbackDataTexture('#fff6df', subLabel);
  fallback.userData = { label: subLabel, textContent: kanaTitle };
  return fallback;
}

function buildFloorCeilingAndWarmLights(root: THREE.Group): THREE.PointLight[] {
  const shellDecor = new THREE.Group();
  shellDecor.name = 'interior-floor-and-ceiling';

  // Neat warm cream-checkered tile floor at Y = 0.564 with soft warm-lantern bounce glow
  const tileTex = createCheckeredTileTexture();
  const floorMat = createToonMaterial({
    color: '#fffaf0',
    map: tileTex,
    emissive: '#ffe0a3',
    emissiveIntensity: 0.14,
  });
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(8.72, 0.012, 6.62),
    floorMat,
  );
  floorMesh.name = 'interior-checkered-floor';
  floorMesh.position.set(-2.5, 0.564, -4.16);
  floorMesh.receiveShadow = true;
  shellDecor.add(floorMesh);

  // Subtle warm interior wall header trim along back and left walls (never blocking front/right windows)
  const trimCreamMat = createToonMaterial({
    color: PALETTE.warmWall,
    emissive: '#ffe0a3',
    emissiveIntensity: 0.1,
  });
  const trimMintMat = createToonMaterial({ color: PALETTE.mintGreen });
  const trimBlueMat = createToonMaterial({ color: PALETTE.seaSaltBlue });

  const backUpperTrim = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(8.64, 0.24, 0.03), trimCreamMat),
  );
  backUpperTrim.name = 'interior-back-frieze';
  backUpperTrim.position.set(-2.5, 3.42, -7.47);
  shellDecor.add(backUpperTrim);

  const backAccentStripe = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(8.64, 0.05, 0.035), trimMintMat),
  );
  backAccentStripe.name = 'interior-back-stripe';
  backAccentStripe.position.set(-2.5, 3.28, -7.465);
  shellDecor.add(backAccentStripe);

  const leftAccentStripe = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 6.3), trimBlueMat),
  );
  leftAccentStripe.name = 'interior-left-stripe';
  leftAccentStripe.position.set(-6.84, 3.28, -4.3);
  shellDecor.add(leftAccentStripe);

  // Ceiling warm-white glowing LED tube strips at Y = 3.67 (strictly < 3.74)
  const railMat = createToonMaterial({ color: PALETTE.creamWhite });
  const ledTubeMat = createEmissiveLightboxMaterial({
    color: '#ffe0a3',
    intensity: 1.02,
  });

  const stripZPositions = [-1.75, -3.35, -4.95, -6.45];
  const railGeo = new THREE.BoxGeometry(7.3, 0.024, 0.14);
  const tubeGeo = new THREE.BoxGeometry(7.16, 0.022, 0.075);

  for (let i = 0; i < stripZPositions.length; i++) {
    const z = stripZPositions[i];
    const rail = markNoOutline(new THREE.Mesh(railGeo, railMat));
    rail.name = `ceiling-led-rail-${i}`;
    rail.position.set(-2.45, 3.69, z);
    shellDecor.add(rail);

    const tube = markNoOutline(new THREE.Mesh(tubeGeo, ledTubeMat));
    tube.name = `ceiling-led-tube-${i}`;
    tube.position.set(-2.45, 3.666, z);
    shellDecor.add(tube);
  }

  root.add(shellDecor);

  // 3 well-spaced warm ~3000K PointLights at Y = 3.04 (distance: 8.2, decay: 1.8)
  // cutting fragment-shader point-light loop cost by 25% while keeping rich warm interior illumination
  const lightPositions: [number, number, number, number][] = [
    [-4.85, 3.04, -2.55, 1.55],
    [0.15, 3.04, -2.25, 1.6],
    [-1.55, 3.04, -5.85, 1.55],
  ];

  const warmLights: THREE.PointLight[] = [];
  for (let i = 0; i < lightPositions.length; i++) {
    const [x, y, z, intensity] = lightPositions[i];
    const light = new THREE.PointLight('#ffe0a3', intensity, 8.2, 1.8);
    light.name = `interior-warm-light-${i}`;
    light.position.set(x, y, z);
    root.add(light);
    warmLights.push(light);
  }

  return warmLights;
}

function buildSummerDisplayZone(): THREE.Group {
  // Target footprint: X ∈ [-0.8, 1.7], Z ∈ [-2.1, -0.98]
  const zone = new THREE.Group();
  zone.name = 'interior-summer-display';
  zone.position.set(0.45, FLOOR_Y, -1.52);

  const woodMat = createToonMaterial({ color: '#e3be91' });
  const mintMat = createToonMaterial({ color: PALETTE.mintGreen });
  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const coralMat = createToonMaterial({ color: PALETTE.coralPink });
  const peachMat = createToonMaterial({ color: PALETTE.peachOrange });
  const skyMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const goldMat = createToonMaterial({ color: PALETTE.warmAmber });
  const darkIronMat = createToonMaterial({ color: '#2b3040' });

  // Lower cabinet plinth + wood tabletop + mint bumper
  const baseCabinet = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.42, 0.86), mintMat);
  baseCabinet.name = 'summer-table-base';
  baseCabinet.position.set(0, 0.21, 0);
  zone.add(baseCabinet);

  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.048, 0.94), woodMat);
  tableTop.name = 'summer-table-top';
  tableTop.position.set(0, 0.444, 0);
  zone.add(tableTop);

  // Second stepped display tier
  const upperRiser = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.24, 0.42), creamMat);
  upperRiser.name = 'summer-upper-riser';
  upperRiser.position.set(-0.18, 0.58, -0.14);
  zone.add(upperRiser);

  const upperShelf = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.036, 0.46), woodMat);
  upperShelf.name = 'summer-upper-shelf';
  upperShelf.position.set(-0.18, 0.718, -0.14);
  zone.add(upperShelf);

  // Overhead 'なつ限定' mini arch banner + festive bunting triangles
  const postGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.92, 8);
  for (const px of [-0.72, 0.46]) {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.name = 'summer-banner-post';
    post.position.set(px, 0.92, -0.16);
    zone.add(post);
  }

  const natsuTex = createFestivalPosterTexture('natsu');
  const bannerBacking = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.25, 0.032), creamMat);
  bannerBacking.name = 'summer-natsu-banner';
  bannerBacking.position.set(-0.13, 1.28, -0.16);
  zone.add(bannerBacking);

  const bannerFaceMat = createEmissiveLightboxMaterial({
    color: '#fff8ec',
    map: natsuTex,
    intensity: 0.35,
  });
  for (const zOff of [0.019, -0.019]) {
    const face = markNoOutline(
      new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.21), bannerFaceMat),
    );
    face.name = 'summer-natsu-banner-face';
    face.position.set(-0.13, 1.28, -0.16 + zOff);
    if (zOff < 0) {
      face.rotation.y = Math.PI;
    }
    zone.add(face);
  }

  const buntingColors = [
    PALETTE.coralPink,
    PALETTE.mintGreen,
    PALETTE.warmAmber,
    PALETTE.seaSaltLight,
    PALETTE.peachOrange,
  ];
  const pennantGeo = new THREE.ConeGeometry(0.048, 0.095, 3);
  for (let i = 0; i < buntingColors.length; i++) {
    const flag = markNoOutline(
      new THREE.Mesh(pennantGeo, createToonMaterial({ color: buntingColors[i] })),
    );
    flag.name = `summer-bunting-${i}`;
    flag.position.set(-0.53 + i * 0.2, 1.1, -0.16);
    flag.rotation.z = Math.PI;
    zone.add(flag);
  }

  // 1) Colorful handheld fireworks packs (手持ち花火) & party firework tubes
  const fireworkTray = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.32), creamMat);
  fireworkTray.name = 'fireworks-display-box';
  fireworkTray.position.set(-0.68, 0.508, 0.16);
  zone.add(fireworkTray);

  const fwColors = [
    '#ff6b8b',
    '#283c75',
    '#ff9f68',
    '#4ea8de',
    '#ffd166',
    '#56cfe1',
    '#ff7b89',
  ];
  const fwPackGeo = new THREE.BoxGeometry(0.068, 0.28, 0.022);
  const fwStripeGeo = new THREE.BoxGeometry(0.056, 0.055, 0.026);
  for (let i = 0; i < fwColors.length; i++) {
    const pack = markNoOutline(
      new THREE.Mesh(fwPackGeo, createToonMaterial({ color: fwColors[i] })),
    );
    pack.name = `firework-pack-${i}`;
    pack.position.set(-0.91 + i * 0.076, 0.63, 0.16 + (i % 2) * 0.04);
    pack.rotation.x = -0.18;
    zone.add(pack);

    const sparkBand = markNoOutline(new THREE.Mesh(fwStripeGeo, goldMat));
    sparkBand.position.set(0, 0.06, 0);
    pack.add(sparkBand);
  }

  // Gift firework drums on upper shelf left
  const drumGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.2, 12);
  for (let i = 0; i < 3; i++) {
    const drum = markNoOutline(
      new THREE.Mesh(
        drumGeo,
        createToonMaterial({ color: i === 1 ? PALETTE.indigoDusk : PALETTE.coralPink }),
      ),
    );
    drum.name = `firework-drum-${i}`;
    drum.position.set(-0.74 + i * 0.16, 0.836, -0.14);
    zone.add(drum);
  }

  // 2) Classic green mosquito coil boxes (蚊取り線香) + cute pink ceramic pig holder (蚊取り豚)
  const coilGreenMat = createToonMaterial({ color: '#358252' });
  const coilBoxGeo = new THREE.BoxGeometry(0.2, 0.055, 0.2);
  const medallionGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.058, 12);
  for (let i = 0; i < 3; i++) {
    const box = markNoOutline(new THREE.Mesh(coilBoxGeo, coilGreenMat));
    box.name = `mosquito-coil-box-${i}`;
    box.position.set(-0.2, 0.495 + i * 0.056, 0.2);
    box.rotation.y = i * 0.08;
    zone.add(box);

    const med = markNoOutline(new THREE.Mesh(medallionGeo, coralMat));
    box.add(med);
  }

  // Cute pink ceramic pig mosquito-coil holder (蚊取り豚)
  const pigGroup = new THREE.Group();
  pigGroup.name = 'katoributa-pig-holder';
  pigGroup.position.set(0.08, 0.565, 0.2);
  pigGroup.rotation.y = 0.22;

  const pigPinkMat = createToonMaterial({ color: '#ff9ebb' });
  const pigSnoutMat = createToonMaterial({ color: '#ff80a6' });

  const pigBody = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), pigPinkMat);
  pigBody.name = 'katoributa-body';
  pigBody.scale.set(1.0, 0.92, 1.18);
  pigGroup.add(pigBody);

  const pigSnout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.058, 0.055, 12),
    pigSnoutMat,
  );
  pigSnout.rotation.x = Math.PI * 0.5;
  pigSnout.position.set(0, -0.005, 0.105);
  pigGroup.add(pigSnout);

  const pigMouth = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 10), darkIronMat),
  );
  pigMouth.rotation.x = Math.PI * 0.5;
  pigMouth.position.set(0, -0.005, 0.108);
  pigGroup.add(pigMouth);

  const innerCoil = markNoOutline(
    new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12), coilGreenMat),
  );
  innerCoil.position.set(0, -0.005, 0.115);
  pigGroup.add(innerCoil);

  const earGeo = new THREE.ConeGeometry(0.026, 0.052, 4);
  for (const ex of [-0.048, 0.048]) {
    const ear = markNoOutline(new THREE.Mesh(earGeo, pigSnoutMat));
    ear.position.set(ex, 0.082, 0.04);
    ear.rotation.z = ex < 0 ? 0.3 : -0.3;
    pigGroup.add(ear);
  }

  const legGeo = new THREE.CylinderGeometry(0.018, 0.015, 0.05, 8);
  for (const [lx, lz] of [
    [-0.052, 0.05],
    [0.052, 0.05],
    [-0.052, -0.05],
    [0.052, -0.05],
  ]) {
    const leg = markNoOutline(new THREE.Mesh(legGeo, pigPinkMat));
    leg.position.set(lx, -0.082, lz);
    pigGroup.add(leg);
  }

  const pigHandle = markNoOutline(
    new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, 6, 12, Math.PI), darkIronMat),
  );
  pigHandle.position.set(0, 0.085, 0);
  pigGroup.add(pigHandle);
  zone.add(pigGroup);

  // 3) Gold/sky sunscreen bottle display tray on upper tier right
  const sunscreenTray = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.035, 0.28), creamMat);
  sunscreenTray.name = 'sunscreen-display-tray';
  sunscreenTray.position.set(0.24, 0.754, -0.14);
  zone.add(sunscreenTray);

  const bottleGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.115, 8);
  const capGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.028, 8);
  for (let i = 0; i < 8; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const bMat = row === 0 ? goldMat : skyMat;
    const bottle = markNoOutline(new THREE.Mesh(bottleGeo, bMat));
    bottle.name = `sunscreen-bottle-${i}`;
    bottle.position.set(0.05 + col * 0.12, 0.825, -0.2 + row * 0.11);
    zone.add(bottle);

    const cap = markNoOutline(new THREE.Mesh(capGeo, row === 0 ? creamMat : goldMat));
    cap.position.set(0, 0.068, 0);
    bottle.add(cap);
  }

  // 4) Pastel beach bucket & shovel set on right front tabletop
  const bucketGroup = new THREE.Group();
  bucketGroup.name = 'beach-bucket-set';
  bucketGroup.position.set(0.52, 0.468, 0.18);

  const bucketMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.098, 0.072, 0.165, 14),
    peachMat,
  );
  bucketMesh.position.y = 0.082;
  bucketGroup.add(bucketMesh);

  const bucketRim = markNoOutline(
    new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.012, 8, 16), creamMat),
  );
  bucketRim.rotation.x = Math.PI * 0.5;
  bucketRim.position.y = 0.164;
  bucketGroup.add(bucketRim);

  const shovelShaft = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 6), skyMat),
  );
  shovelShaft.position.set(0.025, 0.16, 0);
  shovelShaft.rotation.z = -0.28;
  bucketGroup.add(shovelShaft);

  const shovelScoop = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.014), mintMat),
  );
  shovelScoop.position.set(0.14, 0.036, 0.04);
  shovelScoop.rotation.x = -Math.PI * 0.38;
  bucketGroup.add(shovelScoop);
  zone.add(bucketGroup);

  // 5) Colorful translucent swim rings (userData.noOutline = true) on right peg stand
  const ringStandPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.024, 0.62, 8),
    woodMat,
  );
  ringStandPost.name = 'float-display-post';
  ringStandPost.position.set(0.9, 0.76, -0.02);
  zone.add(ringStandPost);

  const swimRingConfigs: { color: string; x: number; y: number; z: number; ry: number }[] = [
    { color: '#ff7b89', x: 0.86, y: 0.68, z: 0.14, ry: 0.35 },
    { color: '#5ce1e6', x: 0.92, y: 0.74, z: -0.02, ry: -0.25 },
    { color: '#ffc857', x: 0.84, y: 0.82, z: -0.18, ry: 0.18 },
  ];
  const swimRingGeo = new THREE.TorusGeometry(0.165, 0.052, 12, 24);
  for (let i = 0; i < swimRingConfigs.length; i++) {
    const cfg = swimRingConfigs[i];
    const ringMat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.68,
      roughness: 0.12,
      metalness: 0.04,
      depthWrite: false,
    });
    ringMat.userData.noOutline = true;
    const ring = markNoOutline(new THREE.Mesh(swimRingGeo, ringMat));
    ring.name = `summer-swim-ring-${i}`;
    ring.position.set(cfg.x, cfg.y, cfg.z);
    ring.rotation.set(-0.22, cfg.ry, 0.12);
    zone.add(ring);
  }

  return zone;
}

function buildGondolaShelvesZone(): THREE.Group {
  // Target footprint: X ∈ [-3.6, -0.8], Z ∈ [-5.2, -2.6], total height <= 1.75
  const zone = new THREE.Group();
  zone.name = 'interior-shelves';

  const steelCreamMat = createToonMaterial({ color: '#f6efe4' });
  const woodCapMat = createToonMaterial({ color: '#dfb98c' });
  const priceRailMat = createToonMaterial({ color: '#ffe599' });

  const snackMats = [
    createToonMaterial({ color: PALETTE.mintGreen }),
    createToonMaterial({ color: PALETTE.peachOrange }),
    createToonMaterial({ color: PALETTE.coralPink }),
    createToonMaterial({ color: PALETTE.seaSaltLight }),
    createToonMaterial({ color: PALETTE.warmAmber }),
  ];
  const teaGreenMat = createToonMaterial({ color: '#5db36e' });
  const teaBarleyMat = createToonMaterial({ color: '#c48654' });
  const waterBlueMat = createToonMaterial({ color: '#7cc6fe' });
  const cupWhiteMat = createToonMaterial({ color: '#fffaf2' });

  const snackGeo = new THREE.BoxGeometry(0.068, 0.15, 0.11);
  const noodleCupGeo = new THREE.CylinderGeometry(0.042, 0.032, 0.105, 10);
  const noodleBandGeo = new THREE.CylinderGeometry(0.041, 0.038, 0.032, 10);
  const bottleGeo = new THREE.CylinderGeometry(0.028, 0.03, 0.155, 8);
  const capGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.024, 6);

  const aisleXCenters = [-2.92, -1.38];
  const zCenter = -3.9;
  const shelfLength = 2.24;

  for (let a = 0; a < aisleXCenters.length; a++) {
    const gondola = new THREE.Group();
    gondola.name = `gondola-aisle-${a}`;
    gondola.position.set(aisleXCenters[a], FLOOR_Y, zCenter);

    // Base plinth + center spine + wooden top cap (max height = 1.12m -> world Y 1.688 <= 1.75)
    const baseDeck = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.1, shelfLength),
      steelCreamMat,
    );
    baseDeck.position.set(0, 0.05, 0);
    gondola.add(baseDeck);

    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.06, shelfLength - 0.06),
      steelCreamMat,
    );
    spine.position.set(0, 0.56, 0);
    gondola.add(spine);

    const topCap = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.035, shelfLength),
      woodCapMat,
    );
    topCap.position.set(0, 1.102, 0);
    gondola.add(topCap);

    // Front (+Z) end-cap panel for neat storefront framing
    const endCapPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 1.04, 0.04),
      woodCapMat,
    );
    endCapPanel.position.set(0, 0.55, shelfLength * 0.5 + 0.02);
    gondola.add(endCapPanel);

    const shelfHeights = [0.12, 0.46, 0.79];
    for (const side of [-1, 1]) {
      for (let s = 0; s < shelfHeights.length; s++) {
        const sy = shelfHeights[s];
        const board = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.026, shelfLength - 0.08),
          steelCreamMat,
        );
        board.position.set(side * 0.19, sy, 0);
        gondola.add(board);

        const priceStrip = markNoOutline(
          new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, shelfLength - 0.1), priceRailMat),
        );
        priceStrip.position.set(side * 0.362, sy, 0);
        gondola.add(priceStrip);

        // Stock tidy color-coordinated merchandise rows
        for (let slot = 0; slot < 11; slot++) {
          const sz = -0.96 + slot * 0.19;
          const sx = side * 0.21;

          if (s === 2) {
            // Top tier: pastel snack pillow bags
            const bagMat = snackMats[(slot + a * 2 + (side > 0 ? 1 : 0)) % snackMats.length];
            const bag = markNoOutline(new THREE.Mesh(snackGeo, bagMat));
            bag.position.set(sx, sy + 0.088, sz);
            bag.rotation.y = (slot % 2 === 0 ? 0.05 : -0.05) * side;
            gondola.add(bag);
          } else if (s === 1) {
            // Middle tier: cup noodles & biscuit boxes
            if (slot % 3 !== 2) {
              const cup = markNoOutline(new THREE.Mesh(noodleCupGeo, cupWhiteMat));
              cup.position.set(sx, sy + 0.066, sz);
              const band = markNoOutline(
                new THREE.Mesh(
                  noodleBandGeo,
                  snackMats[(slot + a) % snackMats.length],
                ),
              );
              cup.add(band);
              gondola.add(cup);
            } else {
              const biscuit = markNoOutline(
                new THREE.Mesh(
                  snackGeo,
                  snackMats[(slot + 3) % snackMats.length],
                ),
              );
              biscuit.scale.set(1.1, 0.85, 1.2);
              biscuit.position.set(sx, sy + 0.078, sz);
              gondola.add(biscuit);
            }
          } else {
            // Bottom tier: bottled teas & mineral waters
            const bMat =
              slot < 4 ? teaGreenMat : slot < 8 ? teaBarleyMat : waterBlueMat;
            const bottle = markNoOutline(new THREE.Mesh(bottleGeo, bMat));
            bottle.position.set(sx, sy + 0.09, sz);
            const cap = markNoOutline(
              new THREE.Mesh(capGeo, slot < 4 ? snackMats[0] : snackMats[4]),
            );
            cap.position.y = 0.088;
            bottle.add(cap);
            gondola.add(bottle);
          }
        }
      }
    }

    zone.add(gondola);
  }

  return zone;
}

function buildBentoOnigiriZone(): THREE.Group {
  // Target footprint: X ∈ [-0.4, 1.82], Z ∈ [-5.8, -4.2]
  // Open multi-tier chilled display facing +Z with clear glass sides so +X sea-view window sees inside too
  const zone = new THREE.Group();
  zone.name = 'interior-bento-onigiri';
  zone.position.set(0.72, FLOOR_Y, -5.06);

  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const woodMat = createToonMaterial({ color: '#deb88a' });
  const slateBackMat = createToonMaterial({ color: '#343d52' });
  const riceWhiteMat = createToonMaterial({ color: '#fffdf8' });
  const noriDarkMat = createToonMaterial({ color: '#1e2623' });
  const bentoTrayMat = createToonMaterial({ color: '#27242c' });
  const eggGoldMat = createToonMaterial({ color: '#ffd166' });
  const salmonCoralMat = createToonMaterial({ color: '#ff8577' });
  const greenSideMat = createToonMaterial({ color: '#6ac47e' });
  const berryRedMat = createToonMaterial({ color: '#ff5d73' });

  const headerGlowMat = createEmissiveLightboxMaterial({
    color: '#ffe0a3',
    intensity: 0.92,
  });
  const sideGlassMat = createGlassMaterial({ tint: '#ebf7ff', opacity: 0.16 });

  const width = 1.98;
  const depth = 1.02;

  // Lower insulated chiller base + back panel + curved canopy header
  const baseBox = new THREE.Mesh(new THREE.BoxGeometry(width, 0.36, depth), woodMat);
  baseBox.position.set(0, 0.18, 0);
  zone.add(baseBox);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.04, 1.5, 0.08),
    slateBackMat,
  );
  backWall.position.set(0, 0.82, -depth * 0.5 + 0.04);
  zone.add(backWall);

  const topCanopy = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.14, depth * 0.78),
    creamMat,
  );
  topCanopy.position.set(0, 1.52, -0.08);
  zone.add(topCanopy);

  const canopyLightBar = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(width - 0.12, 0.032, 0.08), headerGlowMat),
  );
  canopyLightBar.position.set(0, 1.44, 0.22);
  zone.add(canopyLightBar);

  // Transparent glass side cheeks for unobstructed right-window viewing
  const sideGlassGeo = new THREE.BoxGeometry(0.025, 1.12, depth * 0.84);
  for (const sx of [-width * 0.5 + 0.02, width * 0.5 - 0.02]) {
    const cheek = markNoOutline(new THREE.Mesh(sideGlassGeo, sideGlassMat));
    cheek.name = 'chiller-side-glass';
    cheek.position.set(sx, 0.92, -0.04);
    zone.add(cheek);
  }

  // 4 stepped refrigerated shelves
  const tiers = [
    { y: 0.42, z: 0.08, d: 0.76 },
    { y: 0.72, z: 0.02, d: 0.66 },
    { y: 1.01, z: -0.04, d: 0.56 },
    { y: 1.27, z: -0.1, d: 0.46 },
  ];

  for (let t = 0; t < tiers.length; t++) {
    const tier = tiers[t];
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.08, 0.03, tier.d),
      creamMat,
    );
    shelf.position.set(0, tier.y, tier.z);
    zone.add(shelf);

    const shelfGlow = markNoOutline(
      new THREE.Mesh(
        new THREE.BoxGeometry(width - 0.14, 0.018, 0.025),
        headerGlowMat,
      ),
    );
    shelfGlow.position.set(0, tier.y + 0.01, tier.z + tier.d * 0.5);
    zone.add(shelfGlow);
  }

  // Tier 3 (Top): Fruit sandwiches & egg sandos
  const sandoBreadGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.042, 3);
  const fillingGeo = new THREE.BoxGeometry(0.065, 0.024, 0.022);
  for (let i = 0; i < 10; i++) {
    const sx = -0.78 + i * 0.172;
    const sando = markNoOutline(new THREE.Mesh(sandoBreadGeo, riceWhiteMat));
    sando.name = `fruit-sandwich-${i}`;
    sando.position.set(sx, tiers[3].y + 0.056, tiers[3].z + 0.04);
    sando.rotation.set(0, Math.PI, Math.PI * 0.5);
    zone.add(sando);

    const fillMat =
      i % 3 === 0 ? berryRedMat : i % 3 === 1 ? eggGoldMat : greenSideMat;
    const filling = markNoOutline(new THREE.Mesh(fillingGeo, fillMat));
    filling.position.set(sx, tiers[3].y + 0.052, tiers[3].z + 0.075);
    zone.add(filling);
  }

  // Tier 2 (Upper-Mid): Triangular white-rice + dark-nori Onigiri (おにぎり) rows
  const onigiriRiceGeo = new THREE.CylinderGeometry(0.056, 0.056, 0.038, 3);
  const onigiriNoriGeo = new THREE.BoxGeometry(0.058, 0.054, 0.042);
  const toppingDotGeo = new THREE.SphereGeometry(0.013, 6, 6);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 11; col++) {
      const ox = -0.8 + col * 0.16;
      const oz = tiers[2].z - 0.08 + row * 0.16;

      const rice = markNoOutline(new THREE.Mesh(onigiriRiceGeo, riceWhiteMat));
      rice.name = `onigiri-${row}-${col}`;
      rice.position.set(ox, tiers[2].y + 0.058, oz);
      rice.rotation.x = Math.PI * 0.5;
      rice.rotation.z = Math.PI;
      zone.add(rice);

      const nori = markNoOutline(new THREE.Mesh(onigiriNoriGeo, noriDarkMat));
      nori.position.set(ox, tiers[2].y + 0.044, oz + 0.002);
      zone.add(nori);

      const dotMat =
        col % 3 === 0 ? salmonCoralMat : col % 3 === 1 ? berryRedMat : greenSideMat;
      const dot = markNoOutline(new THREE.Mesh(toppingDotGeo, dotMat));
      dot.position.set(ox, tiers[2].y + 0.095, oz + 0.004);
      zone.add(dot);
    }
  }

  // Tiers 0 & 1 (Lower): Black-lacquer & wood Bento boxes with colorful side dishes inside
  const bentoOuterGeo = new THREE.BoxGeometry(0.24, 0.038, 0.18);
  const riceBlockGeo = new THREE.BoxGeometry(0.095, 0.022, 0.14);
  const sideDishGeo = new THREE.BoxGeometry(0.052, 0.024, 0.062);
  const umeDotGeo = new THREE.SphereGeometry(0.011, 6, 6);

  for (let tierIdx = 0; tierIdx <= 1; tierIdx++) {
    const tier = tiers[tierIdx];
    for (let i = 0; i < 6; i++) {
      const bx = -0.75 + i * 0.3;
      const bz = tier.z + 0.06;
      const trayMat = (i + tierIdx) % 2 === 0 ? bentoTrayMat : woodMat;
      const bento = markNoOutline(new THREE.Mesh(bentoOuterGeo, trayMat));
      bento.name = `bento-box-${tierIdx}-${i}`;
      bento.position.set(bx, tier.y + 0.034, bz);

      const rice = markNoOutline(new THREE.Mesh(riceBlockGeo, riceWhiteMat));
      rice.position.set(-0.055, 0.018, 0);
      bento.add(rice);

      const ume = markNoOutline(new THREE.Mesh(umeDotGeo, berryRedMat));
      ume.position.set(-0.055, 0.03, 0);
      bento.add(ume);

      const mainSide = markNoOutline(
        new THREE.Mesh(sideDishGeo, i % 2 === 0 ? salmonCoralMat : eggGoldMat),
      );
      mainSide.position.set(0.055, 0.018, -0.035);
      bento.add(mainSide);

      const vegSide = markNoOutline(new THREE.Mesh(sideDishGeo, greenSideMat));
      vegSide.position.set(0.055, 0.018, 0.038);
      bento.add(vegSide);

      zone.add(bento);
    }
  }

  return zone;
}

function buildDrinkFridgesAndMistZones(): {
  fridgesZone: THREE.Group;
  mistZone: THREE.Group;
  coldMistParticles: THREE.Object3D[];
} {
  // Back-wall beverage fridges along Z = -7.32, X ∈ [-4.8, 1.7]
  const fridgesZone = new THREE.Group();
  fridgesZone.name = 'interior-drink-fridges';

  const silverFrameMat = createToonMaterial({ color: '#dce4ec' });
  const blueHeaderMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const darkBaseMat = createToonMaterial({ color: '#2b3446' });

  const innerBackGlowMat = createEmissiveLightboxMaterial({
    color: '#fff1cc',
    intensity: 0.88,
  });
  const doorGlassMat = createGlassMaterial({ tint: '#e4f6ff', opacity: 0.15 });
  const frostTintMat = new THREE.MeshPhysicalMaterial({
    color: '#e8f7ff',
    transparent: true,
    opacity: 0.28,
    roughness: 0.55,
    depthWrite: false,
  });
  frostTintMat.userData.noOutline = true;

  const cabinetColors: string[][] = [
    ['#54b46c', '#82cf74', '#3f9156'], // Green teas & matcha
    ['#52b8e8', '#8ecae6', '#3a86ff'], // Ramune blue soda & sports drinks
    ['#ff9e7d', '#ff7b89', '#ffd166'], // Peach juice, berry & citrus
    ['#fffaf0', '#5b9bd5', '#bde0fe'], // Milk cartons & yogurt drinks
    ['#d4a373', '#3b322c', '#f4d58d'], // Canned coffee & lemon soda
  ];

  const bottleGeo = new THREE.CylinderGeometry(0.034, 0.036, 0.19, 8);
  const canGeo = new THREE.CylinderGeometry(0.033, 0.033, 0.135, 8);
  const cartonGeo = new THREE.BoxGeometry(0.072, 0.2, 0.072);
  const handleGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.54, 6);

  const cabWidth = 1.24;
  const cabDepth = 0.62;
  const cabHeight = 2.38;
  const startX = -4.05;
  const fridgeZ = -7.15;

  for (let c = 0; c < 5; c++) {
    const cx = startX + c * cabWidth;
    const cab = new THREE.Group();
    cab.name = `beverage-cabinet-${c}`;
    cab.position.set(cx, FLOOR_Y, fridgeZ);

    // Outer insulated shell (top, bottom, back, slim side dividers)
    const bottomKick = new THREE.Mesh(
      new THREE.BoxGeometry(cabWidth - 0.02, 0.22, cabDepth),
      darkBaseMat,
    );
    bottomKick.position.set(0, 0.11, 0);
    cab.add(bottomKick);

    const topHeader = new THREE.Mesh(
      new THREE.BoxGeometry(cabWidth - 0.02, 0.2, cabDepth + 0.02),
      blueHeaderMat,
    );
    topHeader.position.set(0, cabHeight - 0.1, 0);
    cab.add(topHeader);

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(cabWidth - 0.04, cabHeight - 0.24, 0.05),
      silverFrameMat,
    );
    backWall.position.set(0, cabHeight * 0.5, -cabDepth * 0.5 + 0.025);
    cab.add(backWall);

    // Illuminated back panel inside cabinet
    const glowPanel = markNoOutline(
      new THREE.Mesh(
        new THREE.PlaneGeometry(cabWidth - 0.12, cabHeight - 0.48),
        innerBackGlowMat,
      ),
    );
    glowPanel.position.set(0, cabHeight * 0.5 + 0.02, -cabDepth * 0.5 + 0.06);
    cab.add(glowPanel);

    for (const side of [-1, 1]) {
      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, cabHeight, cabDepth),
        silverFrameMat,
      );
      mullion.position.set(side * (cabWidth * 0.5 - 0.025), cabHeight * 0.5, 0);
      cab.add(mullion);
    }

    // 5 stocked shelves per cabinet
    const palette = cabinetColors[c];
    const mat0 = createToonMaterial({ color: palette[0] });
    const mat1 = createToonMaterial({ color: palette[1] });
    const mat2 = createToonMaterial({ color: palette[2] });

    for (let s = 0; s < 5; s++) {
      const sy = 0.28 + s * 0.39;
      const shelf = markNoOutline(
        new THREE.Mesh(
          new THREE.BoxGeometry(cabWidth - 0.1, 0.022, cabDepth - 0.14),
          silverFrameMat,
        ),
      );
      shelf.position.set(0, sy, -0.02);
      cab.add(shelf);

      for (let slot = 0; slot < 8; slot++) {
        const bx = -0.46 + slot * 0.132;
        const itemMat = slot < 3 ? mat0 : slot < 6 ? mat1 : mat2;
        let drinkMesh: THREE.Mesh;
        if (c === 3) {
          drinkMesh = markNoOutline(new THREE.Mesh(cartonGeo, itemMat));
          drinkMesh.position.set(bx, sy + 0.112, 0.02);
        } else if (c === 4 && s >= 2) {
          drinkMesh = markNoOutline(new THREE.Mesh(canGeo, itemMat));
          drinkMesh.position.set(bx, sy + 0.08, 0.04);
        } else {
          drinkMesh = markNoOutline(new THREE.Mesh(bottleGeo, itemMat));
          drinkMesh.position.set(bx, sy + 0.106, 0.03);
        }
        cab.add(drinkMesh);
      }
    }

    // Glass door + frosted lower condensation band + vertical handle
    const doorGlass = markNoOutline(
      new THREE.Mesh(
        new THREE.BoxGeometry(cabWidth - 0.1, cabHeight - 0.46, 0.018),
        doorGlassMat,
      ),
    );
    doorGlass.name = `fridge-glass-door-${c}`;
    doorGlass.position.set(0, cabHeight * 0.5 + 0.01, cabDepth * 0.5 - 0.01);
    cab.add(doorGlass);

    const frostBand = markNoOutline(
      new THREE.Mesh(
        new THREE.PlaneGeometry(cabWidth - 0.12, 0.58),
        frostTintMat,
      ),
    );
    frostBand.name = `fridge-frost-tint-${c}`;
    frostBand.position.set(0, 0.56, cabDepth * 0.5 + 0.004);
    cab.add(frostBand);

    const handle = markNoOutline(new THREE.Mesh(handleGeo, silverFrameMat));
    handle.position.set(cabWidth * 0.5 - 0.11, 1.24, cabDepth * 0.5 + 0.025);
    cab.add(handle);

    fridgesZone.add(cab);
  }

  // Soft white translucent cold mist puffs (group at origin so local Y == world Y for animationSystem)
  const mistZone = new THREE.Group();
  mistZone.name = 'interior-cold-mist';

  const mistPuffGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const coldMistParticles: THREE.Object3D[] = [];

  const mistCoords: [number, number, number, number][] = [
    [-4.35, 1.18, -6.72, 1.3],
    [-3.75, 1.54, -6.7, 1.1],
    [-3.05, 1.24, -6.73, 1.35],
    [-2.4, 1.62, -6.69, 1.15],
    [-1.75, 1.16, -6.72, 1.4],
    [-1.1, 1.48, -6.7, 1.2],
    [-0.45, 1.22, -6.72, 1.3],
    [0.2, 1.58, -6.69, 1.15],
    [0.85, 1.2, -6.72, 1.35],
    [1.35, 1.46, -6.7, 1.15],
    // Open bento & onigiri chilled case mist puffs
    [0.05, 1.24, -4.44, 1.25],
    [0.52, 1.52, -4.46, 1.15],
    [0.98, 1.18, -4.43, 1.3],
    [1.38, 1.44, -4.45, 1.15],
  ];

  for (let i = 0; i < mistCoords.length; i++) {
    const [mx, my, mz, sx] = mistCoords[i];
    // Give each mist puff its own material so per-particle opacity fade works independently
    const mistMat = new THREE.MeshStandardMaterial({
      color: '#f4fbff',
      emissive: '#dff4ff',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.26,
      roughness: 1.0,
      metalness: 0.0,
      depthWrite: false,
    });
    mistMat.userData.noOutline = true;

    const puff = markNoOutline(new THREE.Mesh(mistPuffGeo, mistMat));
    puff.name = `cold-mist-puff-${i}`;
    puff.position.set(mx, my, mz);
    puff.scale.set(sx, 0.52, 0.72);
    puff.userData.baseY = my;
    puff.userData.phase = i / mistCoords.length;
    mistZone.add(puff);
    coldMistParticles.push(puff);
  }

  return { fridgesZone, mistZone, coldMistParticles };
}

function buildIceCreamFreezerZone(): THREE.Group {
  // Target footprint: X ∈ [-3.5, -1.4], Z ∈ [-2.1, -1.35]
  const zone = new THREE.Group();
  zone.name = 'interior-ice-cream-freezer';
  zone.position.set(-2.45, FLOOR_Y, -1.72);

  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const seaBlueMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const tubInnerMat = createToonMaterial({ color: '#ddf4ff' });
  const stickWoodMat = createToonMaterial({ color: '#dfb888' });
  const ventSlateMat = createToonMaterial({ color: '#5c6b80' });
  const lidGlassMat = createGlassMaterial({ tint: '#e4f7ff', opacity: 0.2 });

  // Outer insulated low chest body (width 1.86, depth 0.62, height 0.74)
  const chestBody = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.64, 0.62), creamMat);
  chestBody.position.set(0, 0.32, 0);
  zone.add(chestBody);

  const blueCollar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.075, 0.65), seaBlueMat);
  blueCollar.position.set(0, 0.66, 0);
  zone.add(blueCollar);

  const innerWell = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.08, 0.5), tubInnerMat),
  );
  innerWell.position.set(0, 0.56, 0);
  zone.add(innerWell);

  const frontGrille = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.02), ventSlateMat),
  );
  frontGrille.position.set(0.58, 0.16, 0.315);
  zone.add(frontGrille);

  // Stocked popsicles & ice-cream tubs visible through glass top
  const popColors = [
    '#64d2ff', // Soda popsicle
    '#ff7b89', // Strawberry bar
    '#7ae582', // Melon bar
    '#ffb86b', // Mango orange
    '#fff3d6', // Vanilla milk
    '#c77dff', // Grape ice
  ];
  const popMats = popColors.map((hex) => createToonMaterial({ color: hex }));
  const popGeo = new THREE.BoxGeometry(0.085, 0.036, 0.15);
  const stickGeo = new THREE.BoxGeometry(0.016, 0.012, 0.055);
  const cupGeo = new THREE.CylinderGeometry(0.052, 0.042, 0.055, 10);

  for (let i = 0; i < 12; i++) {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const px = -0.68 + col * 0.27;
    const pz = -0.11 + row * 0.22;
    const pMat = popMats[(col + row * 2) % popMats.length];

    if (col < 4) {
      const pop = markNoOutline(new THREE.Mesh(popGeo, pMat));
      pop.name = `popsicle-${i}`;
      pop.position.set(px, 0.615, pz);
      pop.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.08;
      const stick = markNoOutline(new THREE.Mesh(stickGeo, stickWoodMat));
      stick.position.set(0, -0.004, 0.09);
      pop.add(stick);
      zone.add(pop);
    } else {
      const tub = markNoOutline(new THREE.Mesh(cupGeo, pMat));
      tub.name = `ice-cream-cup-${i}`;
      tub.position.set(px, 0.625, pz);
      zone.add(tub);
    }
  }

  // Twin sliding clear glass lids
  for (const lx of [-0.43, 0.43]) {
    const lid = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.016, 0.54), lidGlassMat),
    );
    lid.name = 'freezer-glass-lid';
    lid.position.set(lx, 0.695, 0);
    zone.add(lid);
  }

  return zone;
}

function buildCheckoutCoffeeAndFanZones(): {
  checkoutZone: THREE.Group;
  coffeeZone: THREE.Group;
  fanZone: THREE.Group;
  deskFanHead: THREE.Object3D;
  deskFanBlades: THREE.Object3D;
} {
  // All 3 inside X ∈ [-6.7, -4.4], Z ∈ [-4.2, -1.4]
  const checkoutZone = new THREE.Group();
  checkoutZone.name = 'interior-checkout-counter';

  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const oakWoodMat = createToonMaterial({ color: '#deb88a' });
  const mintMat = createToonMaterial({ color: PALETTE.mintGreen });
  const blueMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const charcoalMat = createToonMaterial({ color: '#2b303d' });
  const silverMat = createToonMaterial({ color: '#d5dde6' });
  const amberSnackMat = createToonMaterial({ color: '#e08e45' });
  const bunCreamMat = createToonMaterial({ color: '#fff4de' });

  const counterHeight = 0.87; // FLOOR_Y (0.568) + 0.87 = 1.438

  // Main Z-leg of L-counter (facing +X into the store)
  const mainBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, counterHeight - 0.04, 2.54),
    creamMat,
  );
  mainBody.position.set(-4.84, FLOOR_Y + (counterHeight - 0.04) * 0.5, -2.82);
  checkoutZone.add(mainBody);

  const mainTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.045, 2.6),
    oakWoodMat,
  );
  mainTop.position.set(-4.84, FLOOR_Y + counterHeight - 0.02, -2.82);
  checkoutZone.add(mainTop);

  // Front accent stripes on aisle-facing apron
  const apronBlue = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 2.52), blueMat),
  );
  apronBlue.position.set(-4.51, FLOOR_Y + 0.66, -2.82);
  checkoutZone.add(apronBlue);

  const apronMint = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 2.52), mintMat),
  );
  apronMint.position.set(-4.51, FLOOR_Y + 0.55, -2.82);
  checkoutZone.add(apronMint);

  // Front X-return leg of L-counter (holds coffee machine & mini desk fan)
  const returnBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.38, counterHeight - 0.04, 0.6),
    creamMat,
  );
  returnBody.position.set(-5.85, FLOOR_Y + (counterHeight - 0.04) * 0.5, -1.82);
  checkoutZone.add(returnBody);

  const returnTop = new THREE.Mesh(
    new THREE.BoxGeometry(1.44, 0.045, 0.66),
    oakWoodMat,
  );
  returnTop.position.set(-5.85, FLOOR_Y + counterHeight - 0.02, -1.82);
  checkoutZone.add(returnTop);

  const counterTopY = FLOOR_Y + counterHeight;

  // Dual-screen POS Register at (-4.82, counterTopY, -2.62)
  const posGroup = new THREE.Group();
  posGroup.name = 'pos-register';
  posGroup.position.set(-4.82, counterTopY, -2.62);

  const cashDrawer = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.085, 0.36),
    creamMat,
  );
  cashDrawer.position.y = 0.042;
  posGroup.add(cashDrawer);

  const clerkMonitor = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.24, 0.3),
    charcoalMat,
  );
  clerkMonitor.position.set(-0.06, 0.21, 0);
  clerkMonitor.rotation.z = -0.22;
  posGroup.add(clerkMonitor);

  const customerScreenMat = createEmissiveLightboxMaterial({
    color: '#9bf6ff',
    intensity: 0.65,
  });
  const customerScreen = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.16, 0.22),
    charcoalMat,
  );
  customerScreen.position.set(0.09, 0.17, 0);
  customerScreen.rotation.z = 0.18;
  const custDisplay = markNoOutline(
    new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.12), customerScreenMat),
  );
  custDisplay.rotation.y = Math.PI * 0.5;
  custDisplay.position.x = 0.02;
  customerScreen.add(custDisplay);
  posGroup.add(customerScreen);

  const icReader = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.14), blueMat),
  );
  icReader.position.set(0.16, 0.012, 0.26);
  posGroup.add(icReader);
  checkoutZone.add(posGroup);

  // Warm amber countertop Hot Snack Case (ホットスナック) at (-4.82, counterTopY, -3.48)
  const snackCase = new THREE.Group();
  snackCase.name = 'hot-snack-case';
  snackCase.position.set(-4.82, counterTopY, -3.48);

  const snackBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.07, 0.58),
    charcoalMat,
  );
  snackBase.position.y = 0.035;
  snackCase.add(snackBase);

  const snackTopHood = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.06, 0.58),
    createToonMaterial({ color: PALETTE.warmAmber }),
  );
  snackTopHood.position.y = 0.39;
  snackCase.add(snackTopHood);

  const warmLampMat = createEmissiveLightboxMaterial({
    color: '#ffb86b',
    intensity: 0.85,
  });
  const warmLamp = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.022, 0.5), warmLampMat),
  );
  warmLamp.position.y = 0.35;
  snackCase.add(warmLamp);

  const snackGlass = markNoOutline(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.29, 0.56),
      createGlassMaterial({ tint: '#ffefd2', opacity: 0.22 }),
    ),
  );
  snackGlass.position.y = 0.215;
  snackCase.add(snackGlass);

  // Crispy golden karaage / korokke & steamed buns inside
  const morselGeo = new THREE.SphereGeometry(0.028, 8, 6);
  for (let row = 0; row < 2; row++) {
    const trayY = 0.09 + row * 0.13;
    const wireShelf = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.012, 0.48), silverMat),
    );
    wireShelf.position.y = trayY;
    snackCase.add(wireShelf);

    for (let k = 0; k < 4; k++) {
      const morsel = markNoOutline(
        new THREE.Mesh(morselGeo, row === 0 ? amberSnackMat : bunCreamMat),
      );
      morsel.scale.set(1.2, 0.75, 1.0);
      morsel.position.set(0.02, trayY + 0.026, -0.17 + k * 0.115);
      snackCase.add(morsel);
    }
  }
  checkoutZone.add(snackCase);

  // Stack of mint shopping baskets at end of counter
  const basketGeo = new THREE.BoxGeometry(0.3, 0.11, 0.22);
  for (let b = 0; b < 3; b++) {
    const basket = markNoOutline(new THREE.Mesh(basketGeo, mintMat));
    basket.position.set(-4.68, FLOOR_Y + 0.06 + b * 0.065, -4.0);
    checkoutZone.add(basket);
  }

  // --- Self-Serve Iced Coffee Machine ('interior-coffee-machine') ---
  const coffeeZone = new THREE.Group();
  coffeeZone.name = 'interior-coffee-machine';
  coffeeZone.position.set(-5.86, counterTopY, -1.8);

  const machineBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.52, 0.36),
    charcoalMat,
  );
  machineBody.position.set(-0.12, 0.26, 0);
  coffeeZone.add(machineBody);

  const frontSilverPanel = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.03), silverMat),
  );
  frontSilverPanel.position.set(-0.12, 0.32, 0.175);
  coffeeZone.add(frontSilverPanel);

  const buttonGlowMat = createEmissiveLightboxMaterial({
    color: PALETTE.softNeonCyan,
    intensity: 0.75,
  });
  for (const bx of [-0.2, -0.12, -0.04]) {
    const btn = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.032, 0.015), buttonGlowMat),
    );
    btn.position.set(bx, 0.4, 0.192);
    coffeeZone.add(btn);
  }

  // Clear top coffee-bean hopper
  const hopper = markNoOutline(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.065, 0.12, 12),
      createGlassMaterial({ tint: '#f7efe5', opacity: 0.28 }),
    ),
  );
  hopper.position.set(-0.12, 0.58, -0.02);
  coffeeZone.add(hopper);

  const beanMound = markNoOutline(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.06, 0.065, 10),
      createToonMaterial({ color: '#4a3222' }),
    ),
  );
  beanMound.position.set(-0.12, 0.555, -0.02);
  coffeeZone.add(beanMound);

  const dripTray = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.14), silverMat),
  );
  dripTray.position.set(-0.12, 0.02, 0.2);
  coffeeZone.add(dripTray);

  // Adjacent cup & lid stack caddy
  const cupCaddy = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.18, 0.24),
    oakWoodMat,
  );
  cupCaddy.position.set(0.22, 0.09, 0.02);
  coffeeZone.add(cupCaddy);

  const icedCupMat = createGlassMaterial({ tint: '#e8f8ff', opacity: 0.3 });
  const stackCupGeo = new THREE.CylinderGeometry(0.038, 0.028, 0.11, 10);
  for (let c = 0; c < 4; c++) {
    const clearCup = markNoOutline(new THREE.Mesh(stackCupGeo, icedCupMat));
    clearCup.position.set(0.17, 0.2 + c * 0.035, 0.02);
    coffeeZone.add(clearCup);

    const paperCup = markNoOutline(new THREE.Mesh(stackCupGeo, creamMat));
    paperCup.position.set(0.27, 0.2 + c * 0.035, 0.02);
    coffeeZone.add(paperCup);
  }

  // --- Retro Mint-Green Mini Desk Fan ('interior-desk-fan') ---
  const fanZone = new THREE.Group();
  fanZone.name = 'interior-desk-fan';
  fanZone.position.set(-4.84, counterTopY, -1.75);
  // Orient neutral direction diagonally across register & entrance (+X, +Z)
  fanZone.rotation.y = Math.PI * 0.3;

  const fanBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.105, 0.04, 14),
    mintMat,
  );
  fanBase.position.y = 0.02;
  fanZone.add(fanBase);

  for (let b = 0; b < 3; b++) {
    const speedBtn = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.012, 0.018), creamMat),
    );
    speedBtn.position.set(-0.025 + b * 0.025, 0.042, 0.055);
    fanZone.add(speedBtn);
  }

  const fanStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.02, 0.2, 8),
    silverMat,
  );
  fanStem.position.set(0, 0.13, -0.01);
  fanZone.add(fanStem);

  // Oscillating head pivot (oscillates around local Y)
  const deskFanHead = new THREE.Group();
  deskFanHead.name = 'desk-fan-head';
  deskFanHead.position.set(0, 0.24, 0);

  const motorPod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.042, 0.1, 12),
    mintMat,
  );
  motorPod.rotation.x = Math.PI * 0.5;
  motorPod.position.set(0, 0, -0.02);
  deskFanHead.add(motorPod);

  // Delicate circular wire guard cage (noOutline so wire rings stay light and airy)
  const outerGuard = markNoOutline(
    new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.007, 8, 20), silverMat),
  );
  outerGuard.position.set(0, 0, 0.048);
  deskFanHead.add(outerGuard);

  const innerGuard = markNoOutline(
    new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.005, 6, 16), silverMat),
  );
  innerGuard.position.set(0, 0, 0.058);
  deskFanHead.add(innerGuard);

  const centerBadge = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 10), mintMat),
  );
  centerBadge.rotation.x = Math.PI * 0.5;
  centerBadge.position.set(0, 0, 0.062);
  deskFanHead.add(centerBadge);

  // Spinning blades inside cage (spins smoothly around local Z)
  const deskFanBlades = new THREE.Group();
  deskFanBlades.name = 'desk-fan-blades';
  deskFanBlades.position.set(0, 0, 0.042);
  deskFanBlades.userData.spinAxis = 'z';

  const bladeHub = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), creamMat),
  );
  bladeHub.rotation.x = Math.PI * 0.5;
  deskFanBlades.add(bladeHub);

  const paddleGeo = new THREE.BoxGeometry(0.036, 0.088, 0.008);
  for (let p = 0; p < 4; p++) {
    const pivot = new THREE.Group();
    pivot.rotation.z = (p * Math.PI) / 2;
    const paddle = markNoOutline(new THREE.Mesh(paddleGeo, creamMat));
    paddle.position.set(0, 0.052, 0);
    paddle.rotation.y = 0.25;
    pivot.add(paddle);
    deskFanBlades.add(pivot);
  }

  deskFanHead.add(deskFanBlades);
  fanZone.add(deskFanHead);

  return { checkoutZone, coffeeZone, fanZone, deskFanHead, deskFanBlades };
}

function buildWindowDrinkBarZone(): THREE.Group {
  // Target footprint: X ∈ [-6.6, -4.1], Z ∈ [-1.05, -0.82]
  const zone = new THREE.Group();
  zone.name = 'interior-drink-bar';

  const oakWoodMat = createToonMaterial({ color: '#deb88a' });
  const mintMat = createToonMaterial({ color: PALETTE.mintGreen });
  const darkSteelMat = createToonMaterial({ color: '#2e3546' });
  const coralMat = createToonMaterial({ color: PALETTE.coralPink });

  // Window-facing counter plank strictly inside Z ∈ [-1.04, -0.85]
  const barPlank = new THREE.Mesh(
    new THREE.BoxGeometry(2.34, 0.045, 0.18),
    oakWoodMat,
  );
  barPlank.name = 'drink-bar-counter';
  barPlank.position.set(-5.35, FLOOR_Y + 0.72, -0.945);
  zone.add(barPlank);

  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.72, 8);
  for (const lx of [-6.42, -5.35, -4.28]) {
    const leg = new THREE.Mesh(legGeo, darkSteelMat);
    leg.position.set(lx, FLOOR_Y + 0.36, -0.945);
    zone.add(leg);
  }

  // 2 mint/wood stools tucked neatly under bar (Z = -0.95, radius = 0.088 -> Z ∈ [-1.038, -0.862])
  const seatGeo = new THREE.CylinderGeometry(0.088, 0.082, 0.055, 14);
  const stoolLegGeo = new THREE.CylinderGeometry(0.013, 0.011, 0.44, 6);
  for (const sx of [-5.88, -4.82]) {
    const stool = new THREE.Group();
    stool.name = 'drink-bar-stool';
    stool.position.set(sx, FLOOR_Y, -0.95);

    const cushion = new THREE.Mesh(seatGeo, mintMat);
    cushion.position.y = 0.45;
    stool.add(cushion);

    const woodSeatBase = markNoOutline(
      new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.08, 0.02, 12), oakWoodMat),
    );
    woodSeatBase.position.y = 0.415;
    stool.add(woodSeatBase);

    for (const [ox, oz] of [
      [-0.045, -0.045],
      [0.045, -0.045],
      [-0.045, 0.045],
      [0.045, 0.045],
    ]) {
      const sLeg = markNoOutline(new THREE.Mesh(stoolLegGeo, oakWoodMat));
      sLeg.position.set(ox, 0.21, oz);
      stool.add(sLeg);
    }

    zone.add(stool);
  }

  // Forgotten cold melon-soda cup + napkin caddy on the window bar
  const napkinBox = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.08), oakWoodMat),
  );
  napkinBox.position.set(-6.15, FLOOR_Y + 0.785, -0.945);
  zone.add(napkinBox);

  const coldDrinkCup = markNoOutline(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.028, 0.12, 10),
      createGlassMaterial({ tint: '#72efdd', opacity: 0.42 }),
    ),
  );
  coldDrinkCup.name = 'bar-iced-soda-cup';
  coldDrinkCup.position.set(-4.95, FLOOR_Y + 0.802, -0.945);
  zone.add(coldDrinkCup);

  const straw = markNoOutline(
    new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 6), coralMat),
  );
  straw.position.set(-4.94, FLOOR_Y + 0.84, -0.945);
  straw.rotation.z = -0.18;
  zone.add(straw);

  return zone;
}

function buildMagazineRackZone(): THREE.Group {
  // Target footprint: X ∈ [1.42, 1.85], Z ∈ [-3.8, -2.3]
  // Low window-side slanted rack (max Y ~ 1.42) so seaside window sightline stays open
  const zone = new THREE.Group();
  zone.name = 'interior-magazine-rack';
  zone.position.set(1.64, FLOOR_Y, -3.05);

  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const woodMat = createToonMaterial({ color: '#deb88a' });
  const whiteSpineMat = createToonMaterial({ color: '#ffffff' });

  const rackLen = 1.38;

  const baseCabinet = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.34, rackLen),
    woodMat,
  );
  baseCabinet.position.set(0, 0.17, 0);
  zone.add(baseCabinet);

  const backBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.82, rackLen),
    creamMat,
  );
  backBoard.position.set(0.14, 0.41, 0);
  zone.add(backBoard);

  const coverColors = [
    PALETTE.coralPink,
    PALETTE.seaSaltBlue,
    PALETTE.warmAmber,
    PALETTE.mintGreen,
    PALETTE.peachOrange,
    PALETTE.softNeonPink,
  ];
  const coverMats = coverColors.map((hex) => createToonMaterial({ color: hex }));
  const magGeo = new THREE.BoxGeometry(0.022, 0.21, 0.155);
  const titleStripGeo = new THREE.BoxGeometry(0.026, 0.042, 0.14);

  for (let tier = 0; tier < 3; tier++) {
    const tx = -0.08 + tier * 0.085;
    const ty = 0.4 + tier * 0.18;

    const ledge = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, rackLen - 0.04), creamMat),
    );
    ledge.position.set(tx, ty - 0.08, 0);
    zone.add(ledge);

    for (let m = 0; m < 7; m++) {
      const mz = -0.54 + m * 0.18;
      const magMat = coverMats[(m + tier * 2) % coverMats.length];
      const mag = markNoOutline(new THREE.Mesh(magGeo, magMat));
      mag.name = `magazine-issue-${tier}-${m}`;
      mag.position.set(tx, ty + 0.02, mz);
      mag.rotation.z = -0.24;

      const header = markNoOutline(new THREE.Mesh(titleStripGeo, whiteSpineMat));
      header.position.y = 0.065;
      mag.add(header);
      zone.add(mag);
    }
  }

  return zone;
}

function buildLockersZone(): THREE.Group {
  // Target footprint: X ∈ [-6.8, -5.6], Z ∈ [-6.6, -5.0]
  const zone = new THREE.Group();
  zone.name = 'interior-lockers';
  zone.position.set(-6.45, FLOOR_Y, -5.8);

  const creamMat = createToonMaterial({ color: PALETTE.creamWhite });
  const seaBlueMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const lightBlueMat = createToonMaterial({ color: PALETTE.seaSaltLight });
  const handleMat = createToonMaterial({ color: '#394459' });
  const terminalGlow = createEmissiveLightboxMaterial({
    color: PALETTE.softNeonCyan,
    intensity: 0.65,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.74, 1.42), creamMat);
  body.position.set(0, 0.87, 0);
  zone.add(body);

  const topCap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 1.44), seaBlueMat);
  topCap.position.set(0.01, 1.76, 0);
  zone.add(topCap);

  const doorGeo = new THREE.BoxGeometry(0.024, 0.36, 0.41);
  const handleGeo = new THREE.BoxGeometry(0.018, 0.09, 0.022);

  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 4; row++) {
      const dz = -0.45 + col * 0.45;
      const dy = 0.25 + row * 0.39;

      if (col === 1 && row === 2) {
        // Smart parcel locker touchscreen console
        const consolePanel = markNoOutline(
          new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.36, 0.41), handleMat),
        );
        consolePanel.position.set(0.265, dy, dz);
        zone.add(consolePanel);

        const screen = markNoOutline(
          new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), terminalGlow),
        );
        screen.rotation.y = Math.PI * 0.5;
        screen.position.set(0.282, dy + 0.03, dz);
        zone.add(screen);
        continue;
      }

      const dMat = (col + row) % 2 === 0 ? lightBlueMat : creamMat;
      const door = markNoOutline(new THREE.Mesh(doorGeo, dMat));
      door.name = `locker-door-${col}-${row}`;
      door.position.set(0.262, dy, dz);
      zone.add(door);

      const handle = markNoOutline(new THREE.Mesh(handleGeo, handleMat));
      handle.position.set(0.278, dy, dz - 0.14);
      zone.add(handle);
    }
  }

  return zone;
}

function buildFloorGuidesZone(): THREE.Group {
  const zone = new THREE.Group();
  zone.name = 'interior-floor-guides';

  const guideYellowMat = createToonMaterial({ color: '#ffd166' });
  const guideBlueMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const guideMintMat = createToonMaterial({ color: PALETTE.mintGreen });

  const y = FLOOR_Y + 0.003;

  // Entrance interior welcome / directional decal inside sliding doors
  const entranceOuter = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.004, 0.28), guideBlueMat),
  );
  entranceOuter.name = 'floor-guide-entrance';
  entranceOuter.position.set(-2.5, y, -1.06);
  zone.add(entranceOuter);

  const entranceInner = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.005, 0.18), guideMintMat),
  );
  entranceInner.position.set(-2.5, y + 0.001, -1.06);
  zone.add(entranceInner);

  // Yellow checkout queue waiting lines & footstep decals in front of register
  const lineGeo = new THREE.BoxGeometry(0.075, 0.004, 0.58);
  const footGeo = new THREE.CylinderGeometry(0.036, 0.032, 0.005, 10);

  for (let i = 0; i < 2; i++) {
    const qx = -4.18 + i * 0.42;
    const waitBar = markNoOutline(new THREE.Mesh(lineGeo, guideYellowMat));
    waitBar.name = `floor-guide-register-line-${i}`;
    waitBar.position.set(qx, y, -2.62);
    zone.add(waitBar);

    for (const fz of [-2.71, -2.53]) {
      const foot = markNoOutline(new THREE.Mesh(footGeo, guideYellowMat));
      foot.scale.set(1.45, 1, 0.85);
      foot.position.set(qx + 0.14, y + 0.001, fz);
      zone.add(foot);
    }
  }

  return zone;
}

function buildPostersAndLightboxesZone(): {
  zone: THREE.Group;
  lightboxMaterials: THREE.MeshStandardMaterial[];
} {
  const zone = new THREE.Group();
  zone.name = 'interior-posters-lightboxes';
  const lightboxMaterials: THREE.MeshStandardMaterial[] = [];

  const frameMat = createToonMaterial({ color: PALETTE.creamWhite });
  const rodMat = createToonMaterial({ color: '#dce4ec' });

  const lightboxSpecs: {
    name: string;
    kana: string;
    sub: string;
    accent: string;
    x: number;
    y: number;
    z: number;
    width: number;
    rotateY: number;
  }[] = [
    {
      name: 'lightbox-drinks',
      kana: 'おのみもの',
      sub: 'COLD DRINKS',
      accent: PALETTE.mintGreen,
      x: -1.52,
      y: 3.12,
      z: -6.38,
      width: 1.56,
      rotateY: 0,
    },
    {
      name: 'lightbox-bento',
      kana: 'おべんとう・おにぎり',
      sub: 'BENTO & ONIGIRI',
      accent: PALETTE.peachOrange,
      x: 0.72,
      y: 3.12,
      z: -4.42,
      width: 1.48,
      rotateY: 0,
    },
    {
      name: 'lightbox-cafe-counter',
      kana: 'いれたて珈琲・レジ',
      sub: 'CAFE & CHECKOUT',
      accent: PALETTE.warmAmber,
      x: -4.48,
      y: 3.12,
      z: -2.68,
      width: 1.44,
      rotateY: Math.PI * 0.5,
    },
  ];

  const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6);

  for (const spec of lightboxSpecs) {
    const lbGroup = new THREE.Group();
    lbGroup.name = spec.name;
    lbGroup.position.set(spec.x, spec.y, spec.z);
    lbGroup.rotation.y = spec.rotateY;

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width, 0.3, 0.06),
      frameMat,
    );
    lbGroup.add(housing);

    const signTex = createCategoryLightboxTexture(spec.kana, spec.sub, spec.accent);
    const lbMat = createEmissiveLightboxMaterial({
      color: '#fff9eb',
      map: signTex,
      intensity: 0.82,
    });
    lightboxMaterials.push(lbMat);

    for (const side of [-1, 1]) {
      const face = markNoOutline(
        new THREE.Mesh(new THREE.PlaneGeometry(spec.width - 0.06, 0.25), lbMat),
      );
      face.position.z = side * 0.033;
      if (side < 0) {
        face.rotation.y = Math.PI;
      }
      lbGroup.add(face);
    }

    for (const rx of [-spec.width * 0.36, spec.width * 0.36]) {
      const rod = markNoOutline(new THREE.Mesh(rodGeo, rodMat));
      rod.position.set(rx, 0.36, 0);
      lbGroup.add(rod);
    }

    zone.add(lbGroup);
  }

  // Indoor summer promotional posters on left & back interior walls
  const posterVariants: {
    variant: 'koori' | 'hanabi' | 'matsuri';
    x: number;
    y: number;
    z: number;
    ry: number;
  }[] = [
    { variant: 'koori', x: -6.82, y: 2.34, z: -2.95, ry: Math.PI * 0.5 },
    { variant: 'hanabi', x: -6.82, y: 2.34, z: -4.15, ry: Math.PI * 0.5 },
    { variant: 'matsuri', x: -6.18, y: 2.28, z: -7.44, ry: 0 },
  ];

  for (const p of posterVariants) {
    const posterTex = createFestivalPosterTexture(p.variant);
    const posterGroup = new THREE.Group();
    posterGroup.name = `interior-poster-${p.variant}`;
    posterGroup.position.set(p.x, p.y, p.z);
    posterGroup.rotation.y = p.ry;

    const frame = markNoOutline(
      new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.02), frameMat),
    );
    posterGroup.add(frame);

    const art = markNoOutline(
      new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.66),
        createToonMaterial({ color: '#ffffff', map: posterTex }),
      ),
    );
    art.position.z = 0.013;
    posterGroup.add(art);

    zone.add(posterGroup);
  }

  return { zone, lightboxMaterials };
}

function buildBackDoorZone(): THREE.Group {
  // Backroom utility door at X = -5.25, Z = -7.46 with round porthole window
  const zone = new THREE.Group();
  zone.name = 'interior-back-door';
  zone.position.set(-5.25, FLOOR_Y, -7.45);

  const frameMat = createToonMaterial({ color: PALETTE.creamWhite });
  const doorBlueMat = createToonMaterial({ color: PALETTE.seaSaltBlue });
  const silverMat = createToonMaterial({ color: '#cfd8e3' });
  const rimDarkMat = createToonMaterial({ color: '#2b3447' });

  // Outer door frame
  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 1.96, 0.06),
    frameMat,
  );
  doorFrame.position.set(0, 0.98, -0.01);
  zone.add(doorFrame);

  // Door panel
  const doorLeaf = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.88, 0.055),
    doorBlueMat,
  );
  doorLeaf.name = 'backroom-door-leaf';
  doorLeaf.position.set(0, 0.94, 0.015);
  zone.add(doorLeaf);

  // Brushed silver kickplate
  const kickplate = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.24, 0.012), silverMat),
  );
  kickplate.position.set(0, 0.14, 0.048);
  zone.add(kickplate);

  // Round porthole window
  const portholeRim = markNoOutline(
    new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.022, 10, 22), rimDarkMat),
  );
  portholeRim.name = 'backroom-porthole-rim';
  portholeRim.position.set(0, 1.32, 0.048);
  zone.add(portholeRim);

  const portholeGlassMat = createEmissiveLightboxMaterial({
    color: '#ffe6b8',
    intensity: 0.45,
  });
  const portholePane = markNoOutline(
    new THREE.Mesh(new THREE.CircleGeometry(0.132, 20), portholeGlassMat),
  );
  portholePane.name = 'backroom-porthole-window';
  portholePane.position.set(0, 1.32, 0.049);
  zone.add(portholePane);

  // L-shaped door lever handle
  const handlePlate = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.015), silverMat),
  );
  handlePlate.position.set(0.29, 0.96, 0.048);
  zone.add(handlePlate);

  const lever = markNoOutline(
    new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.025), silverMat),
  );
  lever.position.set(0.255, 0.96, 0.068);
  zone.add(lever);

  return zone;
}

export function buildStoreInterior(): StoreInteriorResult {
  const group = new THREE.Group();
  group.name = 'konbini-interior';

  const summerDisplay = buildSummerDisplayZone();
  const gondolaShelves = buildGondolaShelvesZone();
  const bentoOnigiri = buildBentoOnigiriZone();
  const { fridgesZone, mistZone, coldMistParticles } = buildDrinkFridgesAndMistZones();
  const iceCreamFreezer = buildIceCreamFreezerZone();
  const {
    checkoutZone,
    coffeeZone,
    fanZone,
    deskFanHead,
    deskFanBlades,
  } = buildCheckoutCoffeeAndFanZones();
  const drinkBar = buildWindowDrinkBarZone();
  const magazineRack = buildMagazineRackZone();
  const lockers = buildLockersZone();
  const floorGuides = buildFloorGuidesZone();
  const { zone: postersLightboxes, lightboxMaterials: interiorLightboxMaterials } =
    buildPostersAndLightboxesZone();
  const backDoor = buildBackDoorZone();

  group.add(
    summerDisplay,
    gondolaShelves,
    bentoOnigiri,
    fridgesZone,
    mistZone,
    iceCreamFreezer,
    checkoutZone,
    coffeeZone,
    fanZone,
    drinkBar,
    magazineRack,
    lockers,
    floorGuides,
    postersLightboxes,
    backDoor,
  );

  // Apply crisp anime miniature outlines to primary furniture silhouettes before adding floor/ceiling
  applyOutlinesToHierarchy(group, 0.008);

  const interiorWarmLights = buildFloorCeilingAndWarmLights(group);

  return {
    group,
    deskFanHead,
    deskFanBlades,
    coldMistParticles,
    interiorLightboxMaterials,
    interiorWarmLights,
  };
}
