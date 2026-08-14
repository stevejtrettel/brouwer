/**
 * Poincaré scene — the shared assembly behind the website, lab, and render
 * entries. The tangent field is DATA (a comb-able PL field opened on the
 * projected-constant preset): the latitude restriction becomes a disk loop
 * via the moving frame, the graph crosses the core exactly at the zeros,
 * and the zero census (Σ index = 2 = χ(S²), always) recomputes on comb
 * commits. Chrome lives in the entries; status flows through hooks.
 */

import { Color, OrthographicCamera, Scene } from "three";

import { App } from "../../src/app/App.ts";
import { attachParameterSweep } from "../../src/app/ParameterSweep.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import type { GraphCurve } from "../../src/math/types.ts";
import { vec2, vec3 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { projectedConstantField } from "../../src/math/maps/tangentFields.ts";
import type { TangentVectorField } from "../../src/math/maps/tangentFields.ts";
import { createSphereGrid, plTangentField } from "../../src/math/sphereGrid.ts";
import type { PLTangentField } from "../../src/math/sphereGrid.ts";
import { latitudeLoop, movingFrameAt, overPoleFamily, tangentGraphLoop } from "../../src/math/frames.ts";
import type { SphereLoop } from "../../src/math/frames.ts";
import { coreDistanceAtIndex } from "../../src/math/analysis/collisions.ts";
import { windingNumber } from "../../src/math/analysis/winding.ts";
import { findSphereFieldZeros } from "../../src/math/analysis/sphereFieldZeros.ts";
import type { SphereCensus } from "../../src/math/analysis/sphereFieldZeros.ts";

import { theme, roleColor } from "../../src/components/theme.ts";
import { GhostTrail } from "../../src/components/GhostTrail.ts";
import { attachSphereBrush } from "../../src/components/SphereBrush.ts";
import type { SphereBrush } from "../../src/components/SphereBrush.ts";
import { SliceDisk } from "../../src/components/SliceDisk.ts";
import { SlicePlate } from "../../src/components/SlicePlate.ts";
import { LoopTrail } from "../../src/components/LoopTrail.ts";
import { DiskCurve2D } from "../../src/components/panel2d.ts";
import { TangentArrows } from "../../src/components/TangentArrows.ts";
import { FrameGizmo } from "../../src/components/FrameGizmo.ts";
import { createTorusView } from "../../src/views/TorusView.ts";
import type { TorusView } from "../../src/views/TorusView.ts";
import { createSphereView } from "../../src/views/SphereView.ts";
import type { SphereView } from "../../src/views/SphereView.ts";

const SADDLE_COLOR = 0x8d4fd3;
const N = 512;
const EPSILON = 0.05;

export type PoincareMode = "story" | "render";

export interface PoincareStatus {
    status: string;
    tone: "quiet" | "linked" | "touching";
    caption: string;
    meters: { minV: string; winding: string; zeros: string; indexSum: string };
}

export interface PoincareScene {
    readonly app: App;
    readonly state: { phi: number; theta: number };
    readonly torusView: TorusView;
    readonly sphere: SphereView;
    readonly comb: SphereBrush | null;
    readonly combState: { on: boolean };
    readonly v: PLTangentField;
    readonly source: TangentVectorField;
    setPhi(phi: number): void;
    setTheta(theta: number): void;
    /** traverse the latitude loop backwards: γ̄(θ) = γ(−θ). The paper's
     *  (1,−1) bookend is the SAME north loop reversed, not the south loop. */
    setReversed(on: boolean): void;
    /** engage the paper's γ → γ̄ deformation at parameter s ∈ [0, 1]
     *  (leg 1: stretch through the latitudes; leg 2: over the pole).
     *  setPhi / setReversed / the φ-sweep disengage it. */
    setHomotopy(s: number): void;
    /** the s-value whose leg-1 loop is the latitude φ (capped at ½) */
    sForPhi(phi: number): number;
    /** play/pause the γ → γ̄ deformation with ghost trails */
    homotopyToggle(): boolean;
    /** run the deformation synchronously with n ghost snapshots up to
     *  s = upTo (render presets) */
    bakeHomotopy(snapshots?: number, upTo?: number): void;
    setCombMode(on: boolean): void;
    /** the f_γ construction figure: the moving frame on the sphere plus the
     *  fibre disk beside it, carrying p_γ(θ) and the vector as a segment */
    setFramePlate(on: boolean, theta?: number): void;
    /** the γ → γ̄ deformation as a family of loops on the sphere, left as a
     *  fading trail; ends with the live loop at s = 1 (γ̄ itself) */
    bakeLoopFamily(snapshots?: number): void;
    refresh(): void;
    updateSlice(): void;
    /** jump the deformation to the next latitude through a zero (cycles,
     *  wraps); returns the s-value, or null if the census is empty */
    snapToZero(): number | null;
    /** φ-sweep pole → pole with ghosts; returns whether now playing */
    sweepToggle(): boolean;
    /** re-bake the analytic preset (after mutating source.params) */
    rebake(): void;
    /** restore the original preset field */
    resetField(): void;
    hooks: {
        afterRefresh?(s: PoincareStatus): void;
        onSweepStep?(phi: number): void;
        onSweepEnd?(): void;
        onHomotopyStep?(s: number): void;
        onHomotopyEnd?(): void;
    };
}

export function buildPoincareScene(
    options: { mode?: PoincareMode; meridian?: boolean; thetaProbe?: boolean } = {},
): PoincareScene {
    const mode = options.mode ?? "story";
    // the θ-probe furniture (the slice dot and the frame gizmo) only makes
    // sense when a θ control exists — the lab; frozen at θ = 0 it confuses
    const thetaProbe = options.thetaProbe ?? true;

    // the field is DATA: a PL tangent field opened on the preset, comb-able
    const grid = createSphereGrid(48, 96);
    const source = projectedConstantField(1, 0, 0);
    const v = plTangentField(grid, source);
    const presetVectors = v.snapshot();

    let censusDirty = false;
    let census: SphereCensus = findSphereFieldZeros(v);
    function getCensus(): SphereCensus {
        if (censusDirty) {
            census = findSphereFieldZeros(v);
            censusDirty = false;
        }
        return census;
    }

    const app = new App();
    const torus = new SolidTorus();

    const query = new URLSearchParams(window.location.search);
    const phiParam = query.get("phi") ?? query.get("s");
    const thetaParam = query.get("theta");
    const state = {
        phi: phiParam !== null && Number.isFinite(Number(phiParam)) ? Number(phiParam) : 0.4,
        theta: thetaParam !== null && Number.isFinite(Number(thetaParam)) ? Number(thetaParam) : 0,
    };

    // -------------------------------------------------------- torus view
    const gCurve = createGraphCurve(N, "vector-field", "v∘γ");
    // sphere on the LEFT, torus on the right, in both modes
    const torusView = createTorusView({
        app,
        torus,
        curves: [gCurve],
        rect: { x: 1 / 3, y: 0, w: 2 / 3, h: 1 },
        markers: 8,
        meridian: options.meridian ?? mode === "story",
    });
    const ghostG = new GhostTrail({ torus, source: gCurve });
    torusView.scene.add(ghostG);

    // ------------------------------------------------------ domain sphere
    const sphere = createSphereView({
        app,
        rect: mode === "render" ? { x: 0, y: 0, w: 1 / 3, h: 1 } : { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
        markers: 0,
        dots: 12,
        cameraPos: [2.7, 1.9, 3.5], // pulled back — the sphere sits smaller in frame
    });
    const arrows = new TangentArrows(v);
    const gizmo = new FrameGizmo();
    sphere.scene.add(arrows, gizmo);

    // The construction of f_γ, which §4 defines in a sentence and never draws:
    // lay the tangent plane at γ(θ) onto D² so that γ′ lands on (1, 0), and read
    // off where v(γ(θ)) falls. The plate beside the sphere IS that disk — its +x
    // is γ′ — and the segment from its centre is the vector.
    let framePlateOn = false;
    const framePlate = new SlicePlate();
    framePlate.scale.setScalar(0.8);
    framePlate.position.set(1.85, 0.05, 0.2);
    framePlate.rotation.y = 0.42; // turned toward the standard sphere pose
    framePlate.visible = false;
    framePlate.setAxes(true);
    sphere.scene.add(framePlate);

    // the loops the γ → γ̄ deformation passes through (§4's "ace out of our
    // sleeve"), which no figure in the paper shows
    const loopTrail = new LoopTrail();
    sphere.scene.add(loopTrail);

    function placeZeros(): void {
        const { zeros } = getCensus();
        sphere.setDots(
            zeros.slice(0, 12).map((zero) => ({
                p: zero.position,
                color: zero.index === -1 ? SADDLE_COLOR : theme.marker,
            })),
        );
    }

    // ---------------------------------------------- slice inspector (story)
    let slice: SliceDisk | null = null;
    let traceCurve: DiskCurve2D | null = null;
    if (mode === "story") {
        const sliceScene = new Scene();
        sliceScene.background = new Color(theme.sliceBackground);
        slice = new SliceDisk();
        sliceScene.add(slice);
        traceCurve = new DiskCurve2D(gCurve, roleColor("vector-field"), 0.014);
        traceCurve.position.z = 0.0025;
        sliceScene.add(traceCurve);
        const sliceCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        sliceCamera.position.z = 5;
        app.views.add({
            name: "slice",
            scene: sliceScene,
            camera: sliceCamera,
            rect: { x: 0, y: 0, w: 1 / 3, h: 0.5 },
            orthoHalfHeight: 1.2,
        });
    }

    // ----------------------------------------------------------- refresh
    const status: PoincareStatus = {
        status: "",
        tone: "quiet",
        caption: "",
        meters: { minV: "", winding: "", zeros: "", indexSum: "" },
    };

    let reversed = false;
    // THE demo parameter: the γ → γ̄ deformation s ∈ [0, 1]. Its first
    // half IS the latitude sweep (φ = α₀ + 2s(π − 2α₀)), its second half
    // carries the loop over the pole — so one slider drives everything;
    // null = plain latitude mode (setPhi, presets). α₀ = bookend radius.
    const HOMOTOPY_ALPHA = 0.15;
    let homotopyS: number | null = null;

    function sForPhi(phi: number): number {
        return Math.min(
            0.5,
            Math.max(0, (phi - HOMOTOPY_ALPHA) / (2 * (Math.PI - 2 * HOMOTOPY_ALPHA))),
        );
    }

    /** engage the deformation at s, keeping state.phi coherent on leg 1 */
    function applyHomotopy(s: number): void {
        homotopyS = Math.min(1, Math.max(0, s));
        if (homotopyS <= 0.5) {
            state.phi = HOMOTOPY_ALPHA + 2 * homotopyS * (Math.PI - 2 * HOMOTOPY_ALPHA);
        }
    }

    function currentLoop(): SphereLoop {
        return homotopyS !== null
            ? overPoleFamily(homotopyS, HOMOTOPY_ALPHA).loop
            : latitudeLoop(state.phi, reversed);
    }

    function refresh(): void {
        refillGraphCurve(gCurve, tangentGraphLoop(v, currentLoop()));
        torusView.refit();
        traceCurve?.refit(gCurve);
        if (homotopyS !== null) {
            const { center, alpha } = overPoleFamily(homotopyS, HOMOTOPY_ALPHA);
            sphere.latitude.setCircle(center, alpha);
        } else {
            sphere.setPhi(state.phi);
        }
        arrows.refit();
        placeZeros();

        const events = detectCrossings(gCurve, EPSILON);
        torusView.placeMarkers(events);

        const w = windingNumber(gCurve);
        const { zeros, indexSum } = getCensus();
        const min = minCoreDistance(gCurve);
        status.meters.minV = min.toFixed(3);
        status.meters.winding = w.toFixed(2);
        status.meters.zeros = String(zeros.length);
        status.meters.indexSum =
            indexSum === null
                ? "—"
                : indexSum === 2
                  ? "2 = χ(S²) ✓"
                  : `${indexSum} ✗ (should be 2)`;

        if (min < EPSILON) {
            status.status = "the graph crosses the core — v = 0: a zero of the field!";
            status.tone = "touching";
        } else {
            status.status = `winding ${w.toFixed(0)} — the graph circles the core without touching`;
            status.tone = "linked";
        }
        const sigma =
            indexSum === 2
                ? `${zeros.length} zeros · Σ index = 2 = χ(S²) — combing can never cancel them`
                : `${zeros.length} zeros · Σ index ${status.meters.indexSum}`;
        status.caption = events.length
            ? events.map((e) => `zero @ θ ≈ ${e.theta.toFixed(2)}`).join("   ·   ") + "   ·   " + sigma
            : sigma;
        if (homotopyS !== null) {
            const leg =
                homotopyS <= 0.5
                    ? "stretching γ through the latitudes toward the south pole"
                    : "carrying the small loop up and over the north pole — γ becomes γ̄";
            status.caption = `γ → γ̄ · s = ${homotopyS.toFixed(2)} · ${leg}`;
        }

        updateSlice();
        scene.hooks.afterRefresh?.(status);
    }

    interface Crossing {
        index: number;
        theta: number;
        x: number;
        y: number;
    }

    function detectCrossings(g: GraphCurve, epsilon: number): Crossing[] {
        const events: Crossing[] = [];
        for (let i = 0; i < g.N; i++) {
            const d = coreDistanceAtIndex(g, i);
            if (d >= epsilon) continue;
            const prev = coreDistanceAtIndex(g, (i + g.N - 1) % g.N);
            const next = coreDistanceAtIndex(g, (i + 1) % g.N);
            if (d <= prev && d <= next) {
                events.push({ index: i, theta: g.theta[i]!, x: g.disk[2 * i]!, y: g.disk[2 * i + 1]! });
            }
        }
        return events;
    }

    function minCoreDistance(g: GraphCurve): number {
        let min = Infinity;
        for (let i = 0; i < g.N; i++) min = Math.min(min, coreDistanceAtIndex(g, i));
        return min;
    }

    const framePos = vec3();
    const frameE1 = vec3();
    const frameE2 = vec3();
    const frameV = vec3();

    function updateSlice(): void {
        const index = Math.round((state.theta / (2 * Math.PI)) * N) % N;
        torusView.setMeridianTheta(state.theta);
        if (slice) {
            const events = detectCrossings(gCurve, EPSILON);
            if (thetaProbe) {
                slice.updateSlice([gCurve], index);
                const near = events.find((e) => angularIndexDistance(e.index, index, N) < N / 64);
                slice.showEvent(near ? vec2(near.x, near.y) : null);
            } else {
                // no θ control: no frozen probe dot, but still flag the
                // core-crossing point on the trace when there is one
                slice.updateSlice([], 0);
                slice.showEvent(events[0] ? vec2(events[0].x, events[0].y) : null);
            }
        }
        if (thetaProbe || framePlateOn) {
            movingFrameAt(currentLoop(), state.theta, framePos, frameE1, frameE2);
            v.evalTangent(framePos, 0, frameV);
            gizmo.set(framePos, frameE1, frameE2, frameV);
        } else {
            gizmo.visible = false;
        }
        if (framePlateOn) {
            // p_γ(θ) = (⟨v, e₁⟩, ⟨v, e₂⟩) — already sampled into the graph curve
            const p = vec2(gCurve.disk[2 * index]!, gCurve.disk[2 * index + 1]!);
            framePlate.setDots([{ x: p.x, y: p.y, color: roleColor("vector-field") }]);
            // the vector itself, in the field's own colour
            framePlate.setSegment({ x: 0, y: 0 }, p, roleColor("vector-field"));
        }
    }

    function angularIndexDistance(a: number, b: number, n: number): number {
        const d = Math.abs(a - b) % n;
        return Math.min(d, n - d);
    }

    // ------------------------------------------------------------- sweep
    const sweep = attachParameterSweep({
        app,
        range: [0.05, Math.PI - 0.05],
        duration: 10,
        snapshots: 7,
        onStep: (value) => {
            state.phi = value;
            scene.hooks.onSweepStep?.(value);
            refresh();
        },
        onSnapshot: () => ghostG.snapshot(),
        onDone: () => scene.hooks.onSweepEnd?.(),
    });

    // the paper's γ → γ̄ round trip, animated with ghost trails
    const homotopySweep = attachParameterSweep({
        app,
        range: [0, 1],
        duration: 14,
        snapshots: 9,
        onStep: (s) => {
            applyHomotopy(s);
            scene.hooks.onHomotopyStep?.(s);
            refresh();
        },
        onSnapshot: () => ghostG.snapshot(),
        onDone: () => scene.hooks.onHomotopyEnd?.(),
    });

    function clearHomotopy(): void {
        if (homotopySweep.playing) homotopySweep.pause();
        homotopyS = null;
    }

    // ------------------------------------------------------ comb (story)
    const combState = { on: false };
    let comb: SphereBrush | null = null;
    if (mode === "story") {
        comb = attachSphereBrush({
            app,
            viewport: sphere.viewport,
            camera: sphere.camera,
            grid,
            field: v,
            enabled: () => combState.on,
            onEdit: refresh,
            onCommit: () => {
                censusDirty = true;
                refresh();
            },
        });
        sphere.setOrbitGate(() => !combState.on);
    }

    const scene: PoincareScene = {
        app,
        state,
        torusView,
        sphere,
        comb,
        combState,
        v,
        source,
        setPhi(phi) {
            clearHomotopy();
            state.phi = phi;
            refresh();
        },
        setTheta(theta) {
            state.theta = theta;
            updateSlice();
        },
        setReversed(on) {
            clearHomotopy();
            reversed = on;
            refresh();
        },
        setHomotopy(s) {
            if (homotopySweep.playing) homotopySweep.pause();
            applyHomotopy(s);
            refresh();
        },
        sForPhi,
        homotopyToggle() {
            if (homotopySweep.playing) {
                homotopySweep.pause();
                return false;
            }
            if (sweep.playing) {
                sweep.pause();
                scene.hooks.onSweepEnd?.();
            }
            ghostG.reset();
            homotopySweep.play();
            return true;
        },
        bakeHomotopy(snapshots = 9, upTo = 1) {
            if (homotopySweep.playing) homotopySweep.pause();
            ghostG.reset();
            for (let k = 0; k < snapshots; k++) {
                homotopyS = (upTo * k) / (snapshots - 1);
                refresh();
                if (k < snapshots - 1) ghostG.snapshot();
            }
        },
        setCombMode(on) {
            combState.on = on;
        },
        bakeLoopFamily(snapshots = 8) {
            if (homotopySweep.playing) homotopySweep.pause();
            loopTrail.reset();
            // the loops are the subject here; the fur would only crowd them
            arrows.visible = false;
            for (let k = 0; k < snapshots; k++) {
                const s = k / (snapshots - 1);
                applyHomotopy(s);
                refresh();
                const { center, alpha } = overPoleFamily(s, HOMOTOPY_ALPHA);
                if (k < snapshots - 1) loopTrail.snapshot(center, alpha);
            }
        },
        setFramePlate(on, theta) {
            framePlateOn = on;
            framePlate.visible = on;
            // The whole field is teal, and so is v — inside the fur the frame
            // gizmo is invisible. This figure is about ONE point of ONE loop, so
            // the field steps back and lets the frame read.
            arrows.visible = !on;
            if (theta !== undefined) state.theta = theta;
            updateSlice();
        },
        refresh,
        updateSlice,
        snapToZero() {
            const { zeros } = getCensus();
            if (zeros.length === 0) return null;
            const lo = HOMOTOPY_ALPHA;
            const hi = Math.PI - HOMOTOPY_ALPHA;
            const phis = [...new Set(zeros.map((z) => Math.acos(Math.max(-1, Math.min(1, z.position.z)))))]
                .map((phi) => Math.min(hi, Math.max(lo, phi)))
                .sort((a, b) => a - b);
            // cycle upward through the zero latitudes, wrapping around
            const next = phis.find((phi) => phi > state.phi + 1e-3) ?? phis[0]!;
            if (homotopySweep.playing) homotopySweep.pause();
            applyHomotopy(sForPhi(next));
            refresh();
            return homotopyS;
        },
        sweepToggle() {
            if (sweep.playing) {
                sweep.pause();
                return false;
            }
            clearHomotopy();
            ghostG.reset();
            sweep.play();
            return true;
        },
        rebake() {
            v.resetToPreset(source);
            censusDirty = true;
            refresh();
        },
        resetField() {
            if (comb) comb.reset(presetVectors);
            else {
                v.restore(presetVectors);
                censusDirty = true;
                refresh();
            }
        },
        hooks: {},
    };

    app.views.resize(window.innerWidth, window.innerHeight);
    refresh();
    app.start();
    return scene;
}
