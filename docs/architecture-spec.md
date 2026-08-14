# Architecture Spec — Solid-Torus Linking Visualizations

**Status: DRAFT for discussion (2026-07-06).**
Companion to `linking_proofs_visualization_spec.md` (the *what*); this document is the *how*.

---

## Where the build diverged from this document (2026-08-11)

Read the sections below as the original design discussion, not as a description
of the code. Four decisions went the other way; `docs/roadmap.md` is the record
of what actually shipped.

- **§3 `ProofModel` was dropped, deliberately.** No demo instantiates a proof
  object. Scenes ASSEMBLE views and components directly and own their own
  refresh, because every attempt to hide the three proofs behind one interface
  cost more than it saved. What survives of `math/proofs/` is loop builders
  (`identityLoop`, `latitudeGraphLoop`, …), the detectors, and the one-line
  `labeled` helper in `proofs/types.ts`. Don't re-add the interface.
- **§7 Storyboard is still deferred**, now with the whole experimental cast to
  stage if it ever lands.
- **§10.2 UI: lil-gui is gone**, replaced by `src/ui/controls.ts` (the
  thin-slider kit). Nothing in the project depends on it.
- **§2 layout: one folder per demo.** `demos/<name>/main.ts` is the entry and
  the folder name IS the build name; a story demo's `scene.ts` is the shared
  assembly imported by its `<name>-lab` and `<name>-render` siblings. The
  three-entry-HTML-files-per-demo arrangement is gone, and root `index.html` is
  generated from `index.template.html` by `scripts/run-demo.mjs`.
- **§8 testing extended past `src/math/`.** The control layer (pointer
  arbitration, orbit gating) is unit-tested in node against a fake canvas
  (`test/interaction.test.ts`), and `npm run test:ui` drives the built demos in
  Chrome (`test/ui/`). Views and components are still verified visually; the
  demos carry no test hooks, so the browser suite asserts only on rendered
  canvas pixels and the kit's DOM readouts.

Decisions already made:

- **TypeScript, strict.** Interfaces in the math spec are already TS-shaped.
- **Fresh code, established patterns.** No dependency on `threejs-demos` or `math-lab`;
  we re-implement a small, purpose-built version of their best ideas
  (Params with rebuild/update triggers, component lifecycle, math/render boundary).
- **One renderer, scissor viewports.** Torus view, domain view, and slice inspector
  are scenes rendered into rectangles of a single WebGL canvas.
- **Phase 1 first**: static core with one hard-coded example per theorem.

---

## 1. The unifying abstraction

All three proofs are instances of one pipeline:

```
source object ──slice at s──▶ disk-valued loops ──sample──▶ GraphCurves ──▶ views + analysis
 (f, or v)      (proof param)    θ ↦ p(θ) ∈ D²               (θ,u,v)
```

| | source | proof param `s` | loops at `s` | forced event |
|---|---|---|---|---|
| Brouwer | `f: D²→D²` | radius `r ∈ (0,1]` | `Γ_f(r)`, `Γ_i(r)` | same-θ collision → fixed point |
| Borsuk–Ulam | `f: S²→D²` | latitude `φ ∈ (0,π/2]` | `Γ_f(φ)`, `Γ_f̄(φ)` (+ ribbon) | same-θ collision → antipodal pair |
| Poincaré | tangent `v` on `S²` | homotopy time `t ∈ [0,1]` | `Γ_γ(t)` (moving frame) | core crossing → zero of `v` |

Everything below exists to serve this table. The proofs are thin configurations
over a shared engine; new proof scenes should require no new rendering code.

---

## 2. Layering and module layout

Hard boundary (math-lab rule): **`src/math/` imports nothing from three.js.**
Curves live as `(θ, u, v)` samples; conversion to `ℝ³` happens only in the
embedding function, called by components at build time.

```
src/
  math/
    types.ts            Vec2/Vec3 aliases, DiskLoop, GraphCurve, roles
    torus.ts            SolidTorus: R, a, embed(θ,u,v,out), core/meridian helpers
    graphCurve.ts       sampleGraphCurve, resample, allocation-free refill
    analysis/
      unwrap.ts         angle unwrapping
      winding.ts        winding number of a nonzero disk loop   (§7.3 of math spec)
      collisions.ts     same-θ pair distance, core distance, local 1D refinement
      linking.ts        (later) Gauss linking estimate, display only
    maps/
      diskMaps.ts       DiskMap interface + presets (identity, contraction, twist, swirl)
      sphereMaps.ts     SphereDiskMap + presets (projection, distorted, harmonics)
      tangentFields.ts  TangentVectorField + presets (projected-constant, rotational)
      project.ts        hard/soft clamp into D², tangentProject
    frames.ts           moving frame (e₁,e₂) along a sphere loop; loop families
    proofs/
      types.ts          ProofModel interface
      brouwer.ts        slices, curves, detector wiring
      borsukUlam.ts     + ribbon endpoints, twist meter
      poincare.ts       + loop homotopy storyboard path, winding meter
  core/
    Params.ts           reactive params: define(name, value, {triggers}), dependOn, cascade
    lifecycle.ts        Rebuildable / Updatable / Disposable / Animatable interfaces
  components/           three.js adapters (extend Mesh/Group/Line), one file each:
    TorusShell.ts       semi-transparent boundary torus
    GraphTube.ts        tube along a GraphCurve, fixed topology, in-place position refill
    CoreCurve.ts        the core as a thin tube
    MeridianDisk.ts     one or several sampled fiber disks
    RibbonStrip.ts      swept segment surface with cross-stripes (Borsuk)
    Marker.ts           intersection / event highlight
    DomainDisk.ts       source disk: deformed grid, arrows, fixed-point dots
    DomainSphere.ts     sphere, latitudes, loops, tangent arrows, frame gizmo
    SliceDisk.ts        2D fiber-disk contents for the inspector (ortho scene)
  app/
    App.ts              renderer, canvas, clock, resize, animation loop
    ViewManager.ts      Viewport = {scene, camera, rect, background}; scissor render
    Export.ts           hi-res PNG (offscreen render at k×), preset cameras
  story/
    Storyboard.ts       Step list + scrubber; maps global progress → step + local t
  ui/                   minimal DOM controls (sliders, step buttons, meters)
demos/
  brouwer/main.ts       one flat entry file per scene (threejs-demos style)
  borsuk/main.ts
  poincare/main.ts
docs/
  architecture-spec.md  this file
  decisions/            dated, binding (math-lab discipline) — add as we commit
```

---

## 3. Core math types

```ts
// One slice of a proof: a disk-valued loop. Always written allocation-free.
type DiskLoop = (theta: number, out: Vec2) => void;

type CurveRole = 'identity' | 'map' | 'antipodal-map' | 'core' | 'vector-field';

// Struct-of-arrays, per the math spec §1.2. N is fixed at construction;
// refills mutate in place so GraphTube can update GPU buffers without realloc.
interface GraphCurve {
  readonly N: number;
  readonly theta: Float32Array;   // N samples of θ, uniform, closed
  readonly disk: Float32Array;    // 2N: u,v interleaved
  role: CurveRole;
  label?: string;
}

function sampleGraphCurve(loop: DiskLoop, N: number): GraphCurve;
function refillGraphCurve(curve: GraphCurve, loop: DiskLoop): void; // hot path
```

`SolidTorus` owns the embedding and nothing else:

```ts
class SolidTorus {
  readonly params: Params;        // R, a — both trigger 'rebuild' downstream
  embed(theta: number, u: number, v: number, out: Vec3): void;
}
```

**Coordinate convention (decide now, encode once):** three.js is y-up. The math
spec's embedding `E(θ,u,v) = ((R+au)cosθ, (R+au)sinθ, av)` is z-up. We keep the
formula in intrinsic form and map to y-up inside `embed` (torus lying in the
horizontal plane, as in the existing prototypes). All orientation conventions —
including the Poincaré sign convention (north-pole loop ⇒ (1,1)-curve,
reversed loop ⇒ (1,−1)) — live in `torus.ts`/`frames.ts` and are pinned by unit
tests, per the math spec's request.

`ProofModel` is what a demo instantiates:

```ts
interface ProofModel {
  readonly paramName: string;              // 'r', 'φ', 't'
  readonly paramRange: [number, number];
  curvesAt(s: number): { loop: DiskLoop; role: CurveRole; label: string }[];
  events(s: number, curves: GraphCurve[]): ProofEvent[];   // collisions, crossings
  meters?(curves: GraphCurve[]): MeterReading[];           // twist, winding
}
```

---

## 4. Reactivity: a minimal Params

A trimmed re-implementation (~150 lines) of the threejs-demos idea:

```ts
this.params
  .define('R', 2.0,  { triggers: 'rebuild' })   // structural → rebuild()
  .define('color', 0x4488ff, { triggers: 'update' })  // visual → update()
  .dependOn(torus);                             // cascade through the DAG
```

- `define` installs getter/setter; a change cascades `rebuild`/`update`
  through dependents in topological order.
- Kept deliberately small: no serialization, no UI binding, no signals.
  UI widgets just assign to params; components react.

The **per-frame animation path bypasses Params entirely**: driving the proof
parameter `s` each frame calls `refillGraphCurve` + `GraphTube.refit()`
directly. Params is for structural/visual configuration, not the 60 fps loop.

---

## 5. Components and the hot path

Components follow the threejs-demos three-layer pattern: pure math object in,
`rebuild()` (allocate geometry) / `update()` (materials, colors) /
`dispose()` out. `MeshPhysicalMaterial` throughout (the established aesthetic).

**GraphTube is the performance-critical component.** The prototypes rebuilt
`TubeGeometry` per slider tick (allocate + GC). Instead:

- Fixed topology: `N × M` tube grid (default N=512 rings, M=12 sides),
  index buffer built once.
- `refit(curve: GraphCurve)`: recompute ring positions + normals into the
  existing `BufferAttribute` arrays, set `needsUpdate`. Zero allocation.
- Frames along the curve via parallel transport (computed in the component,
  since this is render-side smoothing, not math).

`RibbonStrip` works the same way: 2×N strip, positions refilled from the two
boundary loops; stripes via a small shader or vertex colors.

---

## 6. Views: one renderer, scissor viewports

```ts
interface Viewport {
  scene: THREE.Scene;
  camera: THREE.Camera;           // perspective (3D views), ortho (slice inspector)
  rect: {x,y,w,h};                // fractions of canvas
  background?: Color | Texture;
}
```

`ViewManager.render()` loops viewports with `setScissor`/`setViewport`.
Layout presets: torus-only, torus+domain, torus+domain+slice (the storyboard
default). `OrbitControls` bound to whichever viewport the pointer is over.

- **Slice inspector** is an orthographic scene (`SliceDisk`): unit disk,
  boundary circle, the per-θ points/segments, core dot. Geometry in GL;
  **text labels are positioned DOM elements** over the viewport (crisp,
  cheap, easy to style) — not sprites.
- **Meters** (twist, winding, min-error) are small DOM widgets, not GL.

**Export**: render the composed layout (or a single viewport) into an
offscreen target at k× resolution → PNG. Transparent background = render with
alpha and no background set. Path-traced stills (Phase 5, torus view only)
reuse the prototypes' `three-gpu-pathtracer` setup behind an optional toggle.
SVG export is **out of scope** (tube meshes don't vectorize meaningfully).

---

## 7. Storyboard

The genuinely new subsystem. Kept simple and data-driven:

```ts
interface Step {
  id: string;
  title: string;                        // shown as caption
  enter(ctx: SceneContext): void;       // set visibility, camera pose, layout
  update?(t: number, ctx: SceneContext): void;  // local progress 0→1
  duration?: number;                    // relative weight for the scrubber
}
```

- A `Storyboard` is an ordered `Step[]` + a global progress scrubber that maps
  to (step, local t). Next/prev buttons snap between steps; the slider scrubs
  continuously through `update`.
- Steps drive the proof parameter, camera moves, and component visibility —
  they do not own objects. All objects are created once by the demo; steps
  toggle and animate them. This keeps scrubbing in both directions cheap and
  correct.
- Camera poses per step: stored `{position, target}` with eased interpolation
  between steps.

The three storyboards in the math spec (§8) become three `Step[]` arrays.

---

## 8. Testing

- **Vitest** (integrates with the Vite toolchain) for `src/math/` only —
  components and views are verified visually.
- Required by the math spec: the Poincaré orientation convention test
  (north-pole loop ⇒ winding +1, reversed ⇒ −1).
- Additional cheap invariants: unwrap continuity, twist of the projection map
  is odd, identity map has every point fixed at r where f = i, radial
  contraction has fixed point only at 0, `project` never leaves D².

---

## 9. Phase 1 deliverable (first implementation target)

Everything static, one hard-coded example per theorem:

1. `math/`: torus, graphCurve, unwrap/winding, collisions, one preset per
   map/field type, frames.ts, three ProofModels. Vitest coverage.
2. `components/`: TorusShell, GraphTube, CoreCurve, MeridianDisk, SliceDisk,
   Marker.
3. `app/`: App, ViewManager (torus + slice inspector layout), PNG export.
4. `demos/`: three entry files, each rendering its proof at a fixed
   representative `s`, slice inspector wired to a θ slider.

Explicitly deferred: interactive map editing (drag handles, painted fields),
storyboards, ribbon, meters, path tracing — Phases 2–5.

---

## 10. Open questions (to settle together)

1. **Demo runner**: threejs-demos uses a script that rewrites `index.html`
   per demo (`npm run dev brouwer`). Copy that pattern, or a simple landing
   page linking three entry HTML files?
2. **UI widgets**: hand-rolled DOM controls (your framework style) vs.
   lil-gui for development speed in Phases 1–2, replaced later. The
   storyboard UI must be custom either way.
3. **Sample count** default N=512 per curve — fine, or want 1024 for export?
4. **Palette / visual language**: prototypes use glass torus (`0x95d5de`,
   transmission ≈ 1), burgundy `0xb5504c` identity, blue `0x475fd6` map.
   Keep as the starting palette? Roles → colors should be a single named
   table in one file.
