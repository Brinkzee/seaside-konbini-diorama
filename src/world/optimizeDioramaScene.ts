import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnimationTargets } from '../animation/animationSystem';
import { createToonMaterial } from '../rendering/toonMaterials';

const PROTECTED_SEMANTIC_NAMES = new Set<string>([
  'seaside-konbini-diorama',
  'base-and-road',
  'seaside-zone',
  'konbini-structure',
  'exterior-props',
  'konbini-interior',
  'base-tray',
  'asphalt-road',
  'zebra-crosswalk',
  'parking-bay',
  'drainage-gutter',
  'wet-puddles',
  'street-guardrails',
  'street-signs',
  'traffic-signal',
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
  'konbini-building',
  'konbini-signboard',
  'pylon-sign',
  'striped-awning',
  'wind-chime',
  'sliding-door-left',
  'sliding-door-right',
  'welcome-mat',
  'storefront-windows',
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
]);

function collectProtectedSubtreeRoots(targets: AnimationTargets): Set<THREE.Object3D> {
  const roots = new Set<THREE.Object3D>();
  const singleTargets: Array<THREE.Object3D | undefined> = [
    targets.slidingDoorLeft,
    targets.slidingDoorRight,
    targets.awningValance,
    targets.windChimePendulum,
    targets.flutteringPosterCorner,
    targets.foamStripMesh,
    targets.lighthouseRotor,
    targets.acFanWheel,
    targets.acWaterDrop,
    targets.acRippleRing,
    targets.deskFanHead,
    targets.deskFanBlades,
  ];
  for (const obj of singleTargets) {
    if (obj) roots.add(obj);
  }
  for (const list of [
    targets.treeFoliageClusters,
    targets.overheadWires,
    targets.coldMistParticles,
  ]) {
    if (list) {
      for (const item of list) {
        roots.add(item);
      }
    }
  }
  return roots;
}

function collectAnimatedMaterials(targets: AnimationTargets): Set<THREE.Material> {
  const mats = new Set<THREE.Material>();
  const singleMats: Array<THREE.Material | undefined> = [
    targets.skyMaterial,
    targets.waterSurfaceMaterial,
    targets.wetSandMaterial,
    targets.crosswalkMaterial,
    targets.trafficLightBulbs?.red,
    targets.trafficLightBulbs?.yellow,
    targets.trafficLightBulbs?.green,
  ];
  for (const m of singleMats) {
    if (m) mats.add(m);
  }
  for (const list of [
    targets.puddleMaterials,
    targets.signLightboxMaterials,
    targets.interiorLightboxMaterials,
    targets.vendingGlowMaterials,
  ]) {
    if (list) {
      for (const m of list) {
        mats.add(m);
      }
    }
  }
  return mats;
}

function hasProtectedAncestorOutsideContainer(
  node: THREE.Object3D,
  containerRoot: THREE.Object3D,
  protectedRoots: Set<THREE.Object3D>,
): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== containerRoot) {
    if (protectedRoots.has(cursor)) {
      return true;
    }
    cursor = cursor.parent;
  }
  return false;
}

function ensureIndexedGeometry(geom: THREE.BufferGeometry): void {
  if (geom.index !== null) {
    return;
  }
  const posAttr = geom.getAttribute('position');
  if (!posAttr) {
    return;
  }
  const count = posAttr.count;
  const indexArray = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    indexArray[i] = i;
  }
  geom.setIndex(new THREE.BufferAttribute(indexArray, 1));
}

function flipTriangleWinding(geom: THREE.BufferGeometry): void {
  const index = geom.index;
  if (!index) {
    return;
  }
  for (let i = 0; i + 2 < index.count; i += 3) {
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    index.setX(i + 1, c);
    index.setX(i + 2, b);
  }
}

function toFloat32Attribute(
  attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  targetItemSize: number,
): THREE.BufferAttribute {
  if (
    attr instanceof THREE.BufferAttribute &&
    attr.array instanceof Float32Array &&
    attr.itemSize === targetItemSize &&
    !attr.normalized
  ) {
    return attr;
  }
  const count = attr.count;
  const out = new Float32Array(count * targetItemSize);
  for (let i = 0; i < count; i++) {
    out[i * targetItemSize] = attr.getX(i);
    if (targetItemSize >= 2) out[i * targetItemSize + 1] = attr.getY(i);
    if (targetItemSize >= 3) out[i * targetItemSize + 2] = attr.getZ(i);
    if (targetItemSize >= 4) out[i * targetItemSize + 3] = attr.getW(i);
  }
  return new THREE.BufferAttribute(out, targetItemSize);
}

function isPureDiffuseToonMaterial(mat: THREE.Material): mat is THREE.MeshToonMaterial {
  return (
    mat instanceof THREE.MeshToonMaterial &&
    !mat.map &&
    !mat.emissiveMap &&
    (mat.emissiveIntensity === 0 || mat.emissive.getHex() === 0)
  );
}

function isPureUnlitBasicMaterial(mat: THREE.Material): mat is THREE.MeshBasicMaterial {
  return mat instanceof THREE.MeshBasicMaterial && !mat.map;
}

function isPureEmissiveOrStandardMaterial(
  mat: THREE.Material,
): mat is THREE.MeshStandardMaterial {
  return (
    mat instanceof THREE.MeshStandardMaterial &&
    !(mat instanceof THREE.MeshPhysicalMaterial) &&
    !mat.map &&
    !mat.emissiveMap &&
    !mat.roughnessMap &&
    !mat.metalnessMap &&
    !mat.normalMap
  );
}

interface OutlineBatchItem {
  mesh: THREE.Mesh;
  geom: THREE.BufferGeometry;
}

interface MeshBatchBucket {
  material: THREE.Material;
  items: Array<{ mesh: THREE.Mesh; geom: THREE.BufferGeometry }>;
  anyCastShadow: boolean;
  anyReceiveShadow: boolean;
  renderOrder: number;
}

function compactContainerHierarchy(
  containerRoot: THREE.Object3D,
  protectedRoots: Set<THREE.Object3D>,
  animatedMaterials: Set<THREE.Material>,
  batchContainerName: string | null,
  freezeStaticMatrices: boolean,
): void {
  containerRoot.updateMatrixWorld(true);
  const invContainerMatrix = containerRoot.matrixWorld.clone().invert();

  const outlineBuckets = new Map<string, OutlineBatchItem[]>();
  const meshBuckets = new Map<string, MeshBatchBucket>();

  const vertexColorToonMats = new Map<THREE.Side, THREE.MeshToonMaterial>();
  const getSharedVertexColorToonMat = (side: THREE.Side): THREE.MeshToonMaterial => {
    let m = vertexColorToonMats.get(side);
    if (!m) {
      m = createToonMaterial({ color: '#ffffff', side });
      m.vertexColors = true;
      m.userData.noOutline = true;
      vertexColorToonMats.set(side, m);
    }
    return m;
  };

  const vertexColorBasicMats = new Map<THREE.Side, THREE.MeshBasicMaterial>();
  const getSharedVertexColorBasicMat = (side: THREE.Side): THREE.MeshBasicMaterial => {
    let m = vertexColorBasicMats.get(side);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, side });
      m.userData.noOutline = true;
      vertexColorBasicMats.set(side, m);
    }
    return m;
  };

  containerRoot.traverse((obj) => {
    if (obj === containerRoot || !(obj instanceof THREE.Mesh)) {
      return;
    }
    if (!obj.visible || !obj.geometry || !obj.geometry.getAttribute('position')) {
      return;
    }
    if (PROTECTED_SEMANTIC_NAMES.has(obj.name)) {
      return;
    }
    if (hasProtectedAncestorOutsideContainer(obj, containerRoot, protectedRoots)) {
      return;
    }
    if (Array.isArray(obj.material) || !obj.material) {
      return;
    }

    const mat = obj.material;

    // 1. Static inverted-hull outline shell
    if (obj.userData?.isOutline === true) {
      const basicMat = mat as THREE.MeshBasicMaterial;
      const colorHex = basicMat.color ? basicMat.color.getHexString() : '23293d';
      const relMatrix = invContainerMatrix.clone().multiply(obj.matrixWorld);
      const e = relMatrix.elements;
      const sx = Math.max(0.0001, Math.hypot(e[0], e[1], e[2]));
      const sy = Math.max(0.0001, Math.hypot(e[4], e[5], e[6]));
      const sz = Math.max(0.0001, Math.hypot(e[8], e[9], e[10]));

      const thickness =
        typeof obj.userData?.outlineThickness === 'number'
          ? obj.userData.outlineThickness
          : typeof mat.userData?.outlineThickness === 'number'
            ? mat.userData.outlineThickness
            : 0.015;

      const geom = obj.geometry.clone();
      ensureIndexedGeometry(geom);

      const posAttr = geom.getAttribute('position');
      const normAttr = geom.getAttribute('aOutlineNormal') ?? geom.getAttribute('normal');
      const count = posAttr.count;
      const displaced = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        let nx = normAttr ? normAttr.getX(i) : 0;
        let ny = normAttr ? normAttr.getY(i) : 1;
        let nz = normAttr ? normAttr.getZ(i) : 0;
        const len = Math.hypot(nx, ny, nz);
        if (len > 0.0001) {
          nx /= len;
          ny /= len;
          nz /= len;
        } else {
          nx = 0;
          ny = 1;
          nz = 0;
        }
        displaced[i * 3] = posAttr.getX(i) + (nx * thickness) / sx;
        displaced[i * 3 + 1] = posAttr.getY(i) + (ny * thickness) / sy;
        displaced[i * 3 + 2] = posAttr.getZ(i) + (nz * thickness) / sz;
      }

      geom.setAttribute('position', new THREE.BufferAttribute(displaced, 3));
      for (const attrName of Object.keys(geom.attributes)) {
        if (attrName !== 'position') {
          geom.deleteAttribute(attrName);
        }
      }
      geom.morphAttributes = {};
      geom.clearGroups();
      geom.applyMatrix4(relMatrix);
      if (relMatrix.determinant() < 0) {
        flipTriangleWinding(geom);
      }

      let bucket = outlineBuckets.get(colorHex);
      if (!bucket) {
        bucket = [];
        outlineBuckets.set(colorHex, bucket);
      }
      bucket.push({ mesh: obj, geom });
      return;
    }

    // 2. Skip skyDome / ignoreBounds or custom ShaderMaterials
    if (obj.userData?.ignoreBounds === true || mat instanceof THREE.ShaderMaterial) {
      return;
    }

    const isTransparent = mat.transparent === true || (mat.opacity ?? 1) < 1;
    const isAnimMat = animatedMaterials.has(mat);

    // Keep all architectural/ocean transparent panes (renderOrder > 0), depth-writing
    // transparents, and animated materials unmerged so 3D alpha sorting stays 100% exact;
    // only batch localized coplanar prop glass (renderOrder === 0, depthWrite === false) sharing one Material.
    if (isTransparent && (isAnimMat || mat.depthWrite !== false || obj.renderOrder !== 0)) {
      return;
    }

    let bucketKey: string;
    let targetMaterial: THREE.Material = mat;
    let bakeDiffuseIntoVertexColor = false;
    let bakeColor = new THREE.Color(1, 1, 1);

    if (!isTransparent && !isAnimMat && isPureDiffuseToonMaterial(mat)) {
      bucketKey = `toon-vc|side:${mat.side}`;
      targetMaterial = getSharedVertexColorToonMat(mat.side);
      bakeDiffuseIntoVertexColor = true;
      bakeColor = mat.color;
    } else if (!isTransparent && !isAnimMat && isPureUnlitBasicMaterial(mat)) {
      bucketKey = `basic-vc|side:${mat.side}`;
      targetMaterial = getSharedVertexColorBasicMat(mat.side);
      bakeDiffuseIntoVertexColor = true;
      bakeColor = mat.color;
    } else if (!isTransparent && !isAnimMat && isPureEmissiveOrStandardMaterial(mat)) {
      const hasVC = Boolean(mat.vertexColors && obj.geometry.getAttribute('color'));
      bucketKey = `std|${mat.color.getHexString()}|${mat.emissive.getHexString()}|${mat.emissiveIntensity.toFixed(3)}|${mat.roughness.toFixed(2)}|${mat.metalness.toFixed(2)}|${mat.side}|vc:${hasVC ? 1 : 0}`;
    } else {
      const hasVC = Boolean(mat.vertexColors && obj.geometry.getAttribute('color'));
      bucketKey = `uuid|${mat.uuid}|ro:${obj.renderOrder}|vc:${hasVC ? 1 : 0}`;
    }

    const geom = obj.geometry.clone();
    ensureIndexedGeometry(geom);
    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }

    const posAttr = toFloat32Attribute(geom.getAttribute('position'), 3);
    const normAttr = toFloat32Attribute(geom.getAttribute('normal'), 3);
    const rawUv = geom.getAttribute('uv');
    const uvAttr = rawUv
      ? toFloat32Attribute(rawUv, 2)
      : new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2);

    let colorAttr: THREE.BufferAttribute | null = null;
    if (bakeDiffuseIntoVertexColor) {
      const existingColor = mat.vertexColors ? geom.getAttribute('color') : null;
      const colors = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        const er = existingColor ? existingColor.getX(i) : 1;
        const eg = existingColor ? existingColor.getY(i) : 1;
        const eb = existingColor ? existingColor.getZ(i) : 1;
        colors[i * 3] = bakeColor.r * er;
        colors[i * 3 + 1] = bakeColor.g * eg;
        colors[i * 3 + 2] = bakeColor.b * eb;
      }
      colorAttr = new THREE.BufferAttribute(colors, 3);
    } else if (mat.vertexColors && geom.getAttribute('color')) {
      colorAttr = toFloat32Attribute(geom.getAttribute('color'), 3);
    }

    for (const attrName of Object.keys(geom.attributes)) {
      geom.deleteAttribute(attrName);
    }
    geom.setAttribute('position', posAttr);
    geom.setAttribute('normal', normAttr);
    geom.setAttribute('uv', uvAttr);
    if (colorAttr) {
      geom.setAttribute('color', colorAttr);
    }
    geom.morphAttributes = {};
    geom.clearGroups();

    const relMatrix = invContainerMatrix.clone().multiply(obj.matrixWorld);
    geom.applyMatrix4(relMatrix);
    if (relMatrix.determinant() < 0) {
      flipTriangleWinding(geom);
    }

    let meshBucket = meshBuckets.get(bucketKey);
    if (!meshBucket) {
      meshBucket = {
        material: targetMaterial,
        items: [],
        anyCastShadow: false,
        anyReceiveShadow: false,
        renderOrder: obj.renderOrder,
      };
      meshBuckets.set(bucketKey, meshBucket);
    }
    meshBucket.items.push({ mesh: obj, geom });
    if (obj.castShadow) meshBucket.anyCastShadow = true;
    if (obj.receiveShadow) meshBucket.anyReceiveShadow = true;
  });

  const outputTarget: THREE.Object3D = batchContainerName
    ? (() => {
        const g = new THREE.Group();
        g.name = batchContainerName;
        return g;
      })()
    : containerRoot;

  const mergedMeshesToRemove = new Set<THREE.Mesh>();

  // Emit merged outline batches
  for (const [colorHex, items] of outlineBuckets.entries()) {
    if (items.length === 0) continue;
    const mergedGeom = mergeGeometries(
      items.map((it) => it.geom),
      false,
    );
    if (!mergedGeom) continue;
    mergedGeom.computeBoundingBox();
    mergedGeom.computeBoundingSphere();

    const outlineMat = new THREE.MeshBasicMaterial({
      color: `#${colorHex}`,
      side: THREE.BackSide,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    outlineMat.userData = { noOutline: true, isOutlineMaterial: true };

    const batchedOutline = new THREE.Mesh(mergedGeom, outlineMat);
    batchedOutline.name = `batched-outline-${colorHex}`;
    batchedOutline.userData = {
      isOutline: true,
      noOutline: true,
      ignoreBounds: true,
    };
    batchedOutline.castShadow = false;
    batchedOutline.receiveShadow = false;
    batchedOutline.raycast = () => {};
    if (freezeStaticMatrices) {
      batchedOutline.updateMatrix();
      batchedOutline.matrixAutoUpdate = false;
    }
    outputTarget.add(batchedOutline);

    for (const it of items) {
      mergedMeshesToRemove.add(it.mesh);
      it.geom.dispose();
    }
  }

  // Emit merged solid & depthWrite=false glass batches
  let batchIdx = 0;
  for (const bucket of meshBuckets.values()) {
    if (bucket.items.length < 2) {
      bucket.items[0]?.geom.dispose();
      continue;
    }

    const mergedGeom = mergeGeometries(
      bucket.items.map((it) => it.geom),
      false,
    );
    if (!mergedGeom) {
      for (const it of bucket.items) it.geom.dispose();
      continue;
    }
    mergedGeom.computeBoundingBox();
    mergedGeom.computeBoundingSphere();

    const batchedMesh = new THREE.Mesh(mergedGeom, bucket.material);
    batchedMesh.name = `batched-mesh-${batchIdx++}`;
    batchedMesh.userData = { noOutline: true };
    batchedMesh.castShadow = bucket.anyCastShadow;
    batchedMesh.receiveShadow = bucket.anyReceiveShadow;
    batchedMesh.renderOrder = bucket.renderOrder;
    if (freezeStaticMatrices) {
      batchedMesh.updateMatrix();
      batchedMesh.matrixAutoUpdate = false;
    }
    outputTarget.add(batchedMesh);

    for (const it of bucket.items) {
      mergedMeshesToRemove.add(it.mesh);
      it.geom.dispose();
    }
  }

  // Detach merged leaf meshes while preserving any surviving unmerged children
  for (const mesh of mergedMeshesToRemove) {
    if (mesh.children.length > 0) {
      let survivingParent = mesh.parent;
      while (survivingParent && mergedMeshesToRemove.has(survivingParent as THREE.Mesh)) {
        survivingParent = survivingParent.parent;
      }
      const targetParent = survivingParent ?? containerRoot;
      for (const child of [...mesh.children]) {
        if (!mergedMeshesToRemove.has(child as THREE.Mesh)) {
          targetParent.attach(child);
        }
      }
    }
    mesh.parent?.remove(mesh);
  }

  if (outputTarget !== containerRoot && outputTarget.children.length > 0) {
    containerRoot.add(outputTarget);
  }
}

/**
 * Compacts static opaque solid meshes, static inverted-hull outline shells, and rigid
 * multi-part animated subtrees into minimal GPU draw-call batches while preserving all
 * 62 semantic groups, 11 animations, and [-12, 12] world bounds.
 */
export function optimizeDioramaScene(
  rootDioramaGroup: THREE.Group,
  animationTargets: AnimationTargets,
): void {
  const protectedSubtreeRoots = collectProtectedSubtreeRoots(animationTargets);
  const animatedMaterials = collectAnimatedMaterials(animationTargets);

  // Safety pass: ensure zero materials retain transmission > 0
  rootDioramaGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        const maybePhys = m as unknown as { transmission?: number; needsUpdate?: boolean };
        if (typeof maybePhys?.transmission === 'number' && maybePhys.transmission > 0) {
          maybePhys.transmission = 0;
          maybePhys.needsUpdate = true;
        }
      }
    }
  });

  // 1. Compact multi-mesh rigid animated subtrees in their own local coordinate space
  // (e.g. awningValance 18 parts -> 2, slidingDoorLeft/Right, deskFanBlades, acFanWheel, treeFoliageClusters)
  for (const animRoot of protectedSubtreeRoots) {
    if (animRoot instanceof THREE.Group && animRoot.children.length > 0) {
      compactContainerHierarchy(animRoot, protectedSubtreeRoots, animatedMaterials, null, false);
    }
  }

  // 2. Compact all static meshes across rootDioramaGroup into 'batched-static-meshes'
  compactContainerHierarchy(
    rootDioramaGroup,
    protectedSubtreeRoots,
    animatedMaterials,
    'batched-static-meshes',
    true,
  );

  rootDioramaGroup.updateMatrixWorld(true);

  // 3. Freeze matrixAutoUpdate on all remaining non-animated static leaf meshes
  rootDioramaGroup.traverse((obj) => {
    if (
      obj instanceof THREE.Mesh &&
      !protectedSubtreeRoots.has(obj) &&
      !hasProtectedAncestorOutsideContainer(obj, rootDioramaGroup, protectedSubtreeRoots)
    ) {
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    }
  });
}
