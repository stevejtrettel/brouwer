/**
 * Borsuk–Ulam scene — the shared assembly behind the website, lab, and
 * render entries. f: S² → D² is DATA (a sculptable PL sphere map opened on
 * the offset-projection preset); the latitude graph Γ_f and its antipodal
 * companion Γ_f̄ live in the torus with the swept segment ribbon between
 * them; the domain sphere and the flattened balloon panel round out the
 * story layout. Chrome lives in the entries; status flows through hooks.
 */

import { Color, OrthographicCamera, Scene } from "three";

import { App } from "../../src/app/App.ts";
import { attachParameterSweep } from "../../src/app/ParameterSweep.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import type { GraphCurve, Vec3 } from "../../src/math/types.ts";
import { vec3 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { offsetProjection, spherePoint } from "../../src/math/maps/sphereMaps.ts";
import type { SphereDiskMap } from "../../src/math/maps/sphereMaps.ts";
import { createSphereGrid, plSphereMap } from "../../src/math/sphereGrid.ts";
import type { PLSphereMap } from "../../src/math/sphereGrid.ts";
import {
    latitudeGraphLoop,
    antipodalGraphLoop,
    findAntipodalPair,
} from "../../src/math/proofs/borsukUlam.ts";
import type { AntipodalPairResult } from "../../src/math/proofs/borsukUlam.ts";
import { graphDistanceAtIndex } from "../../src/math/analysis/collisions.ts";
import { relativeWinding } from "../../src/math/analysis/winding.ts";
import { linkingNumber } from "../../src/math/analysis/linking.ts";

import { theme, roleColor } from "../../src/components/theme.ts";
import { GhostTrail } from "../../src/components/GhostTrail.ts";
import { RibbonStrip } from "../../src/components/RibbonStrip.ts";
import { attachSheetSculptor } from "../../src/components/SheetSculptor.ts";
import type { SheetSculptor } from "../../src/components/SheetSculptor.ts";
import { SliceDisk } from "../../src/components/SliceDisk.ts";
import { SpherePushforward } from "../../src/components/SpherePushforward.ts";
import { makeSphereTexture } from "../../src/components/diskTexture.ts";
import { DiskCurve2D } from "../../src/components/panel2d.ts";
import { createTorusView } from "../../src/views/TorusView.ts";
import type { TorusView } from "../../src/views/TorusView.ts";
import { createSphereView } from "../../src/views/SphereView.ts";
import type { SphereView } from "../../src/views/SphereView.ts";

const N = 512;
const EPSILON = 0.03;

export type BorsukMode = "story" | "render";

export interface BorsukStatus {
    status: string;
    tone: "quiet" | "linked" | "touching";
    caption: string;
    meters: { minDist: string; twist: string };
}

export interface BorsukScene {
    readonly app: App;
    readonly state: { phi: number; theta: number };
    readonly torusView: TorusView;
    readonly sphere: SphereView;
    readonly ribbon: RibbonStrip;
    readonly sculptor: SheetSculptor | null;
    readonly f: PLSphereMap;
    readonly source: SphereDiskMap;
    setPhi(phi: number): void;
    setTheta(theta: number): void;
    refresh(): void;
    updateSlice(): void;
    /** φ-sweep pole → equator with ghosts; returns whether now playing */
    sweepToggle(): boolean;
    /** locate f(x) = f(−x) on the (possibly sculpted) PL map, jump to it;
     *  returns the pair (entries format their own caption), or null */
    findPair(): AntipodalPairResult | null;
    /** re-bake the analytic preset (after mutating source.params) */
    rebake(): void;
    /** restore the original preset positions */
    resetMap(): void;
    hooks: {
        afterRefresh?(s: BorsukStatus): void;
        onSweepStep?(phi: number): void;
        onSweepEnd?(): void;
        /** find-pair jumped the state — sync φ/θ widgets */
        onStateJump?(phi: number, theta: number): void;
    };
}

export function buildBorsukScene(
    options: { mode?: BorsukMode; meridian?: boolean; thetaProbe?: boolean } = {},
): BorsukScene {
    const mode = options.mode ?? "story";
    // the θ-probe furniture (slice point + antipode on the sphere, the
    // segment + dots on the image panel) only makes sense when a θ control
    // exists — the lab. Without it the probes freeze at θ = 0 and just
    // confuse; the website turns them off.
    const thetaProbe = options.thetaProbe ?? true;

    // the map is DATA: a PL sphere map opened on the offset-projection preset
    const grid = createSphereGrid(48, 96);
    const source = offsetProjection(0.35, 0.1, 0.15);
    const f = plSphereMap(grid, source);
    const presetPositions = f.snapshot();

    const app = new App();
    const torus = new SolidTorus();

    const query = new URLSearchParams(window.location.search);
    const phiParam = query.get("phi") ?? query.get("s");
    const thetaParam = query.get("theta");
    const state = {
        phi: phiParam !== null && Number.isFinite(Number(phiParam)) ? Number(phiParam) : Math.PI / 2,
        theta: thetaParam !== null && Number.isFinite(Number(thetaParam)) ? Number(thetaParam) : 0,
    };

    // -------------------------------------------------------- torus view
    const fCurve = createGraphCurve(N, "map", "f");
    const fbarCurve = createGraphCurve(N, "antipodal-map", "f̄");
    const torusView = createTorusView({
        app,
        torus,
        curves: [fCurve, fbarCurve],
        rect: mode === "render" ? { x: 0, y: 0, w: 2 / 3, h: 1 } : { x: 1 / 3, y: 0, w: 2 / 3, h: 1 },
        markers: 8,
        meridian: options.meridian ?? mode === "story",
    });

    const ribbon = new RibbonStrip({ a: fCurve, b: fbarCurve, torus });
    torusView.scene.add(ribbon);

    const ghostF = new GhostTrail({ torus, source: fCurve });
    const ghostFbar = new GhostTrail({ torus, source: fbarCurve });
    torusView.scene.add(ghostF, ghostFbar);

    // ------------------------------------------------------ domain sphere
    const sphere = createSphereView({
        app,
        rect: mode === "render" ? { x: 2 / 3, y: 0, w: 1 / 3, h: 1 } : { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
        markers: 8,
        dots: 4, // 2 for the always-on antipodal pair + 2 for the lab's θ probe
    });

    // ------------------------------------------------- image panel (story)
    let slice: SliceDisk | null = null;
    let balloon: SpherePushforward | null = null;
    let sculptor: SheetSculptor | null = null;
    let fImageCurve: DiskCurve2D | null = null;
    let fbarImageCurve: DiskCurve2D | null = null;

    if (mode === "story") {
        const sliceScene = new Scene();
        sliceScene.background = new Color(theme.sliceBackground);
        slice = new SliceDisk();
        sliceScene.add(slice);
        // translucent enough that BOTH covering sheets' graticule read
        balloon = new SpherePushforward({ grid, texture: makeSphereTexture(), opacity: 0.62 });
        balloon.position.z = 0.0005;
        sliceScene.add(balloon);
        balloon.setPositions(f.positions);
        fImageCurve = new DiskCurve2D(fCurve, roleColor("map"), 0.014);
        fbarImageCurve = new DiskCurve2D(fbarCurve, roleColor("antipodal-map"), 0.014);
        fImageCurve.position.z = 0.0025;
        fbarImageCurve.position.z = 0.002;
        sliceScene.add(fImageCurve, fbarImageCurve);
        const sliceCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        sliceCamera.position.z = 5;
        const sliceViewport = app.views.add({
            name: "slice",
            scene: sliceScene,
            camera: sliceCamera,
            rect: { x: 0, y: 0, w: 1 / 3, h: 0.5 },
            orthoHalfHeight: 1.2,
        });

        sculptor = attachSheetSculptor({
            app,
            viewport: sliceViewport,
            scene: sliceScene,
            topology: grid,
            rest: presetPositions,
            gripVertices: [],
            sheet: f,
            onEdit: () => {
                balloon!.setPositions(f.positions);
                refresh();
            },
            onCommit: () => {
                recomputePair(); // the sculpted map's pair moves — re-locate it
                refresh();
            },
        });
    }

    // ----------------------------------------------------------- refresh
    const status: BorsukStatus = {
        status: "",
        tone: "quiet",
        caption: "",
        meters: { minDist: "", twist: "" },
    };
    const markerScratch: Vec3[] = [];

    function refresh(): void {
        refillGraphCurve(fCurve, latitudeGraphLoop(f, state.phi).loop);
        refillGraphCurve(fbarCurve, antipodalGraphLoop(f, state.phi).loop);
        torusView.refit();
        if (ribbon.visible) ribbon.refit();
        fImageCurve?.refit(fCurve);
        fbarImageCurve?.refit(fbarCurve);
        sphere.setPhi(state.phi);

        const events = detectCollisions(fCurve, fbarCurve, EPSILON);
        torusView.placeMarkers(events);

        // each collision is a PAIR on the sphere: x(φ, θ) and −x
        markerScratch.length = 0;
        for (const e of events.slice(0, 4)) {
            markerScratch.push(
                spherePoint(state.phi, e.theta, vec3()),
                spherePoint(Math.PI - state.phi, e.theta + Math.PI, vec3()),
            );
        }
        sphere.placeMarkers(markerScratch);

        status.meters.minDist = minDistance(fCurve, fbarCurve).toFixed(3);
        status.meters.twist = relativeWinding(fCurve, fbarCurve).toFixed(2);

        const link = linkingNumber(fCurve, fbarCurve);
        if (link.lk === null) {
            status.status = "the curves touch — f(x) = f(−x): an antipodal pair!";
            status.tone = "touching";
        } else if (link.lk === 0) {
            status.status = "twist 0 — an untwisted band: the curves could be pulled apart";
            status.tone = "quiet";
        } else {
            status.status = `twist ${link.lk} — a Möbius band: the curves cannot separate without touching`;
            status.tone = "linked";
        }
        status.caption = events.length
            ? events.map((e) => `antipodal pair @ θ ≈ ${e.theta.toFixed(2)}`).join("   ·   ")
            : "";

        updateSlice();
        scene.hooks.afterRefresh?.(status);
    }

    interface Collision {
        index: number;
        theta: number;
        x: number;
        y: number;
    }

    function detectCollisions(ga: GraphCurve, gb: GraphCurve, epsilon: number): Collision[] {
        const events: Collision[] = [];
        const M = Math.min(ga.N, gb.N);
        for (let i = 0; i < M; i++) {
            const d = graphDistanceAtIndex(ga, gb, i);
            if (d >= epsilon) continue;
            const prev = graphDistanceAtIndex(ga, gb, (i + M - 1) % M);
            const next = graphDistanceAtIndex(ga, gb, (i + 1) % M);
            if (d <= prev && d <= next) {
                events.push({
                    index: i,
                    theta: ga.theta[i]!,
                    x: (ga.disk[2 * i]! + gb.disk[2 * i]!) / 2,
                    y: (ga.disk[2 * i + 1]! + gb.disk[2 * i + 1]!) / 2,
                });
            }
        }
        return events;
    }

    function minDistance(ga: GraphCurve, gb: GraphCurve): number {
        let min = Infinity;
        for (let i = 0; i < Math.min(ga.N, gb.N); i++) {
            min = Math.min(min, graphDistanceAtIndex(ga, gb, i));
        }
        return min;
    }

    const slicePoint = vec3();
    const sliceAntipode = vec3();
    const pairAntipode = vec3();

    // the antipodal pair of the CURRENT map, always highlighted on the
    // sphere (recomputed on sculpt commits) — the analogue of brouwer's
    // always-visible fixed-point dots
    let pair: AntipodalPairResult | null = null;
    function recomputePair(): void {
        const found = findAntipodalPair(f, { residualTol: 1e-5 });
        pair = found.found ? found : null;
        updateSlice();
    }

    function updateSlice(): void {
        const index = Math.round((state.theta / (2 * Math.PI)) * N) % N;
        torusView.setMeridianTheta(state.theta);
        if (slice) {
            const events = detectCollisions(fCurve, fbarCurve, EPSILON);
            if (thetaProbe) {
                slice.updateSlice([fCurve, fbarCurve], index);
                const near = events.find((e) => angularIndexDistance(e.index, index, N) < N / 64);
                slice.showEvent(near ? { x: near.x, y: near.y } : null);
            } else {
                // no θ control: skip the frozen probe dots/segment, but still
                // flag the touch point in the image when the curves collide
                slice.updateSlice([], 0);
                slice.showEvent(events[0] ?? null);
            }
        }

        const specs: { p: Vec3; color: number }[] = [];
        if (pair) {
            pairAntipode.x = -pair.x.x;
            pairAntipode.y = -pair.x.y;
            pairAntipode.z = -pair.x.z;
            specs.push({ p: pair.x, color: theme.marker }, { p: pairAntipode, color: theme.marker });
        }
        if (thetaProbe) {
            spherePoint(state.phi, state.theta, slicePoint);
            spherePoint(Math.PI - state.phi, state.theta + Math.PI, sliceAntipode);
            specs.push(
                { p: slicePoint, color: roleColor("map") },
                { p: sliceAntipode, color: roleColor("antipodal-map") },
            );
        }
        sphere.setDots(specs);
    }

    function angularIndexDistance(a: number, b: number, n: number): number {
        const d = Math.abs(a - b) % n;
        return Math.min(d, n - d);
    }

    // ------------------------------------------------------------- sweep
    const sweep = attachParameterSweep({
        app,
        range: [0.02, Math.PI / 2],
        duration: 8,
        onStep: (v) => {
            state.phi = v;
            scene.hooks.onSweepStep?.(v);
            refresh();
        },
        onSnapshot: () => {
            ghostF.snapshot();
            ghostFbar.snapshot();
        },
        onDone: () => scene.hooks.onSweepEnd?.(),
    });

    const scene: BorsukScene = {
        app,
        state,
        torusView,
        sphere,
        ribbon,
        sculptor,
        f,
        source,
        setPhi(phi) {
            state.phi = phi;
            refresh();
        },
        setTheta(theta) {
            state.theta = theta;
            updateSlice();
        },
        refresh,
        updateSlice,
        sweepToggle() {
            if (sweep.playing) {
                sweep.pause();
                return false;
            }
            ghostF.reset();
            ghostFbar.reset();
            sweep.play();
            return true;
        },
        findPair() {
            // jump to the cached pair (recomputed on sculpt commits)
            if (!pair) return null;
            state.phi = Math.min(Math.PI / 2, Math.max(0.02, pair.phi));
            state.theta = ((pair.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            scene.hooks.onStateJump?.(state.phi, state.theta);
            refresh();
            return pair;
        },
        rebake() {
            f.resetToPreset(source);
            if (sculptor) sculptor.reset(f.snapshot());
            else {
                balloon?.setPositions(f.positions);
                refresh();
            }
            recomputePair();
        },
        resetMap() {
            if (sculptor) sculptor.reset(presetPositions);
            else {
                f.restore(presetPositions);
                refresh();
            }
            recomputePair();
        },
        hooks: {},
    };

    app.views.resize(window.innerWidth, window.innerHeight);
    refresh();
    recomputePair();
    app.start();
    return scene;
}
