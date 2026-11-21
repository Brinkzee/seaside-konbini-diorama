# Seaside Konbini Diorama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a collector-grade anime cel-shaded 3D miniature diorama of a midsummer dusk seaside convenience store corner on a square resin base (`24 × 24`) with rich visible interior details, subtle loop animations, third-person orbit controls, and zero UI elements.

**Architecture:** Modular Vite + TypeScript + Three.js architecture split into `config` (palette & square base bounds), `rendering` (4-step warm/cool toon materials, layered outline & selective bloom, procedural Japanese kana signage/posters, dusk sky & lighting), `world` (square base & wet reflective road, konbini shell, full interior, exterior props, seaside beach & translucent resin ocean block), `animation` (11 pure loop controllers), and `app` (zero-UI dynamic-viewport WebGL stage + OrbitControls).

**Tech Stack:** TypeScript 5.7, Three.js 0.170, Vite 6, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-21-seaside-konbini-diorama-design.md`

## Global Constraints
- Zero UI elements (`<button>`, `<input>`, `<nav>`, overlays, watermarks, FPS meters) in `index.html` or runtime DOM.
- All physical diorama objects must stay strictly inside the square base horizontal footprint `[-12, 12]` on X and Z.
- Original stylized Japanese kana brand (`うみかぜマート`) and festival posters (`夏祭り`, `花火大会`), zero real-world trademarks, zero garbled text.
- Zero human figures or human shadows; preserve lived-in traces (flip-flops by mat, wet surfboard, bicycle with wicker basket, parked light-blue Kei truck).
- Strict TDD (`RED -> GREEN -> REFACTOR`) for every module.

---

### Task 1: Zero-UI Stage HTML & Palette/Base Bounds Module
- **Files:**
  - Test: `tests/zeroUiDom.test.ts`, `tests/paletteAndBounds.test.ts`
  - Create: `index.html`, `src/config/paletteAndBounds.ts`
- [ ] Write failing tests verifying `index.html` contains a `#stage` / `#diorama-canvas` with `100dvw`/`100dvh` & `content-visibility: auto`, zero interactive UI elements or text overlays, and verifying `DIORAMA_BOUNDS` (`[-12, 12]`), palette hex values, and `checkSceneBounds()`.
- [ ] Run `npm test` to confirm RED failure.
- [ ] Implement `index.html` and `src/config/paletteAndBounds.ts`.
- [ ] Run `npm test` to confirm GREEN pass.

### Task 2: Cel-Shaded Materials, Procedural Kana Textures & Dusk Sky/Lighting
- **Files:**
  - Test: `tests/toonMaterials.test.ts`, `tests/canvasTextures.test.ts`
  - Create: `src/rendering/toonMaterials.ts`, `src/rendering/canvasTextures.ts`, `src/rendering/skyAndLighting.ts`, `src/rendering/postProcessing.ts`
- [ ] Write failing tests verifying 4-step toon gradient texture, outline exclusion for glass/water/mist, original kana brand & poster descriptors without real brand names, and dusk sky shader uniforms + warm/cool lights.
- [ ] Run `npm test` to confirm RED failure.
- [ ] Implement rendering modules.
- [ ] Run `npm test` to confirm GREEN pass.

### Task 3: Complete Square Diorama World (Base, Road, Konbini Exterior & Interior, Seaside Resin Ocean)
- **Files:**
  - Test: `tests/worldBoundsAndContent.test.ts`
  - Create: `src/world/baseAndRoad.ts`, `src/world/storeStructure.ts`, `src/world/storeInterior.ts`, `src/world/exteriorProps.ts`, `src/world/seasideZone.ts`, `src/world/buildDioramaWorld.ts`
- [ ] Write failing tests verifying all required exterior, interior, road, and seaside named groups exist, zero human/character nodes exist, and `checkSceneBounds()` passes across the entire assembled world within `[-12, 12]`.
- [ ] Run `npm test` to confirm RED failure.
- [ ] Implement all world modules with rich miniature detail and cartoon outlines.
- [ ] Run `npm test` to confirm GREEN pass.

### Task 4: 11 Subtle Loop Animations & Orbit Camera Application
- **Files:**
  - Test: `tests/animationSystem.test.ts`
  - Create: `src/animation/animationSystem.ts`, `src/app/DioramaApp.ts`, `src/main.ts`
- [ ] Write failing tests verifying wave wash/foam cycle, breeze sway bounds, AC condensation drop & puddle ripple sync, occasional auto-door open/close & warm light spill, lightbox subtle flicker, cold mist descent, desk fan spin/oscillation, wet reflection shimmer, traffic light cycle, and lighthouse sweep.
- [ ] Run `npm test` to confirm RED failure.
- [ ] Implement `animationSystem.ts`, `DioramaApp.ts`, and `src/main.ts`.
- [ ] Run `npm test` and `npm run build` to confirm GREEN pass.
