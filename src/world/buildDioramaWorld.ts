import * as THREE from 'three';
import { type AnimationTargets, updateDioramaAnimations } from '../animation/animationSystem';
import { createSkyAndLighting, type SkyAndLightingRig } from '../rendering/skyAndLighting';
import { buildBaseAndRoad } from './baseAndRoad';
import { buildExteriorProps } from './exteriorProps';
import { optimizeDioramaScene } from './optimizeDioramaScene';
import { buildSeasideZone } from './seasideZone';
import { buildStoreInterior } from './storeInterior';
import { buildStoreStructure } from './storeStructure';

export interface DioramaWorld {
  scene: THREE.Scene;
  rootDioramaGroup: THREE.Group;
  animationTargets: AnimationTargets;
  skyAndLighting: SkyAndLightingRig;
}

function configureDioramaShadows(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) {
      return;
    }
    if (obj.userData?.isOutline || obj.userData?.ignoreBounds) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      return;
    }

    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    const isShaderOrTransparent = materials.some(
      (mat) =>
        mat instanceof THREE.ShaderMaterial ||
        (mat?.transparent === true && (mat.opacity ?? 1) < 0.95),
    );

    if (isShaderOrTransparent) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      return;
    }

    obj.receiveShadow = true;
    if (!obj.userData?.noOutline) {
      obj.castShadow = true;
    }
  });
}

export function buildDioramaWorld(): DioramaWorld {
  const scene = new THREE.Scene();
  scene.name = 'seaside-konbini-scene';
  scene.background = new THREE.Color('#1a2542');

  const skyAndLighting = createSkyAndLighting();
  skyAndLighting.skyDome.userData.ignoreBounds = true;
  skyAndLighting.skyDome.userData.noOutline = true;
  scene.add(skyAndLighting.group);

  const rootDioramaGroup = new THREE.Group();
  rootDioramaGroup.name = 'seaside-konbini-diorama';

  const baseAndRoad = buildBaseAndRoad();
  const seasideZone = buildSeasideZone();
  const storeStructure = buildStoreStructure();
  const storeInterior = buildStoreInterior();
  const exteriorProps = buildExteriorProps();

  rootDioramaGroup.add(
    baseAndRoad.group,
    seasideZone.group,
    storeStructure.group,
    storeInterior.group,
    exteriorProps.group,
  );

  configureDioramaShadows(rootDioramaGroup);
  scene.add(rootDioramaGroup);

  const animationTargets: AnimationTargets = {
    skyMaterial: skyAndLighting.skyMaterial,
    waterSurfaceMaterial: seasideZone.waterSurfaceMaterial,
    foamStripMesh: seasideZone.foamStripMesh,
    puddleMaterials: baseAndRoad.puddleMaterials,
    wetSandMaterial: seasideZone.wetSandMaterial,
    crosswalkMaterial: baseAndRoad.crosswalkMaterial,
    slidingDoorLeft: storeStructure.slidingDoorLeft,
    slidingDoorRight: storeStructure.slidingDoorRight,
    doorSpillLight: skyAndLighting.doorSpillLight,
    awningValance: storeStructure.awningValance,
    windChimePendulum: storeStructure.windChimePendulum,
    flutteringPosterCorner: exteriorProps.flutteringPosterCorner,
    treeFoliageClusters: exteriorProps.treeFoliageClusters,
    overheadWires: exteriorProps.overheadWires,
    acFanWheel: exteriorProps.acFanWheel,
    acWaterDrop: exteriorProps.acWaterDrop,
    acRippleRing: exteriorProps.acRippleRing,
    signLightboxMaterials: storeStructure.signLightboxMaterials,
    interiorLightboxMaterials: storeInterior.interiorLightboxMaterials,
    vendingGlowMaterials: exteriorProps.vendingGlowMaterials,
    coldMistParticles: storeInterior.coldMistParticles,
    deskFanHead: storeInterior.deskFanHead,
    deskFanBlades: storeInterior.deskFanBlades,
    trafficLightBulbs: baseAndRoad.trafficLightBulbs,
    lighthouseRotor: seasideZone.lighthouseRotor,
  };

  updateDioramaAnimations(animationTargets, 0, 0);
  optimizeDioramaScene(rootDioramaGroup, animationTargets);
  scene.updateMatrixWorld(true);

  return {
    scene,
    rootDioramaGroup,
    animationTargets,
    skyAndLighting,
  };
}
