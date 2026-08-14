# Roadmap

**Status: Phases 1–7 landed; Phase 7 (the figure pipeline) 2026-08-12.**
Companion to `architecture-spec.md`, which carries a note on where the build
diverged from it, and `paper-notes.md`, which covers the paper itself.
Storyboard is deliberately deferred.

NOTE on Phase 6 below: it describes the three entries as `index.html` /
`lab.html` / `render.html`. Those were replaced by one folder per demo —
`demos/<name>/`, `demos/<name>-lab/`, `demos/<name>-render/`, each with a
`main.ts` — and root `index.html` is generated from `index.template.html`.

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
4. **Constraint #2 bites TWISTED swept strips, and `computeVertexNormals` does
   not save them — `flatShading` does.** Where a RibbonStrip twists, adjacent
   quads face opposite ways, so averaged vertex normals disagree with face
   orientation over most of the band and the tracer renders it BLACK. Shading
   from geometric normals (`flatShading: true`, applied in figure mode via
   `userData.figureSolid`) forces agreement, and the facets read as the paper's
   cross-hatching. This is what actually blackened the Borsuk equator ribbon.
   The Brouwer push surface was black for a SECOND, unrelated reason: it is
   radial, so near-vertical inside the torus, and the overhead area light only
   grazes it — no bug, just no light. `figureSolid` therefore also applies a
   small emissive floor (0.18), so a diagram surface stays legible whichever way
   it faces. Both fixes verified by re-rendering the two figures.
5. **Plain alpha translucency traces fine.** The tracer resolves
   `transparent + opacity` stochastically: translucent tubes (GhostTrail) and
   fibre plates (MeridianDisk `"figure"`) keep their raster materials and come
   out right — stripping clearcoat is the only edit they need. The old
   `userData.figureOpaque` path converted flagged surfaces to frosted glass
   (`transmission: 0.85`, `ior: 1.05`) on the theory that alpha was ignored; it
   was treating the normals bug above, and thin transmissive sheets trace dark
   too. Removed 2026-08-11. Swept surfaces do still want to be OPAQUE in a
   figure, but for a plain aesthetic reason: alpha inside the glass shell,
   against a bright environment, washes out to nothing.

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
  - The WEBSITE entry combs by POINTER, no mode button: the brush owns the
    primary button / first finger, OrbitControls keeps the secondary button
    and two-finger gestures. The scene's own gate (`setOrbitGate(() =>
    !combState.on)`) is the LAB's modal semantics and kills orbit outright
    once comb mode is on — an entry that splits by button must replace it
    (`() => !comb.active`), or the sphere silently stops turning.
  - `findSphereFieldZeros` must pass `minDepth ≥ 4`. Combing routinely
    splits a zero into a ±1 pair a few degrees apart; at the census default
    (`minDepth: 2`, chart cells ≈ 0.9 wide) the pair cancels inside one cell
    and is pruned unseen, and the demo displays Σ index = 1 — i.e. its own
    invariant as violated. Pinned by a regression test in sphereGrid.test.ts.
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

## Phase 7 — the figure pipeline (landed 2026-08-12)

The paper's figures are now produced unattended, and the set is complete at
draft quality. See `docs/paper-notes.md` for what each figure is FOR and the
still-open question of which ones the paper actually takes.

- `scripts/figures.manifest.mjs` is the source of truth: one entry per image
  (`file`, `page`, `preset`, `section`, `caption`, optional `size`), each naming
  an existing `?figpreset=` on a render page, so preset ids stay untouched.
- `npm run figures` boots vite, drives headless Chrome over every deep link,
  waits for the tracer to hit its sample target, saves the PNG, and writes a
  contact sheet (`scripts/contact-sheet.mjs`, also runnable alone as
  `npm run figures:sheet`, with `--embed` for a self-contained copy).
  `--draft` = 16 spp at 1× (~3½ min for 22 figures); final = 768 spp at 2×.
  Headless Chrome gets the real GPU here (ANGLE Metal), so headless is fine —
  and one reused page, because a context per figure spams windows.
- Aspect is PER FIGURE (`size` in the manifest): composition decides it, and a
  row of actors simply cannot fill a 16:10 frame.
- Poses are pinned in `src/app/figurePose.ts` and every preset calls
  `applyPose`. Not just for consistency: labels go on in LaTeX over the image,
  so an overlay's coordinates only survive a re-render if the pose is fixed.
- New figure actors: `SpanningDisk` (+ `diskPiercings`, whose claim is pinned in
  `test/linking.test.ts`), `LoopTrail`, `GraphPlate`, `SlicePlate.setAxes`, and
  `bakeSweep` / `setSpanningDisk` / `setFramePlate` / `setSegmentRow` /
  `bakeLoopFamily` / `setAnatomy` / `setIVT` on the scenes.
- **Figure devices on a page that runs the STORY assembly must be opt-in.**
  `borsuk-render` builds `mode: "story"` (it wants the sculptable balloon), so
  anything gated on `mode === "render"` is never constructed there — the ℓ_θ
  plate row takes an explicit `segmentRow: true` instead.

## Deferred

- **Storyboard** (spec §7) — now with the full experimental cast.
- ~~Over-the-pole homotopy for poincaré~~ (landed 2026-08-01:
  `overPoleFamily` in math/frames.ts, `setHomotopy`/`homotopyToggle`/
  `bakeHomotopy` on the poincaré scene, `LatitudeRing.setCircle`, the
  "γ → γ̄ over the pole" render preset, endpoints pinned by tests).
- Animation export (frame sequences for talks).
- Borsuk rest-metric staleness: preset re-bakes keep the ORIGINAL preset's
  spring rest lengths until reset (v1 limitation, documented in the demo).
