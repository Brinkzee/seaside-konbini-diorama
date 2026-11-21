# Module Contracts, Spatial Coordinates & File Ownership Specification

> **Authoritative Parallel Contract**: Every swarm worker MUST follow the exact file ownership, TypeScript export signatures, coordinate bounds, and Object3D naming conventions defined in this document so all parallel modules compile and integrate cleanly with zero collisions.

## 1. Strict File Ownership Matrix (Zero Overlap)

| Worker Name | Owned Files (Create / Edit ONLY these) | Forbidden |
|---|---|---|
| `infra-env` | `package.json`, `index.html`, `src/config/paletteAndBounds.ts`, `tests/zeroUiDom.test.ts`, `tests/paletteAndBounds.test.ts` | Everything else |
| `render-core` | `src/rendering/toonMaterials.ts`, `src/rendering/canvasTextures.ts`, `src/rendering/skyAndLighting.ts`, `src/rendering/postProcessing.ts`, `tests/toonMaterials.test.ts`, `tests/canvasTextures.test.ts` | Everything else |
| `world-road-seaside` | `src/world/baseAndRoad.ts`, `src/world/seasideZone.ts`, `tests/roadAndSeaside.test.ts` | Everything else |
| `world-konbini-ext` | `src/world/storeStructure.ts`, `src/world/exteriorProps.ts`, `tests/konbiniExterior.test.ts` | Everything else |
| `world-konbini-int` | `src/world/storeInterior.ts`, `tests/konbiniInterior.test.ts` | Everything else |
| `anim-integrator` | `src/animation/animationSystem.ts`, `src/world/buildDioramaWorld.ts`, `src/app/DioramaApp.ts`, `src/main.ts`, `tests/animationSystem.test.ts`, `tests/worldBoundsAndContent.test.ts` | Owned files of other workers |
| `verifier` | Read-only + test/build/browser verification + screenshot capture under own brain folder | Editing source files |

**Command Execution Safety Rule for ALL Workers**:
- Do NOT run interactive git commands or hang on slow npm registries.
- When `infra-env` installs npm packages in `d:\PycharmProjects\Ultra\seaside-konbini-diorama`, use:
  `npm.cmd install --no-audit --no-fund --fetch-timeout=15000 --fetch-retries=1`
  and if the default registry times out or stalls >25s, immediately run with `--registry=https://registry.npmmirror.com`.

---

## 2. Coordinate System & Master Spatial Zones (`X, Z ∈ [-12, 12]`)

- **World Axes**: `+X` = Right (toward alley, beach, ocean), `-X` = Left (parking bay & side street), `+Z` = Front (street corner intersection & crosswalk), `-Z` = Back (behind konbini & distant seawall/lighthouse), `+Y` = Up.
- **Hard Horizontal Boundary**: EVERY physical mesh/group in the diorama (except the sky dome marked `userData.ignoreBounds = true`) MUST have its world-space bounding box strictly inside **`X ∈ [-12.0, 12.0]`** and **`Z ∈ [-12.0, 12.0]`**! Keep centers and dimensions conservatively inside `[-11.95, 11.95]` (including rotated corners, tree leaves, lighthouse beam cone, surfboard, wires, and truck bumpers).

### Exact Elevation & Footprint Map
1. **Collector Square Base (`baseAndRoad.ts`)**:
   - Outer wooden/matte-resin collector frame: `X ∈ [-12.0, 12.0], Z ∈ [-12.0, 12.0], Y ∈ [-1.45, -1.05]`.
   - Subsurface terrain slab (concrete/earth/sand bed): `X ∈ [-11.92, 11.92], Z ∈ [-11.92, 11.92]`:
     - Under town/road (`X ∈ [-11.92, 4.2]`): top at `Y = 0.35`.
     - Raised Konbini sidewalk plinth (`X ∈ [-7.6, 2.6], Z ∈ [-8.2, 0.4]`): top at `Y = 0.52`.
     - Alley walkway (`X ∈ [2.6, 4.8], Z ∈ [-8.2, 2.4]`): gently stepped/sloped `Y = 0.50 -> 0.30`.
2. **L-Corner Asphalt Road & Parking (`baseAndRoad.ts`)**:
   - Front road strip: `X ∈ [-11.9, 4.2], Z ∈ [0.4, 11.9], Y = 0.36`.
   - Left road strip: `X ∈ [-11.9, -7.6], Z ∈ [-11.9, 0.4], Y = 0.36`.
   - Parking bay markings (for Kei truck): `X ∈ [-10.8, -8.0], Z ∈ [-5.6, -1.2], Y = 0.365`.
   - Reflective zebra crosswalk: across front road at `X ∈ [-6.2, -1.0], Z ∈ [1.4, 4.4], Y = 0.366`.
   - Concrete drainage gutter + metal grates along curb `Z = 0.45` and `X = -7.55`.
   - Wet reflective puddles (`puddles`): 3 organic flat meshes at `(x: -3.2, z: 5.6, y: 0.368)`, `(x: -9.2, z: 2.2, y: 0.368)`, and alley AC drip puddle at `(x: 2.85, z: -3.6, y: 0.505)`.
   - Corner white guardrails along sidewalk edge, street sign & convex mirror at `(x: 2.3, z: 0.25)`, distant street traffic signal pole at `(x: -10.6, z: 9.8, y: 0.36)`.
3. **Konbini Building Shell (`storeStructure.ts`)**:
   - Building footprint: `X ∈ [-7.2, 2.2]` (width `9.4`), `Z ∈ [-7.8, -0.6]` (depth `7.2`), floor surface at `Y = 0.55`, interior ceiling at `Y = 3.75`, roof parapet top at `Y = 4.35`.
   - Front wall (`Z = -0.6`) and right alley/sea-view wall (`X = 2.2`, `Z ∈ [-5.6, -0.6]`): **floor-to-ceiling crystal-clear glass windows** (`opacity <= 0.18`, `depthWrite: false`, `userData.noOutline = true`) so the entire warm interior is unobstructed!
   - Double automatic sliding glass doors on front wall centered at `X = -2.5, Z = -0.58`, opening gap width `2.2` (`doorLeft` slides `-X`, `doorRight` slides `+X`, closed positions centered at `X = -3.05` and `X = -1.95`).
   - Entrance welcome mat on sidewalk at `X = -2.5, Z = 0.0, Y = 0.53`.
   - Original fascia lightbox signboard wraps front (`Z = -0.52`) & right/left corners at `Y ∈ [3.65, 4.22]` bearing stylized kana **`うみかぜマート`**; plus a free-standing pylon sign at `(x: -7.1, z: 0.15, height up to Y = 5.4)`.
   - Striped fabric awning (`awningValance`) jutting from `Z = -0.55` to `Z = 0.25` at `Y = 3.45`, and a hanging glass wind chime (`windChime`) at `(x: 1.85, y: 3.25, z: 0.05)`.
4. **Konbini Interior (`storeInterior.ts`)**:
   - Strictly inside `X ∈ [-6.95, 1.95], Z ∈ [-7.55, -0.80], Y ∈ [0.56, 3.72]`.
   - **Window-side Summer Limited Display (`interior-summer-display`)** at `X ∈ [-0.8, 1.7], Z ∈ [-2.1, -0.95]`: handheld & gift fireworks packs, mosquito coil boxes + ceramic pig coil holder, sunscreen bottle stand, beach bucket/shovel set, translucent colorful swim rings, summer bunting.
   - **Checkout Counter (`interior-checkout-counter`)** at left `X ∈ [-6.7, -4.4], Z ∈ [-4.2, -1.4]`: register screen, warm snack display case, self-serve **iced coffee machine** (`interior-coffee-machine`), and a mint retro **mini desk fan** (`interior-desk-fan`) on the counter corner with spinning `fanBlades` and oscillating `fanHead`.
   - **Window Cold-Drink Bar Counter (`interior-drink-bar`)** along front-left glass `X ∈ [-6.6, -4.0], Z ∈ [-0.95, -0.82]` with high stools & cup dispenser.
   - **Magazine Rack (`interior-magazine-rack`)** along right/front window `X ∈ [1.45, 1.88], Z ∈ [-3.8, -2.3]`.
   - **Center Gondola Shelves (`interior-shelves`)**: 2 neat rows at `X ∈ [-3.6, -0.8], Z ∈ [-5.2, -2.6]` stocked with tidy pastel snack bags, cup noodles, bottled teas, daily goods.
   - **Bento & Onigiri Open Chiller (`interior-bento-onigiri`)** at `X ∈ [-0.4, 1.85], Z ∈ [-5.8, -4.2]`: neatly arranged bento trays, white/nori triangular onigiri rows, sandwiches.
   - **Summer Ice Cream Chest Freezer (`interior-ice-cream-freezer`)** at `X ∈ [-3.6, -1.4], Z ∈ [-2.1, -1.35]` with sliding glass lid & colorful popsicle boxes.
   - **Back-Wall Beverage Fridges (`interior-drink-fridges`)** along `Z = -7.35, X ∈ [-4.8, 1.7]`: glowing interior shelves of colorful drinks, subtle misty glass doors, and `coldMistParticles` group descending gently near chiller/fridge vents.
   - **Storage Lockers (`interior-lockers`)** at `X ∈ [-6.8, -5.6], Z ∈ [-6.6, -5.0]`, **Backroom Staff Door (`interior-back-door`)** on back wall at `X = -5.2, Z = -7.52`, **Floor Guide Decals (`interior-floor-guides`)** on floor `Y = 0.565`, indoor hanging category lightboxes & summer posters, ceiling warm light tubes + warm `PointLight`s.
5. **Exterior Street & Alley Props (`exteriorProps.ts`)**:
   - **Light-Blue Kei Truck (`kei-truck`)** parked inside bay centered at `(x: -9.4, z: -3.4, y: 0.36)`, facing `+Z`, fully inside `X ∈ [-10.6, -8.2], Z ∈ [-5.3, -1.5]`.
   - **Beverage Vending Machines (`vending-machines`)**: 2 units side by side against left-front konbini wall at `X ∈ [-6.8, -4.8], Z = -0.25, Y = 0.53`.
   - **Bicycle with Wicker Basket (`bicycle-wicker-basket`)** parked at `(x: -0.4, z: 0.12, y: 0.53)`.
   - **Leaning Wet Surfboard (`leaning-surfboard`)** resting diagonally against front-right pilaster at `(x: 0.9, z: -0.32, y: 0.53)`, plus **Surfboard Rack (`surfboard-rack`)** & **Open Beach Umbrella (`open-beach-umbrella`)** at `(x: 2.0, z: 0.05, y: 0.53)`.
   - **Beach Flip-Flops (`flip-flops`)**: 1 pair casually angled beside welcome mat at `(x: -1.65, z: 0.12, y: 0.535)`.
   - **Sorting Trash Cans (`trash-cans`)**: 3-bin recycling unit at `(x: -4.2, z: -0.25, y: 0.53)`.
   - **AC Outdoor Unit (`ac-outdoor-unit`)**: mounted on right alley wall of konbini at `(x: 2.48, y: 1.55, z: -3.6)` with condensate hose, falling `acWaterDrop` mesh, and expanding `acRippleRing` on puddle at `(x: 2.85, y: 0.51, z: -3.6)`.
   - **Community Noticeboard (`noticeboard`)**: wooden roofed board in alley at `(x: 3.9, y: 0.48, z: -2.2)` plastered with summer festival & fireworks posters, including `flutteringPosterCorner` mesh.
   - **Utility Poles, Catenary Wires & Streetlamp (`utility-poles-wires`)**: Main pole at `(x: 3.4, z: 0.25, y: 0.48)` and secondary pole at `(x: -10.8, z: -7.8, y: 0.36)`, warm curved streetlamp, and 4 catenary wire curves (`overheadWires`) staying strictly inside `[-11.6, 11.6]`.
   - **Seaside Alley Tree (`alley-tree`)**: compact coastal green tree at `(x: 3.7, z: -6.2, y: 0.48)` with swayable foliage clusters (`treeFoliage`), crown radius `<= 1.3`.
6. **Seaside Beach, Translucent Resin Ocean & Distant Breakwater (`seasideZone.ts`)**:
   - **Wooden Beach Stairs (`wooden-stairs`)**: connecting alley (`X = 4.3, Y = 0.32, Z = -0.8`) down to sand beach (`X = 5.6, Y = 0.08, Z = -0.8`).
   - **Sand Shore (`sand-beach`)**: `X ∈ [4.2, 11.92], Z ∈ [-11.92, 11.92]`, gently sloping from dry warm cream sand (`Y = 0.22` near `X = 4.5`) down into submerged seabed (`Y = -0.85` at `X = 11.92`), with a wet reflective shoreline band along `X ≈ 7.2 .. 8.8`.
   - **Translucent Resin Ocean Cut-Edge Block (`resin-ocean`)**: fills sea region `X ∈ [7.4, 11.92], Z ∈ [-11.92, 11.92], Y ∈ [-0.88, -0.02]`. Includes:
     - Crystal-clear sea-salt blue/aquamarine vertical resin cut faces on the diorama's `+X`, `+Z`, and `-Z` outer edges (`userData.noOutline = true`);
     - Animated top water surface + painted white foam shoreline bands washing gently onto the sand.
   - **Low Seawall & Tetrapods (`seawall`, `tetrapods`)**: low concrete breakwater jetty at back-right `X ∈ [4.8, 11.4], Z ∈ [-10.8, -8.8], Y ∈ [-0.3, 0.65]`, flanked by clusters of 4-legged concrete tetrapods at `X ∈ [7.2, 11.2], Z ∈ [-8.6, -6.2]`.
   - **Mini Lighthouse (`mini-lighthouse`)**: red-and-white miniature lighthouse standing at jetty tip `(x: 10.4, z: -9.8, baseY = 0.65, total top Y ≈ 3.8)`, with rotating `lighthouseBeam` group (soft translucent warm-white cone kept short enough `length <= 3.2` or angled inward—Wait: if beam rotates 360°, at `x = 10.4` a radius > `1.5` would exceed `X = 12.0`! **CRITICAL**: either position lighthouse at `(x: 9.6, z: -9.6)` with `lighthouseBeam` cone length `1.8` OR mark `lighthouseBeam.userData.ignoreBounds = true` while still keeping cone length `<= 2.1` and lighthouse at `(x: 9.6, z: -9.6)` so even the light cone NEVER exceeds `[-12, 12]`! Put lighthouse at `(x: 9.5, z: -9.5)` and beam cone length `2.0` -> max X/Z = `11.5 < 12.0`! Zero overflow even including the light beam!).
   - **Beach Props**: red-white `lifebuoy` resting near seawall/stairs `(x: 5.8, z: -3.2)`, `folded-beach-umbrella` on sand `(x: 6.1, z: 3.4)`, scattered pastel `seashells` and translucent mint/aqua `sea-glass` pebbles along `X ∈ [5.5, 7.6], Z ∈ [-2.5, 7.5]`.

---

## 3. Exact TypeScript Module Interfaces

### 3.1 `src/config/paletteAndBounds.ts` (`infra-env`)
```ts
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

export function checkWorldWithinBase(root: THREE.Object3D): BoundsCheckReport;
```
*(Note: `checkWorldWithinBase` traverses `root`, calls `root.updateMatrixWorld(true)`, skips any object or ancestor where `userData?.ignoreBounds === true`, computes world `Box3` for each `THREE.Mesh`, and records a violation string with `mesh.name` + min/max X/Z if `min.x < -12.05 || max.x > 12.05 || min.z < -12.05 || max.z > 12.05`.)*

### 3.2 `src/rendering/toonMaterials.ts` (`render-core`)
```ts
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

export function getSharedToonGradientMap(): THREE.DataTexture;
export function createToonMaterial(options: ToonMaterialOptions): THREE.MeshToonMaterial;
export function createGlassMaterial(options?: {
  tint?: THREE.ColorRepresentation;
  opacity?: number;
}): THREE.MeshPhysicalMaterial;
export function createEmissiveLightboxMaterial(options: {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  intensity?: number;
}): THREE.MeshStandardMaterial;
export function addInvertedHullOutline(
  mesh: THREE.Mesh,
  thickness?: number,
  color?: THREE.ColorRepresentation,
): THREE.Mesh | null;
export function applyOutlinesToHierarchy(
  root: THREE.Object3D,
  defaultThickness?: number,
): number;
export function createWetPuddleMaterial(): THREE.ShaderMaterial;
export function createResinWaterSurfaceMaterial(): THREE.ShaderMaterial;
export function createResinCutEdgeMaterial(): THREE.MeshPhysicalMaterial;
```
- `addInvertedHullOutline` / `applyOutlinesToHierarchy` MUST skip any mesh (or ancestor) with `userData.noOutline === true` or `material.transparent === true`, and mark generated outline hulls with `userData.isOutline = true` and `userData.noOutline = true`.
- `createWetPuddleMaterial()` MUST expose uniforms: `uTime: { value: number }`, `uRippleCenter: { value: THREE.Vector2 }`, `uRippleProgress: { value: number }`, `uDoorLightBoost: { value: number }`.
- `createResinWaterSurfaceMaterial()` MUST expose uniforms: `uTime: { value: number }`, `uWavePhase: { value: number }`.

### 3.3 `src/rendering/canvasTextures.ts` (`render-core`)
```ts
import * as THREE from 'three';

export const BRAND_COPY = {
  mainKana: 'うみかぜマート',
  subKana: '24じかん・うみべのコンビニ',
  posters: ['夏祭り', '花火大会', 'つめたい氷', 'なつ限定'],
} as const;

export function createKonbiniSignTexture(): THREE.Texture;
export function createPylonSignTexture(): THREE.Texture;
export function createFestivalPosterTexture(variant: 'matsuri' | 'hanabi' | 'koori' | 'natsu'): THREE.Texture;
export function createVendingFrontTexture(variant: 'blue' | 'cream'): THREE.Texture;
export function createTrashLabelsTexture(): THREE.Texture;
export function createStripedFabricTexture(colorA: string, colorB: string, stripes?: number): THREE.Texture;
```
*(In headless jsdom tests where `HTMLCanvasElement.getContext('2d')` may return `null`, `canvasTextures.ts` MUST gracefully fall back to a valid `THREE.DataTexture` while tagging `texture.userData = { label, textContent }` so both browser WebGL and Vitest jsdom succeed cleanly!)*

### 3.4 `src/rendering/skyAndLighting.ts` & `src/rendering/postProcessing.ts` (`render-core`)
```ts
// skyAndLighting.ts
import * as THREE from 'three';

export interface SkyAndLightingRig {
  group: THREE.Group;
  skyDome: THREE.Mesh;
  skyMaterial: THREE.ShaderMaterial;
  sunsetDirLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  doorSpillLight: THREE.PointLight;
}

export function createSkyAndLighting(): SkyAndLightingRig;
// Note: skyDome MUST set `skyDome.userData.ignoreBounds = true` and `skyDome.userData.noOutline = true`.
// skyMaterial MUST expose `uniforms.uTime = { value: 0 }`.
```
```ts
// postProcessing.ts
import * as THREE from 'three';

export interface PostProcessingPipeline {
  render: (deltaSeconds: number) => void;
  setSize: (width: number, height: number, pixelRatio: number) => void;
  dispose: () => void;
}

export function createPostProcessingPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostProcessingPipeline;
```

### 3.5 World Builder Return Types (`world-*` workers)

1. **`src/world/baseAndRoad.ts` (`world-road-seaside`)**:
```ts
import * as THREE from 'three';

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
export function buildBaseAndRoad(): BaseAndRoadResult;
```
Required named descendants inside `group`: `'base-tray'`, `'asphalt-road'`, `'zebra-crosswalk'`, `'parking-bay'`, `'drainage-gutter'`, `'wet-puddles'`, `'street-guardrails'`, `'street-signs'`, `'traffic-signal'`.

2. **`src/world/seasideZone.ts` (`world-road-seaside`)**:
```ts
import * as THREE from 'three';

export interface SeasideZoneResult {
  group: THREE.Group; // name: 'seaside-zone'
  waterSurfaceMaterial: THREE.ShaderMaterial;
  wetSandMaterial: THREE.ShaderMaterial | THREE.MeshStandardMaterial;
  foamStripMesh: THREE.Mesh;
  lighthouseRotor: THREE.Object3D;
}
export function buildSeasideZone(): SeasideZoneResult;
```
Required named descendants inside `group`: `'wooden-stairs'`, `'sand-beach'`, `'wet-sand-band'`, `'resin-ocean'`, `'seawall'`, `'tetrapods'`, `'mini-lighthouse'`, `'lifebuoy'`, `'folded-beach-umbrella'`, `'seashells'`, `'sea-glass'`.

3. **`src/world/storeStructure.ts` (`world-konbini-ext`)**:
```ts
import * as THREE from 'three';

export interface StoreStructureResult {
  group: THREE.Group; // name: 'konbini-structure'
  slidingDoorLeft: THREE.Object3D;   // closed X = -3.05, slides -X up to 0.95
  slidingDoorRight: THREE.Object3D;  // closed X = -1.95, slides +X up to 0.95
  awningValance: THREE.Object3D;
  windChimePendulum: THREE.Object3D;
  signLightboxMaterials: THREE.MeshStandardMaterial[];
}
export function buildStoreStructure(): StoreStructureResult;
```
Required named descendants inside `group`: `'konbini-building'`, `'konbini-signboard'`, `'pylon-sign'`, `'striped-awning'`, `'wind-chime'`, `'sliding-door-left'`, `'sliding-door-right'`, `'welcome-mat'`, `'storefront-windows'`.

4. **`src/world/exteriorProps.ts` (`world-konbini-ext`)**:
```ts
import * as THREE from 'three';

export interface ExteriorPropsResult {
  group: THREE.Group; // name: 'exterior-props'
  acFanWheel: THREE.Object3D;
  acWaterDrop: THREE.Object3D;       // starts at Y = 1.32, drops to puddle Y = 0.51 at (x: 2.85, z: -3.6)
  acRippleRing: THREE.Mesh;          // ring mesh on puddle at (x: 2.85, y: 0.512, z: -3.6)
  flutteringPosterCorner: THREE.Object3D;
  treeFoliageClusters: THREE.Object3D[];
  overheadWires: THREE.Object3D[];
  vendingGlowMaterials: THREE.MeshStandardMaterial[];
  streetlampLight: THREE.PointLight;
}
export function buildExteriorProps(): ExteriorPropsResult;
```
Required named descendants inside `group`: `'kei-truck'`, `'vending-machines'`, `'bicycle-wicker-basket'`, `'leaning-surfboard'`, `'surfboard-rack'`, `'open-beach-umbrella'`, `'flip-flops'`, `'trash-cans'`, `'ac-outdoor-unit'`, `'noticeboard'`, `'utility-poles-wires'`, `'alley-tree'`, `'streetlamp'`.

5. **`src/world/storeInterior.ts` (`world-konbini-int`)**:
```ts
import * as THREE from 'three';

export interface StoreInteriorResult {
  group: THREE.Group; // name: 'konbini-interior'
  deskFanHead: THREE.Object3D;
  deskFanBlades: THREE.Object3D;
  coldMistParticles: THREE.Object3D[]; // each has userData.baseY & userData.phase
  interiorLightboxMaterials: THREE.MeshStandardMaterial[];
  interiorWarmLights: THREE.PointLight[];
}
export function buildStoreInterior(): StoreInteriorResult;
```
Required named descendants inside `group`: `'interior-summer-display'`, `'interior-shelves'`, `'interior-bento-onigiri'`, `'interior-drink-fridges'`, `'interior-cold-mist'`, `'interior-ice-cream-freezer'`, `'interior-checkout-counter'`, `'interior-coffee-machine'`, `'interior-desk-fan'`, `'interior-drink-bar'`, `'interior-magazine-rack'`, `'interior-lockers'`, `'interior-floor-guides'`, `'interior-posters-lightboxes'`, `'interior-back-door'`.

### 3.6 `src/animation/animationSystem.ts` & `src/world/buildDioramaWorld.ts` (`anim-integrator`)
```ts
import * as THREE from 'three';

export interface AnimationTargets {
  skyMaterial?: THREE.ShaderMaterial;
  waterSurfaceMaterial?: THREE.ShaderMaterial;
  foamStripMesh?: THREE.Object3D;
  puddleMaterials?: THREE.ShaderMaterial[];
  wetSandMaterial?: THREE.Material;
  crosswalkMaterial?: THREE.Material;
  slidingDoorLeft?: THREE.Object3D;
  slidingDoorRight?: THREE.Object3D;
  doorSpillLight?: THREE.PointLight;
  awningValance?: THREE.Object3D;
  windChimePendulum?: THREE.Object3D;
  flutteringPosterCorner?: THREE.Object3D;
  treeFoliageClusters?: THREE.Object3D[];
  overheadWires?: THREE.Object3D[];
  acFanWheel?: THREE.Object3D;
  acWaterDrop?: THREE.Object3D;
  acRippleRing?: THREE.Mesh;
  signLightboxMaterials?: THREE.MeshStandardMaterial[];
  vendingGlowMaterials?: THREE.MeshStandardMaterial[];
  coldMistParticles?: THREE.Object3D[];
  deskFanHead?: THREE.Object3D;
  deskFanBlades?: THREE.Object3D;
  trafficLightBulbs?: {
    red: THREE.MeshStandardMaterial;
    yellow: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  };
  lighthouseRotor?: THREE.Object3D;
}

export function computeAutoDoorFactor(elapsedSeconds: number): number; // [0, 1], opens smoothly every ~16s
export function computeAcDropState(elapsedSeconds: number): { dropProgress: number; rippleProgress: number; rippleOpacity: number };
export function computeWaveFoamOffset(elapsedSeconds: number): { surge: number; foamOpacity: number };
export function computeTrafficSignalState(elapsedSeconds: number): 'green' | 'yellow' | 'red';
export function updateDioramaAnimations(targets: AnimationTargets, elapsedSeconds: number, deltaSeconds: number): void;
```
