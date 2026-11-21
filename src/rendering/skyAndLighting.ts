import * as THREE from 'three';

export interface SkyAndLightingRig {
  group: THREE.Group;
  skyDome: THREE.Mesh;
  skyMaterial: THREE.ShaderMaterial;
  sunsetDirLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  doorSpillLight: THREE.PointLight;
}

/**
 * Builds the midsummer seaside dusk sky dome (peach #ff9e7d & coral #ff7b89 horizon
 * transitioning smoothly to sea-salt blue #5b8fb9 & zenith indigo #1f305e with slow
 * anime cel clouds) alongside cool dusk hemisphere light, warm low directional sunset
 * light with soft shadows, and warm konbini doorway light spill.
 */
export function createSkyAndLighting(): SkyAndLightingRig {
  const group = new THREE.Group();
  group.name = 'sky-and-lighting';

  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uHorizonPeach: { value: new THREE.Color('#ff9e7d') },
      uCoralPink: { value: new THREE.Color('#ff7b89') },
      uSeaSaltBlue: { value: new THREE.Color('#5b8fb9') },
      uZenithIndigo: { value: new THREE.Color('#1f305e') },
      uLowerMidBlue: { value: new THREE.Color('#1b2b4e') },
      uLowerDeepAbyss: { value: new THREE.Color('#121d38') },
      uCloudLit: { value: new THREE.Color('#ffd4b8') },
      uCloudShade: { value: new THREE.Color('#d98fa6') },
      uSunDirection: { value: new THREE.Vector3(-0.64, 0.12, -0.76).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;

      void main() {
        vWorldDir = position;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uHorizonPeach;
      uniform vec3 uCoralPink;
      uniform vec3 uSeaSaltBlue;
      uniform vec3 uZenithIndigo;
      uniform vec3 uLowerMidBlue;
      uniform vec3 uLowerDeepAbyss;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudShade;
      uniform vec3 uSunDirection;

      varying vec3 vWorldDir;

      float hash21( vec2 p ) {
        vec3 p3 = fract( vec3( ( p + vec2( 37.17, 91.53 ) ).xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
        p3 += dot( p3, p3.yzx + 33.33 );
        return fract( ( p3.x + p3.y ) * p3.z );
      }

      vec2 hash22( vec2 p ) {
        vec3 p3 = fract( vec3( ( p + vec2( 37.17, 91.53 ) ).xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
        p3 += dot( p3, p3.yzx + 33.33 );
        vec2 v = fract( ( p3.xx + p3.yz ) * p3.zy ) * 2.0 - 1.0;
        float lenSq = dot( v, v );
        return lenSq > 0.0001 ? v * inversesqrt( lenSq ) : vec2( 0.70710678, 0.70710678 );
      }

      float isotropicNoise( vec2 p ) {
        vec2 i = floor( p );
        vec2 f = fract( p );
        vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
        float n00 = dot( hash22( i + vec2( 0.0, 0.0 ) ), f - vec2( 0.0, 0.0 ) );
        float n10 = dot( hash22( i + vec2( 1.0, 0.0 ) ), f - vec2( 1.0, 0.0 ) );
        float n01 = dot( hash22( i + vec2( 0.0, 1.0 ) ), f - vec2( 0.0, 1.0 ) );
        float n11 = dot( hash22( i + vec2( 1.0, 1.0 ) ), f - vec2( 1.0, 1.0 ) );
        float nx0 = mix( n00, n10, u.x );
        float nx1 = mix( n01, n11, u.x );
        return clamp( 0.5 + 0.68 * mix( nx0, nx1, u.y ), 0.0, 1.0 );
      }

      float fbmClouds3( vec2 p ) {
        const mat2 octaveRot = mat2( 0.8, -0.6, 0.6, 0.8 );
        float sum = 0.0;
        float amp = 0.56;
        for ( int i = 0; i < 3; i++ ) {
          sum += amp * isotropicNoise( p );
          p = octaveRot * p * 2.03 + vec2( 13.7, 7.3 );
          amp *= 0.50;
        }
        return sum;
      }

      float fbmClouds2( vec2 p ) {
        const mat2 octaveRot = mat2( 0.8, -0.6, 0.6, 0.8 );
        float s0 = isotropicNoise( p ) * 0.64;
        p = octaveRot * p * 2.03 + vec2( 13.7, 7.3 );
        return s0 + isotropicNoise( p ) * 0.34;
      }

      void main() {
        vec3 dir = normalize( vWorldDir );
        float elev = dir.y;

        // Compressed multi-stop anime midsummer dusk gradient visible in both 3/4 and eye-level views:
        // peach/coral near [-0.03..0.07] -> sea-salt blue (#5b8fb9) by 0.15 -> indigo (#1f305e) above 0.30
        vec3 upperSky = uHorizonPeach;
        upperSky = mix( upperSky, uCoralPink, smoothstep( -0.02, 0.07, elev ) );
        upperSky = mix( upperSky, uSeaSaltBlue, smoothstep( 0.05, 0.16, elev ) );
        upperSky = mix( upperSky, uZenithIndigo, smoothstep( 0.16, 0.34, elev ) );

        // Smooth continuous lower hemisphere transition into #1b2b4e -> #121d38 (no hard horizon seam)
        vec3 lowerSky = mix( uLowerDeepAbyss, uLowerMidBlue, smoothstep( -0.48, -0.14, elev ) );
        float horizonBlend = smoothstep( -0.22, 0.04, elev );
        vec3 skyColor = mix( lowerSky, upperSky, horizonBlend );

        // Warm sunset atmospheric halo toward dusk sun azimuth
        float sunAlignment = max( dot( dir, normalize( uSunDirection ) ), 0.0 );
        float sunGlow = pow( sunAlignment, 5.0 ) * smoothstep( -0.14, 0.22, 0.24 - abs( elev - 0.05 ) );
        skyColor += uHorizonPeach * ( sunGlow * 0.24 );

        // Soft drifting two-tone cel-shaded evening clouds across the dusk band (5 trig-free evaluations total)
        if ( elev > -0.02 && elev < 0.48 ) {
          vec2 domeUv = dir.xz / ( max( elev, 0.0 ) + 0.35 ) + vec2( 19.4, 8.7 );
          vec2 drift = vec2( uTime * 0.0085, uTime * 0.0022 );
          float cloudShape = fbmClouds3( domeUv * 1.18 + drift );

          float horizonFade = smoothstep( -0.01, 0.06, elev ) * ( 1.0 - smoothstep( 0.24, 0.46, elev ) );
          float cloudBody = smoothstep( 0.50, 0.68, cloudShape ) * horizonFade;
          float cloudRimLit = smoothstep( 0.52, 0.70, fbmClouds2( domeUv * 1.18 + drift - vec2( 0.06, 0.05 ) ) );

          vec3 cloudCol = mix( uCloudShade, uCloudLit, clamp( cloudRimLit * 0.75 + sunAlignment * 0.35, 0.0, 1.0 ) );
          skyColor = mix( skyColor, cloudCol, cloudBody * 0.52 );
        }

        // Faint circular evening stars high in the indigo zenith (trig-free twinkle)
        if ( elev > 0.32 ) {
          vec2 starCoord = dir.xz * 120.0 + dir.y * 38.0 + vec2( 23.1, 41.7 );
          vec2 starCell = floor( starCoord );
          vec2 starLocal = fract( starCoord ) - vec2( 0.5 );
          float starSeed = hash21( starCell );
          if ( starSeed > 0.992 ) {
            float radialDot = 1.0 - smoothstep( 0.06, 0.26, length( starLocal ) );
            float triWave = abs( fract( uTime * 0.28 + starSeed * 9.7 ) * 2.0 - 1.0 );
            float twinkle = 0.55 + 0.45 * triWave;
            float zenithMask = smoothstep( 0.32, 0.62, elev );
            skyColor += vec3( 0.88, 0.92, 1.0 ) * ( 0.28 * radialDot * twinkle * zenithMask );
          }
        }

        gl_FragColor = vec4( skyColor, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  skyMaterial.userData = { noOutline: true };

  const skyGeo = new THREE.SphereGeometry(96, 48, 32);
  const skyDome = new THREE.Mesh(skyGeo, skyMaterial);
  skyDome.name = 'dusk-sky-dome';
  skyDome.userData.ignoreBounds = true;
  skyDome.userData.noOutline = true;
  skyDome.frustumCulled = false;
  group.add(skyDome);

  // Cool sea-salt dusk sky hemisphere ambient (#6896ca / #283858, ~0.72) so konbini glows as warmest beacon
  const hemiLight = new THREE.HemisphereLight('#6896ca', '#283858', 0.72);
  hemiLight.name = 'dusk-hemisphere-light';
  hemiLight.position.set(0, 20, 0);
  group.add(hemiLight);

  // Low-angle warm peach-orange sunset directional light (~0.78) with soft miniature shadows
  const sunsetDirLight = new THREE.DirectionalLight('#ffa87d', 0.78);
  sunsetDirLight.name = 'sunset-directional-light';
  sunsetDirLight.position.set(-15.5, 9.8, 13.5);
  sunsetDirLight.target.position.set(0, 0.5, -1.0);
  sunsetDirLight.castShadow = true;
  sunsetDirLight.shadow.mapSize.set(2048, 2048);
  sunsetDirLight.shadow.camera.near = 1.0;
  sunsetDirLight.shadow.camera.far = 52.0;
  sunsetDirLight.shadow.camera.left = -16.5;
  sunsetDirLight.shadow.camera.right = 16.5;
  sunsetDirLight.shadow.camera.top = 16.5;
  sunsetDirLight.shadow.camera.bottom = -16.5;
  sunsetDirLight.shadow.bias = -0.00045;
  sunsetDirLight.shadow.normalBias = 0.022;
  sunsetDirLight.shadow.radius = 2.4;
  group.add(sunsetDirLight);
  group.add(sunsetDirLight.target);

  // Warm 3000K konbini doorway beacon light spill (#ffd48a) onto welcome mat, flip-flops, and front sidewalk
  const doorSpillLight = new THREE.PointLight('#ffd48a', 1.5, 9.2, 1.55);
  doorSpillLight.name = 'konbini-door-spill-light';
  doorSpillLight.position.set(-2.5, 2.15, -0.22);
  doorSpillLight.castShadow = false;
  group.add(doorSpillLight);

  return {
    group,
    skyDome,
    skyMaterial,
    sunsetDirLight,
    hemiLight,
    doorSpillLight,
  };
}
