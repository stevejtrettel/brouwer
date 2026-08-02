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
import { latitudeLoop, movingFrameAt, tangentGraphLoop } from "../../src/math/frames.ts";
import { coreDistanceAtIndex } from "../../src/math/analysis/collisions.ts";
import { windingNumber } from "../../src/math/analysis/winding.ts";
import { findSphereFieldZeros } from "../../src/math/analysis/sphereFieldZeros.ts";
import type { SphereCensus } from "../../src/math/analysis/sphereFieldZeros.ts";

import { theme, roleColor } from "../../src/components/theme.ts";
import { GhostTrail } from "../../src/components/GhostTrail.ts";
import { attachSphereBrush } from "../../src/components/SphereBrush.ts";
import type { SphereBrush } from "../../src/components/SphereBrush.ts";
import { SliceDisk } from "../../src/components/SliceDisk.ts";
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
    setCombMode(on: boolean): void;
    refresh(): void;
    updateSlice(): void;
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
    };
}

export function buildPoincareScene(options: { mode?: PoincareMode; meridian?: boolean } = {}): PoincareScene {
    const mode = options.mode ?? "story";

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
    const torusView = createTorusView({
        app,
        torus,
        curves: [gCurve],
        rect: mode === "render" ? { x: 0, y: 0, w: 2 / 3, h: 1 } : { x: 1 / 3, y: 0, w: 2 / 3, h: 1 },
        markers: 8,
        meridian: options.meridian ?? mode === "story",
    });
    const ghostG = new GhostTrail({ torus, source: gCurve });
    torusView.scene.add(ghostG);

    // ------------------------------------------------------ domain sphere
    const sphere = createSphereView({
        app,
        rect: mode === "render" ? { x: 2 / 3, y: 0, w: 1 / 3, h: 1 } : { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
        markers: 0,
        dots: 12,
    });
    const arrows = new TangentArrows(v);
    const gizmo = new FrameGizmo();
    sphere.scene.add(arrows, gizmo);

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

    function refresh(): void {
        refillGraphCurve(gCurve, tangentGraphLoop(v, latitudeLoop(state.phi)));
        torusView.refit();
        traceCurve?.refit(gCurve);
        sphere.setPhi(state.phi);
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
            status.status = `graph crosses the core — zero of the field! (min |v| = ${min.toFixed(3)})`;
            status.tone = "touching";
        } else {
            status.status = `winding ${w.toFixed(2)} · no crossing yet · Σ index = ${status.meters.indexSum}`;
            status.tone = "linked";
        }
        status.caption = events.length
            ? events.map((e) => `zero of v @ θ ≈ ${e.theta.toFixed(2)}`).join("   ·   ")
            : "";

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
            slice.updateSlice([gCurve], index);
            const events = detectCrossings(gCurve, EPSILON);
            const near = events.find((e) => angularIndexDistance(e.index, index, N) < N / 64);
            slice.showEvent(near ? vec2(near.x, near.y) : null);
        }
        movingFrameAt(latitudeLoop(state.phi), state.theta, framePos, frameE1, frameE2);
        v.evalTangent(framePos, 0, frameV);
        gizmo.set(framePos, frameE1, frameE2, frameV);
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

    // ------------------------------------------------------ comb (story)
    const combState = { on: false };
    let comb: SphereBrush | null = null;
    if (mode === "story") {
        comb = attachSphereBrush({
            app,
            viewport: sphere.viewport,
            camera: sphere.camera,
            scene: sphere.scene,
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
            state.phi = phi;
            refresh();
        },
        setTheta(theta) {
            state.theta = theta;
            updateSlice();
        },
        setCombMode(on) {
            combState.on = on;
        },
        refresh,
        updateSlice,
        sweepToggle() {
            if (sweep.playing) {
                sweep.pause();
                return false;
            }
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
