# Roadmap

**Status: Phases 1–4 landed 2026-08-01.** Companion to `architecture-spec.md`.
Storyboard is deliberately deferred.

## Path-tracer constraints (binding, learned the hard way)

three-gpu-pathtracer (0.0.24, three 0.180) imposes three requirements on
scene content that the raster pipeline never checks:

1. **Every traced geometry needs a real `uv` attribute.** The scene
   generator backfills missing uvs with zeros and then computes tangents
   from them → NaN tangents → the mesh renders black. All custom grid
   geometries (GraphTube, TorusShell, RibbonStrip) write their natural
   (θ, cross-section) uvs at build time.
2. **Triangle winding must agree with the vertex normals.** The raster
   pipeline shades by vertex normal and doesn't care; the tracer shades by
   face orientation and renders mismatched meshes black. Pinned by the
   comment in GraphTube's `buildTubeTopology`.
3. **`clearcoat > 0` renders black** (lib/three version mismatch). Figure
   mode strips clearcoat via cloned materials on entry and restores on
   exit; keep clearcoat out of any material that must trace as-is.

## Phase 1 — Domain views for the sphere theorems

The borsuk and poincare demos show only torus + slice; the domain S² is
invisible. Add, following the assemble-not-framework view pattern
(`createTorusView` / `createDiskView`):

- `views/SphereView.ts` — perspective viewport with gated orbit controls:
  - `SphereSurface` — translucent sphere with graticule, candy language;
  - `LatitudeRing` — thin tube at polar angle φ (the current slice), `setPhi()`;
  - `Marker` pool with `setDots(specs)`, specs carry unit `Vec3` positions;
  - optional `FrameGizmo` — moving-frame arrows (e₁, e₂, v) at γ(θ), the
    pedagogical bridge from tangent vector to fiber-disk coordinate;
  - optional `TangentArrows` — instanced arrow field sampling `evalTangent`
    on a (φ, θ) grid (Poincaré).
- **borsuk**: sphere (latitude, slice point x(θ) + antipode −x(θ), gold
  antipodal-pair markers) top-left; image disk panel with f(γ_φ), f̄(γ_φ)
  drawn via `DiskCurve2D` bottom-left; torus right.
- **poincare**: sphere with tangent arrows, latitude loop, field zeros from
  `findSphereFieldZeros`, frame gizmo at the slice point.

## Phase 2 — Path-traced figure pipeline

- `app/FigureRenderer.ts` — hand a demo's torus scene + camera to
  `WebGLPathTracer` (recipe in `legacy/scenes/torusPT`), accumulate with a
  progress readout, save hi-res PNG. Entered per-demo via a "figure" button;
  esc returns to the raster loop.
- `theme.paper` material variant — glass shell (`transmission: 1`), tubes
  tuned for HDR staging; ground plane + soft light rig.
- URL state — extend the existing `?r=/?phi=/?theta=` to camera pose and
  figure settings so every paper figure is a reproducible URL.

## Phase 3 — RibbonStrip (Borsuk)

2×N swept strip between Γ_f and Γ_f̄ with cross-stripes, refillable in place
like GraphTube. Makes `relativeWinding` visible: flat annulus near the pole,
forced odd twist at the equator.

## Phase 4 — The linking punchline, staged

Play button sweeping the proof parameter with ghost trails of previous curve
positions (per-frame `refillGraphCurve` + `refit`, the designed hot path).
Brouwer: Γ_i shrinks to the core as r→0. Lk readout already exists.

## Phase 5 — Experiment modes (landed 2026-08-01)

Both sphere demos now edit DATA, not formulas, like brouwer:

- `math/sphereGrid.ts`: lat-long `SphereGrid` (CCW-from-outside, O(1)
  location, central-projection barycentric), `plSphereMap` (sculptable
  f: S² → D²), `plTangentField` (comb-able field), `smoothTangentVectors`.
- **poincare**: comb mode — `SphereBrush` (per-viewport NDC raycast, tangent-
  transported Gaussian strokes, settle smoothing, undo), census on a dirty
  flag; Σ index = 2 survives any combing.
- **borsuk**: the flattened balloon (`SpherePushforward`, non-indexed
  equirect UVs, hemisphere-split texture) sculpted via the generalized
  `attachSheetSculptor` (structural `topology`/`rest`/`gripVertices`);
  `findAntipodalPair` gained `residualTol` + a derivative-free
  `refineZeroPattern` fallback for PL creases (Float32 floor ≈ 1e-7).

## Phase 6 — Three entries per scene + the UI kit (landed 2026-08-01)

Each scene is now three products sharing one `demos/<name>/scene.ts`
assembly (mode: "story" | "render"; chrome never lives in scene.ts —
status flows through hooks):

- `index.html` — WEBSITE: minimal chrome (kit widgets floating on the
  scene; sculpting/combing are pointer-only).
- `lab.html` — LAB: the kitchen sink, all controls in a kit `stack`.
  lil-gui is REMOVED from the project.
- `render.html` — RENDER (not disk): figure presets + the Render… modal
  (scale/bounces/spp with live pixel dims) over FigureRenderer;
  `?figpreset=<id>` deep-links a paper figure.

`src/ui/controls.ts` is the kit: thin-slider idiom (naked 5px pill tracks,
pill buttons, no panels) in the warm palette. `src/app/RenderControls.ts`
is the render chrome. FigureRenderer: per-attach query parsing,
`?fig=<name>` (multiple figures per page), runtime `configure()`,
`groundY`, and glass-by-flag (`userData.figureGlass` on TorusShell +
SphereSurface). New proof move: brouwer's PUSH-TO-CORE homotopy
H_t = (1−t)·f₁ (the paper's Figure 2) with ghost trails — `pushToggle()` /
`bakePushToCore()` in the brouwer scene.

## Deferred

- **Storyboard** (spec §7) — now with the full experimental cast.
- Over-the-pole homotopy for poincaré (the paper's γ → γ̄ second leg).
- Animation export (frame sequences for talks).
- Borsuk rest-metric staleness: preset re-bakes keep the ORIGINAL preset's
  spring rest lengths until reset (v1 limitation, documented in the demo).
