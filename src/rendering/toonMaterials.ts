import * as THREE from 'three';

export interface ToonMaterialOptions {
  color: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  emissiveMap?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

const OUTLINE_INK_DEFAULT = '#23293d';

let sharedGradientMap: THREE.DataTexture | null = null;
const scratchColor = new THREE.Color();
const toonMaterialCache = new Map<string, THREE.MeshToonMaterial>();
const outlineMaterialCache = new Map<string, THREE.MeshBasicMaterial>();

/**
 * Returns a cached 4-step RGBA cel-shaded DataTexture (NearestFilter)
 * transitioning from cool sea-salt dusk shadow to warm peach/cream highlight.
 */
export function getSharedToonGradientMap(): THREE.DataTexture {
  if (sharedGradientMap) {
    return sharedGradientMap;
  }

  // 4 RGBA steps:
  // Step 0: Cool dusk indigo/sea-salt shadow (B > R)
  // Step 1: Soft cool-blue mid-shadow (B > R)
  // Step 2: Warm cream lit midtone (R > B)
  // Step 3: Warm sunlit peach-cream highlight (R > B)
  const data = new Uint8Array([
    98, 120, 162, 255,
    148, 166, 196, 255,
    218, 210, 198, 255,
    255, 244, 232, 255,
  ]);

  const texture = new THREE.DataTexture(
    data,
    4,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  sharedGradientMap = texture;
  return texture;
}

/**
 * Creates an anime miniature cel-shaded MeshToonMaterial using the shared
 * 4-step warm/cool gradient ramp plus a subtle matte-plastic rim sheen.
 */
export function createToonMaterial(
  options: ToonMaterialOptions,
): THREE.MeshToonMaterial {
  const hasEmissive = options.emissive !== undefined || options.emissiveMap != null;
  const emissiveIntensity = options.emissiveIntensity ?? (hasEmissive ? 1.0 : 0.0);
  const transparent = options.transparent ?? false;
  const opacity = options.opacity ?? 1.0;
  const side = options.side ?? THREE.FrontSide;
  const canCache = !options.map && !options.emissiveMap;

  let cacheKey = '';
  if (canCache) {
    const colorHex = scratchColor.set(options.color).getHexString();
    const emissiveHex =
      options.emissive !== undefined
        ? scratchColor.set(options.emissive).getHexString()
        : '000000';
    cacheKey = `${colorHex}|${emissiveHex}|${emissiveIntensity.toFixed(4)}|${transparent ? 1 : 0}|${opacity.toFixed(4)}|${side}`;
    const existing = toonMaterialCache.get(cacheKey);
    if (existing) {
      return existing;
    }
  }

  const material = new THREE.MeshToonMaterial({
    color: options.color,
    map: options.map ?? null,
    gradientMap: getSharedToonGradientMap(),
    emissive: options.emissive ?? (options.emissiveMap ? '#ffffff' : '#000000'),
    emissiveIntensity,
    emissiveMap: options.emissiveMap ?? null,
    transparent,
    opacity,
    side,
  });

  if (material.transparent || material.opacity < 1) {
    material.userData.noOutline = true;
  }

  material.customProgramCacheKey = () => 'konbini-toon-warmcool-v1';
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <gradientmap_pars_fragment>',
        /* glsl */ `
        #ifdef USE_GRADIENTMAP
          uniform sampler2D gradientMap;
        #endif
        vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
          float dotNL = dot( normal, lightDirection );
          vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
          #ifdef USE_GRADIENTMAP
            return texture2D( gradientMap, coord ).rgb;
          #else
            vec2 fw = fwidth( coord ) * 0.5;
            return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
          #endif
        }
        `,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        /* glsl */ `
        float fresnelRim = 1.0 - max( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0 );
        vec3 plasticRim = vec3( 0.046, 0.042, 0.050 ) * smoothstep( 0.58, 0.92, fresnelRim );
        vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + plasticRim;
        `,
      );
  };

  if (canCache) {
    toonMaterialCache.set(cacheKey, material);
  }
  return material;
}

/**
 * Creates crystal-clear storefront/fridge glass material (`opacity <= 0.18`,
 * `depthWrite: false`, `userData.noOutline = true`) so interior details stay 100% crisp.
 */
export function createGlassMaterial(options?: {
  tint?: THREE.ColorRepresentation;
  opacity?: number;
}): THREE.MeshPhysicalMaterial {
  const opacity = Math.min(options?.opacity ?? 0.15, 0.18);
  const material = new THREE.MeshPhysicalMaterial({
    color: options?.tint ?? '#dcf3ff',
    transparent: true,
    opacity,
    roughness: 0.07,
    metalness: 0.02,
    reflectivity: 0.65,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  material.userData = {
    ...material.userData,
    noOutline: true,
  };
  return material;
}

/**
 * Creates a warm emissive signboard/lightbox material tuned for subtle high-threshold
 * bloom while keeping dark kana typography on `map` razor-sharp via `emissiveMap`.
 */
export function createEmissiveLightboxMaterial(options: {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  intensity?: number;
}): THREE.MeshStandardMaterial {
  const tex = options.map ?? null;
  const tint = options.color ?? '#fff8ec';
  const material = new THREE.MeshStandardMaterial({
    color: tex ? '#ffffff' : tint,
    map: tex,
    emissive: tint,
    emissiveMap: tex,
    emissiveIntensity: options.intensity ?? 1.25,
    roughness: 0.36,
    metalness: 0.04,
  });
  return material;
}

/**
 * Computes and caches welded smooth vertex normals (`aOutlineNormal`) on a BufferGeometry
 * so sharp-edged boxes and cylinders receive continuous gap-free inverted-hull outlines
 * without altering `position` or bounding boxes.
 */
function ensureSmoothOutlineNormals(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute('aOutlineNormal')) {
    return;
  }

  const posAttr = geometry.getAttribute('position');
  if (!posAttr) {
    return;
  }

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  const normAttr = geometry.getAttribute('normal');
  const count = posAttr.count;

  const accum = new Map<string, [number, number, number]>();
  const keys = new Array<string>(count);

  for (let i = 0; i < count; i++) {
    const px = Math.round(posAttr.getX(i) * 10000);
    const py = Math.round(posAttr.getY(i) * 10000);
    const pz = Math.round(posAttr.getZ(i) * 10000);
    const key = `${px}_${py}_${pz}`;
    keys[i] = key;

    const nx = normAttr ? normAttr.getX(i) : 0;
    const ny = normAttr ? normAttr.getY(i) : 1;
    const nz = normAttr ? normAttr.getZ(i) : 0;

    const entry = accum.get(key);
    if (entry) {
      entry[0] += nx;
      entry[1] += ny;
      entry[2] += nz;
    } else {
      accum.set(key, [nx, ny, nz]);
    }
  }

  const smoothArray = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const sum = accum.get(keys[i])!;
    const len = Math.hypot(sum[0], sum[1], sum[2]);
    if (len > 1e-5) {
      smoothArray[i * 3] = sum[0] / len;
      smoothArray[i * 3 + 1] = sum[1] / len;
      smoothArray[i * 3 + 2] = sum[2] / len;
    } else {
      // Fallback radial normal from local origin
      const rx = posAttr.getX(i);
      const ry = posAttr.getY(i);
      const rz = posAttr.getZ(i);
      const rLen = Math.hypot(rx, ry, rz) || 1;
      smoothArray[i * 3] = rx / rLen;
      smoothArray[i * 3 + 1] = ry / rLen;
      smoothArray[i * 3 + 2] = rz / rLen;
    }
  }

  geometry.setAttribute('aOutlineNormal', new THREE.BufferAttribute(smoothArray, 3));
}

function createOutlineHullMaterial(
  thickness: number,
  color: THREE.ColorRepresentation,
): THREE.MeshBasicMaterial {
  const thicknessKey = thickness.toFixed(5);
  const colorHex = scratchColor.set(color).getHexString();
  const cacheKey = `${thicknessKey}|${colorHex}`;
  const cached = outlineMaterialCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const material = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  material.userData = {
    noOutline: true,
    isOutlineMaterial: true,
    outlineThickness: thickness,
  };

  material.customProgramCacheKey = () => `konbini-inverted-hull-outline-${thicknessKey}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec3 aOutlineNormal;
        uniform float uOutlineThickness;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vec3 outlineAxisScale = max(
          vec3(
            length( modelMatrix[ 0 ].xyz ),
            length( modelMatrix[ 1 ].xyz ),
            length( modelMatrix[ 2 ].xyz )
          ),
          vec3( 0.0001 )
        );
        vec3 outlineDir = length( aOutlineNormal ) > 0.0001
          ? normalize( aOutlineNormal )
          : vec3( 0.0, 1.0, 0.0 );
        transformed += ( outlineDir * uOutlineThickness ) / outlineAxisScale;
        `,
      );
  };

  outlineMaterialCache.set(cacheKey, material);
  return material;
}

function shouldSkipOutline(mesh: THREE.Mesh): boolean {
  let cursor: THREE.Object3D | null = mesh;
  while (cursor) {
    if (cursor.userData?.noOutline === true || cursor.userData?.isOutline === true) {
      return true;
    }
    cursor = cursor.parent;
  }

  if (mesh.children.some((child) => child.userData?.isOutline === true)) {
    return true;
  }

  if (!mesh.geometry || !mesh.geometry.getAttribute('position')) {
    return true;
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.length === 0) {
    return true;
  }

  for (const mat of materials) {
    if (!mat) return true;
    if (mat.transparent === true || mat.opacity < 1 || mat.userData?.noOutline === true) {
      return true;
    }
  }

  return false;
}

/**
 * Adds a BackSide ink-colored inverted-hull outline shell to `mesh` unless `mesh`,
 * an ancestor, or its material is transparent / marked `noOutline` / `isOutline`.
 */
export function addInvertedHullOutline(
  mesh: THREE.Mesh,
  thickness = 0.018,
  color: THREE.ColorRepresentation = OUTLINE_INK_DEFAULT,
): THREE.Mesh | null {
  if (shouldSkipOutline(mesh)) {
    return null;
  }

  ensureSmoothOutlineNormals(mesh.geometry);
  const outlineMat = createOutlineHullMaterial(thickness, color);
  const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
  outlineMesh.name = `${mesh.name || 'mesh'}-outline`;
  outlineMesh.userData = {
    isOutline: true,
    noOutline: true,
    outlineThickness: thickness,
  };
  outlineMesh.castShadow = false;
  outlineMesh.receiveShadow = false;
  outlineMesh.raycast = () => {
    // Outlines should never intercept raycasts
  };

  mesh.add(outlineMesh);
  return outlineMesh;
}

/**
 * Traverses `root` and applies BackSide ink outlines to eligible opaque meshes.
 * Returns the count of newly created outline meshes.
 */
export function applyOutlinesToHierarchy(
  root: THREE.Object3D,
  defaultThickness = 0.018,
): number {
  const candidates: THREE.Mesh[] = [];

  const visit = (node: THREE.Object3D): void => {
    if (node.userData?.noOutline === true || node.userData?.isOutline === true) {
      return;
    }
    if ((node as THREE.Mesh).isMesh) {
      candidates.push(node as THREE.Mesh);
    }
    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);

  let created = 0;
  for (const mesh of candidates) {
    const customThickness =
      typeof mesh.userData?.outlineThickness === 'number'
        ? (mesh.userData.outlineThickness as number)
        : defaultThickness;
    const customColor =
      (mesh.userData?.outlineColor as THREE.ColorRepresentation | undefined) ??
      OUTLINE_INK_DEFAULT;
    if (addInvertedHullOutline(mesh, customThickness, customColor)) {
      created += 1;
    }
  }

  return created;
}

/**
 * Creates a stylized wet asphalt puddle ShaderMaterial reflecting the peach/coral
 * midsummer dusk sky, sea-salt twilight, concentric AC/breeze ripples, and warm store glow.
 */
export function createWetPuddleMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      uTime: { value: 0 },
      uRippleCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleProgress: { value: 0 },
      uDoorLightBoost: { value: 0 },
      uSkyPeach: { value: new THREE.Color('#ff9e7d') },
      uSkyCoral: { value: new THREE.Color('#ff7b89') },
      uSkyBlue: { value: new THREE.Color('#5b8fb9') },
      uStoreAmber: { value: new THREE.Color('#ffb86b') },
      uWetBase: { value: new THREE.Color('#1f273b') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4( position, 1.0 );
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize( mat3( modelMatrix ) * normal );
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uRippleCenter;
      uniform float uRippleProgress;
      uniform float uDoorLightBoost;
      uniform vec3 uSkyPeach;
      uniform vec3 uSkyCoral;
      uniform vec3 uSkyBlue;
      uniform vec3 uStoreAmber;
      uniform vec3 uWetBase;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        // Support both UV-space [0..1] ripple center and world-XZ ripple center
        bool isWorldCenter = abs( uRippleCenter.x - 0.5 ) > 0.65 || abs( uRippleCenter.y - 0.5 ) > 0.65;
        vec2 delta = isWorldCenter ? ( vWorldPos.xz - uRippleCenter ) * 1.35 : ( vUv - uRippleCenter ) * 2.0;
        float radialDist = length( delta );

        // Gentle breeze micro-shimmer across wet film
        float breezeWave = sin( vWorldPos.x * 5.2 + uTime * 1.6 ) * cos( vWorldPos.z * 4.7 - uTime * 1.25 ) * 0.03;

        // Concentric droplet ripple ring synced to uRippleProgress
        float ringRadius = uRippleProgress * 0.85;
        float ringBand = exp( -pow( ( radialDist - ringRadius ) * 14.0, 2.0 ) ) * ( 1.0 - smoothstep( 0.72, 1.0, uRippleProgress ) );
        float secondaryRing = exp( -pow( ( radialDist - max( 0.0, ringRadius - 0.18 ) ) * 16.0, 2.0 ) ) * 0.55 * ( 1.0 - uRippleProgress );
        float ripplePerturb = ( ringBand + secondaryRing ) * sin( radialDist * 34.0 - uTime * 8.0 );

        vec3 viewDir = normalize( cameraPosition - vWorldPos );
        vec3 perturbedNormal = normalize( vWorldNormal + vec3( breezeWave + ripplePerturb * 0.14, 0.0, -breezeWave + ripplePerturb * 0.14 ) );
        vec3 reflDir = reflect( -viewDir, perturbedNormal );

        // Dusk sky reflection gradient (peach/coral grazing horizon -> cool sea-salt twilight overhead)
        float skyElev = clamp( reflDir.y * 1.15 + breezeWave * 1.6, 0.0, 1.0 );
        vec3 duskSkyRefl = mix( uSkyPeach, uSkyCoral, smoothstep( 0.0, 0.22, skyElev ) );
        duskSkyRefl = mix( duskSkyRefl, uSkyBlue, smoothstep( 0.18, 0.56, skyElev ) );

        // Warm konbini interior/signage amber reflection band boosted when automatic doors slide open
        float storeProximity = 1.0 - smoothstep( 1.2, 8.2, length( vWorldPos.xz - vec2( -2.5, 0.2 ) ) );
        float amberBand = ( 0.26 + 0.48 * uDoorLightBoost ) * ( 0.35 + 0.65 * storeProximity );
        float shimmer = 0.5 + 0.5 * sin( vWorldPos.x * 7.5 + vWorldPos.z * 3.5 + uTime * 2.1 );
        vec3 warmGlow = uStoreAmber * amberBand * ( 0.72 + 0.28 * shimmer );

        float fresnel = pow( 1.0 - clamp( dot( viewDir, perturbedNormal ), 0.0, 1.0 ), 2.2 );
        vec3 puddleColor = mix( uWetBase, duskSkyRefl, 0.18 + 0.55 * fresnel ) + warmGlow * 0.30;
        puddleColor += vec3( 0.92, 0.90, 0.96 ) * ( ringBand * 0.34 + secondaryRing * 0.18 );

        // Smooth feathering to 0.0 alpha before polygon rim (organic puddle rim UVs start at ~0.58)
        float uvEdgeDist = length( ( vUv - vec2( 0.5 ) ) * 2.0 );
        float innerFeather = 1.0 - smoothstep( 0.36, 0.58, uvEdgeDist );
        float outerFeather = 1.0 - smoothstep( 0.55, 0.96, uvEdgeDist );
        float edgeAlpha = innerFeather * outerFeather;
        float alpha = clamp( ( 0.58 + 0.28 * fresnel + ringBand * 0.22 ) * edgeAlpha, 0.0, 0.84 );

        gl_FragColor = vec4( puddleColor, alpha );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  material.userData = {
    noOutline: true,
  };
  return material;
}

/**
 * Creates the top water surface ShaderMaterial for the seaside resin ocean block,
 * combining a mint-aqua -> sea-salt blue -> deep cerulean resin gradient with
 * stylized painted white anime shoreline foam bands and cel water caustics.
 */
export function createResinWaterSurfaceMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWavePhase: { value: 0 },
      uShallowMint: { value: new THREE.Color('#68d3b8') },
      uMidAqua: { value: new THREE.Color('#5b9bd5') },
      uDeepResin: { value: new THREE.Color('#1d6fa5') },
      uFoamWhite: { value: new THREE.Color('#f8fcff') },
      uDuskGlint: { value: new THREE.Color('#ffb08e') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWavePhase;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vUv = uv;
        vec3 displaced = position;
        float swell = sin( position.x * 2.2 - uTime * 1.5 + uWavePhase ) * 0.018
                    + cos( position.y * 1.7 + position.z * 1.7 + uTime * 1.1 ) * 0.010;
        displaced.z += normal.z * swell;
        displaced.y += normal.y * swell;

        vec4 worldPos = modelMatrix * vec4( displaced, 1.0 );
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize( mat3( modelMatrix ) * normal );
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uWavePhase;
      uniform vec3 uShallowMint;
      uniform vec3 uMidAqua;
      uniform vec3 uDeepResin;
      uniform vec3 uFoamWhite;
      uniform vec3 uDuskGlint;

      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      float celCausticPattern( vec2 p, float t ) {
        float w1 = sin( p.x * 3.6 + sin( p.y * 2.8 + t * 0.9 ) + t * 0.8 );
        float w2 = cos( p.y * 3.9 - sin( p.x * 2.5 - t * 0.7 ) + t * 0.65 );
        float net = abs( w1 + w2 );
        return 1.0 - smoothstep( 0.08, 0.22, net );
      }

      void main() {
        // Depth progression from shoreline (-X / low uv.x) to outer cut-edge (+X / high uv.x)
        float worldDepthT = clamp( ( vWorldPos.x - 7.45 ) / 4.4, 0.0, 1.0 );
        float depthFactor = clamp( mix( vUv.x, worldDepthT, 0.75 ), 0.0, 1.0 );

        // 3-stop hand-painted anime sea-salt resin gradient
        vec3 waterColor = mix( uShallowMint, uMidAqua, smoothstep( 0.06, 0.48, depthFactor ) );
        waterColor = mix( waterColor, uDeepResin, smoothstep( 0.45, 0.96, depthFactor ) );

        // Stylized anime cel-shaded caustic network
        float caustic = celCausticPattern( vWorldPos.xz * 0.95, uTime );
        waterColor = mix( waterColor, mix( waterColor, uFoamWhite, 0.36 ), caustic * ( 0.42 - 0.18 * depthFactor ) );

        // Hand-painted white anime shoreline foam bands (primary & secondary scalloped ribbons)
        float alongShoreWave = sin( vWorldPos.z * 1.45 + uTime * 0.9 ) * 0.045
                             + sin( vWorldPos.z * 3.3 - uTime * 1.35 ) * 0.022;
        float surgeShift = sin( uTime * 1.25 + uWavePhase ) * 0.045;
        float shoreCoord = depthFactor + alongShoreWave - surgeShift;

        float primaryFoam = 1.0 - smoothstep( 0.0, 0.075, abs( shoreCoord - 0.045 ) );
        float secondaryFoam = ( 1.0 - smoothstep( 0.0, 0.032, abs( shoreCoord - 0.175 ) ) ) * 0.78;
        float laceCutout = step( 0.25, 0.5 + 0.5 * sin( vWorldPos.z * 6.5 - uTime * 1.8 ) );
        float foamMask = clamp( primaryFoam + secondaryFoam * laceCutout, 0.0, 1.0 );

        // Dusk peach sky specular glint across gentle swells
        vec3 viewDir = normalize( cameraPosition - vWorldPos );
        float fresnel = pow( 1.0 - clamp( dot( viewDir, vWorldNormal ), 0.0, 1.0 ), 2.6 );
        float glintWave = smoothstep( 0.72, 0.95, sin( vWorldPos.x * 3.8 - uTime * 1.7 + sin( vWorldPos.z * 2.2 ) ) );
        waterColor += uDuskGlint * ( fresnel * 0.22 + glintWave * 0.12 * ( 1.0 - foamMask ) );

        vec3 finalColor = mix( waterColor, uFoamWhite, foamMask * 0.92 );
        float alpha = mix( 0.78, 0.88, depthFactor );
        alpha = max( alpha, foamMask * 0.95 );

        gl_FragColor = vec4( finalColor, alpha );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  material.userData = {
    noOutline: true,
  };
  return material;
}

/**
 * Creates a polished crystal-clear epoxy resin cut-edge material (`noOutline = true`)
 * for the vertical cross-section walls of the square seaside diorama block.
 */
export function createResinCutEdgeMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#66dce8',
    emissive: new THREE.Color('#2eaec8'),
    emissiveIntensity: 0.35,
    transmission: 0,
    transparent: true,
    opacity: 0.55,
    roughness: 0.06,
    metalness: 0.0,
    reflectivity: 0.88,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  material.userData = {
    ...material.userData,
    noOutline: true,
  };
  return material;
}
