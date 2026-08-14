/**
 * Borsuk–Ulam scene — the shared assembly behind the website, lab, and
 * render entries. f: S² → D² is DATA (a sculptable PL sphere map opened on
 * the offset-projection preset); the latitude graph Γ_f and its antipodal
 * companion Γ_f̄ live in the torus with the swept segment ribbon between
 * them; the domain sphere and the flattened balloon panel round out the
 * story layout. Chrome lives in the entries; status flows through hooks.
 */

import { Color, OrthographicCamera, PerspectiveCamera, Scene } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { App } from "../../src/app/App.ts";
import type { Viewport } from "../../src/app/ViewManager.ts";
import { attachParameterSweep } from "../../src/app/ParameterSweep.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import type { GraphCurve, Vec3 } from "../../src/math/types.ts";
import { vec3 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { powerProjection, spherePoint } from "../../src/math/maps/sphereMaps.ts";
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
import { PushedGraticule } from "../../src/components/PushedGraticule.ts";
import { DiskCurve2D } from "../../src/components/panel2d.ts";
import { SlicePlate } from "../../src/components/SlicePlate.ts";
import { createTorusView } from "../../src/views/TorusView.ts";
import type { TorusView } from "../../src/views/TorusView.ts";
import { createSphereView } from "../../src/views/SphereView.ts";
import { LatitudeRing } from "../../src/components/LatitudeRing.ts";
import type { SphereView } from "../../src/views/SphereView.ts";

const N = 512;
const EPSILON = 0.03;
// ℓ_θ drawn across the band in the figure staging. Enough that the twist is
// countable, few enough that the band still reads as a surface.
const RUNG_COUNT = 32;

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
    /** the ANTIPODAL latitude −S_φ, drawn on the domain sphere in the violet
     *  that f̄ wears everywhere else.
     *
     *  Without it the setup figure shows one circle and two image loops, and
     *  the reader has no way to see where the violet loop came from. With it
     *  the correspondence is carried by colour straight through all three
     *  panels: blue circle → blue image loop → blue graph, violet → violet →
     *  violet. Hidden by default; the setup figure turns it on. */
    readonly antipodalLatitude: LatitudeRing;
    /** Show the gold antipodal-pair markers, or not.
     *
     *  Gold is the FORCED EVENT in this set — the fixed point, the antipodal
     *  coincidence, the core crossing. A setup figure has forced nothing yet,
     *  so the markers are both premature there and spend the colour early.
     *  They are wanted in the pole/pinch/equator figures, where the pair is
     *  the subject, which is why this is a switch and not a deletion.
     *
     *  It has to be a scene flag rather than a call in a figure's apply():
     *  refresh() re-derives the markers from the collision census every frame,
     *  so a one-shot hide is overwritten immediately. */
    setPairMarkers(on: boolean): void;
    /** Pin a gold marker at the antipodal solution found by findPair(), and
     *  keep it there.
     *
     *  The pinch panel's whole subject is the moment f(x) = f(−x), and at that
     *  φ the two curves lie almost on top of each other for a long stretch —
     *  so the reader cannot see WHERE they actually touch. The collision census
     *  that normally drives the markers only fires within EPSILON and moves
     *  around as φ does; this pins the solved point, which is the one the
     *  figure is about. Cleared by passing null. */
    setPinchMarker(pin: { theta: number; x: number; y: number } | null): void;
    /** Stage the codomain panel as a FIGURE rather than as a demo.
     *
     *  On: the textured balloon hides and the pushed grid carries the image —
     *  which is what the paper wants, and what the path tracer can actually
     *  draw (it has no line primitive, and a smeared texture says nothing about
     *  where the sphere stretched or folded).
     *
     *  Off, which is the default and what the WEB demos get: the balloon keeps
     *  its texture. Colour is the right correspondence device when the reader
     *  can drag the map around and watch the image move; the grid is the right
     *  one for a still. Neither replaces the other, so this is a switch. */
    setCrushFigure(on: boolean): void;
    readonly ribbon: RibbonStrip;
    /** the flattened-balloon panel (story mode): the codomain, and where the
     *  map is sculpted. Scaffolding, never a figure — the figure page parks it
     *  in the setup strip. */
    readonly imagePanel: Viewport | null;
    /** THE SAME SCENE, through a perspective camera: the codomain as a FIGURE
     *  rather than as a sculpting surface.
     *
     *  A figure view has to be perspective — the workbench frames it, and the
     *  path tracer drives that camera. The sculpting panel is orthographic
     *  because dragging in it must be a plain screen-to-plane mapping. Rather
     *  than build the crushed image twice, the same Scene is rendered through
     *  a second camera. */
    readonly imageFigure: {
        scene: Scene;
        viewport: Viewport;
        camera: PerspectiveCamera;
        controls: OrbitControls;
    } | null;
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
    /** the ℓ_θ row: five fibre disks side by side, each with its connecting
     *  segment, so the half-twist can be counted. Hides the torus actors —
     *  the figure is the row alone. Render mode only. */
    setSegmentRow(on: boolean): void;
    /** stage the band for a still: the shell's glass thinned so it stops
     *  whiting out its own contents, faces painted separately so each
     *  half-twist flips colour, ℓ_θ drawn across as rungs. Everything the
     *  pole / pinch / equator panels share. */
    setRibbonFigure(on: boolean): void;
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
    options: {
        mode?: BorsukMode;
        meridian?: boolean;
        thetaProbe?: boolean;
        sculpt?: boolean;
        /** build the ℓ_θ plate row (a figure device). Opt-in rather than keyed
         *  to `mode`, because the render page runs the STORY assembly — it wants
         *  the sculptable balloon — so it has to ask for figure furniture. */
        segmentRow?: boolean;
    } = {},
): BorsukScene {
    const mode = options.mode ?? "story";
    // the balloon panel is sculptable by default (the lab); the website
    // turns it off for now — the demo ships with the preset map only
    const sculptable = options.sculpt ?? true;
    // the θ-probe furniture (slice point + antipode on the sphere, the
    // segment + dots on the image panel) only makes sense when a θ control
    // exists — the lab. Without it the probes freeze at θ = 0 and just
    // confuse; the website turns them off.
    const thetaProbe = options.thetaProbe ?? true;

    // the map is DATA: a PL sphere map opened on the power-projection
    // preset (k = 1 ≡ the offset projection; odd k = 3, 5 gives k-twisted
    // Möbius bands at the equator — the lab exposes the knob)
    const grid = createSphereGrid(48, 96);
    // Two staging choices in this one line, both about WHERE the proof's
    // events fall rather than about the mathematics:
    //
    //   ψ = π/2   brings the antipodal pair round from θ = π to θ = 3π/2 — the
    //             front of the torus at the house pose, where the pinch is
    //             actually visible. A rotation of the domain, nothing more.
    //   c = 0.7   widens the UNLINKED phase. The pair sits at tan φ* = c, so
    //             the old c = 0.35 put the whole unlinked range inside
    //             φ < 0.34: the "near-pole, untwisted" figure at φ = 0.32 was
    //             a hair below the pinch and already half collapsed. At c = 0.7
    //             the transition is at φ* ≈ 0.61, and a flat annulus, a pinch
    //             and an odd twist are three genuinely different pictures.
    //             (f(N) = (0.8, 0.15) still lands inside D², just.)
    const source = powerProjection(1, 0.7, 0.1, 0.15, Math.PI / 2);
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

    // same surface recipe as brouwer's push-to-core curtain: finer ruling,
    // lightened color, solid enough to read as a surface (and the shared
    // figure-mode treatment traces it as frosted glass)
    const ribbon = new RibbonStrip({
        a: fCurve,
        b: fbarCurve,
        torus,
        width: 16,
        color: 0xb9aef0, // light ribbon violet
        opacity: 0.72,
    });
    torusView.scene.add(ribbon);

    const ghostF = new GhostTrail({ torus, source: fCurve });
    const ghostFbar = new GhostTrail({ torus, source: fbarCurve });
    torusView.scene.add(ghostF, ghostFbar);

    let ribbonFigure = false;

    // Figure 3 shows ℓ_θ at θ = 0 and θ = π only, which is enough to prove the
    // endpoints swap but leaves "ℓ_θ rotates by kπ, k odd" as something to take
    // on trust. A ROW of slices makes the rotation countable: five plates, five
    // segments, each turned a little further than the last.
    const ROW_THETAS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];
    let segmentRow: SlicePlate[] = [];
    if (options.segmentRow) {
        segmentRow = ROW_THETAS.map((_, i) => {
            const plate = new SlicePlate();
            plate.scale.setScalar(0.92);
            plate.position.set((i - (ROW_THETAS.length - 1) / 2) * 2.25, 0.35, 0);
            plate.visible = false;
            torusView.scene.add(plate);
            return plate;
        });
    }

    function updateSegmentRow(): void {
        if (segmentRow.length === 0 || !segmentRow[0]!.visible) return;
        for (let i = 0; i < ROW_THETAS.length; i++) {
            const idx = Math.round((ROW_THETAS[i]! / (2 * Math.PI)) * N) % N;
            const a = { x: fCurve.disk[2 * idx]!, y: fCurve.disk[2 * idx + 1]! };
            const b = { x: fbarCurve.disk[2 * idx]!, y: fbarCurve.disk[2 * idx + 1]! };
            segmentRow[i]!.setDots([
                { x: a.x, y: a.y, color: roleColor("map") },
                { x: b.x, y: b.y, color: roleColor("antipodal-map") },
            ]);
            segmentRow[i]!.setSegment(a, b, theme.ribbon.color);
        }
    }

    // ------------------------------------------------------ domain sphere
    const antipodalLatitude = new LatitudeRing({ color: roleColor("antipodal-map") });
    antipodalLatitude.visible = false;

    const sphere = createSphereView({
        app,
        rect: mode === "render" ? { x: 2 / 3, y: 0, w: 1 / 3, h: 1 } : { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
        markers: 8,
        dots: 4, // 2 for the always-on antipodal pair + 2 for the lab's θ probe
    });
    sphere.scene.add(antipodalLatitude);

    // ------------------------------------------------- image panel (story)
    let slice: SliceDisk | null = null;
    let sliceViewport: Viewport | null = null;
    let imageFigure: BorsukScene["imageFigure"] = null;
    let pushedGrid: PushedGraticule | null = null;
    let pairMarkers = true;
    let pinchMarker: { theta: number; x: number; y: number } | null = null;
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

        // The domain's grid, carried through f. This is what makes (b) read as
        // "the sphere crushed": the same cells the reader just saw on the
        // sphere, now stretched, bunched and folded. The balloon stays behind
        // it as a faint tint so the image still has a body.
        pushedGrid = new PushedGraticule({ map: f });
        pushedGrid.visible = false; // demo look by default; figures opt in
        sliceScene.add(pushedGrid);
        fImageCurve = new DiskCurve2D(fCurve, roleColor("map"), 0.014);
        fbarImageCurve = new DiskCurve2D(fbarCurve, roleColor("antipodal-map"), 0.014);
        fImageCurve.position.z = 0.0025;
        fbarImageCurve.position.z = 0.002;
        sliceScene.add(fImageCurve, fbarImageCurve);
        const sliceCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        sliceCamera.position.z = 5;

        // second camera on the same scene — the figure view (see imageFigure)
        const figureCamera = new PerspectiveCamera(38, 1, 0.1, 100);
        figureCamera.position.set(0, 0, 3.6);
        const figureControls = new OrbitControls(figureCamera, app.renderer.domElement);
        figureControls.enableDamping = true;
        app.addAnimateCallback(() => figureControls.update());
        const figureViewport = app.views.add({
            name: "image-figure",
            scene: sliceScene,
            camera: figureCamera,
            // parked off-canvas until a figure config frames it
            rect: { x: 2, y: 2, w: 0.001, h: 0.001 },
        });
        imageFigure = {
            scene: sliceScene,
            viewport: figureViewport,
            camera: figureCamera,
            controls: figureControls,
        };
        sliceViewport = app.views.add({
            name: "slice",
            scene: sliceScene,
            camera: sliceCamera,
            rect: { x: 0, y: 0, w: 1 / 3, h: 0.5 },
            orthoHalfHeight: 1.2,
        });

        if (sculptable) {
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
                    pushedGrid?.refit();
                    refresh();
                },
                onCommit: () => {
                    recomputePair(); // the sculpted map's pair moves — re-locate it
                    refresh();
                },
            });
        }
    }

    // ----------------------------------------------------------- refresh
    const status: BorsukStatus = {
        status: "",
        tone: "quiet",
        caption: "",
        meters: { minDist: "", twist: "" },
    };
    const markerScratch: Vec3[] = [];

    /** Everything downstream of the map's vertex positions.
     *
     *  The balloon caches its positions and the pushed grid caches its tubes,
     *  so a wholesale change to f — a loaded crumple, a reset, a preset rebake
     *  — has to poke both. Only the brush was doing it, which meant a loaded
     *  map reached the grid but not the balloon, and panel (b) drew two
     *  different maps at once. */
    function refitMapVisuals(): void {
        balloon?.setPositions(f.positions);
        pushedGrid?.refit();
    }

    function refresh(): void {
        refillGraphCurve(fCurve, latitudeGraphLoop(f, state.phi).loop);
        refillGraphCurve(fbarCurve, antipodalGraphLoop(f, state.phi).loop);
        torusView.refit();
        if (ribbon.visible) ribbon.refit();
        fImageCurve?.refit(fCurve);
        fbarImageCurve?.refit(fbarCurve);
        updateSegmentRow();
        sphere.setPhi(state.phi);
        // −S_φ is the latitude at π − φ: the antipode of every point of S_φ
        antipodalLatitude.setPhi(Math.PI - state.phi);

        const events = detectCollisions(fCurve, fbarCurve, EPSILON);
        // the pinned solution wins over the census: it is the point the figure
        // is making a claim about, and it must not blink out as φ is nudged
        torusView.placeMarkers(pinchMarker ? [pinchMarker, ...events] : events);

        // each collision is a PAIR on the sphere: x(φ, θ) and −x
        markerScratch.length = 0;
        for (const e of pairMarkers ? events.slice(0, 4) : []) {
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
            // NOT a Möbius band: ℓ_θ returns to itself after 2kπ, so the closed
            // band is an annulus with k FULL twists and two boundary curves —
            // which is the whole point, since the two curves are Γ_f and Γ_f̄
            status.status = `twist ${link.lk} — an odd number of full twists: the curves cannot separate without touching`;
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
        // the SECOND gold path onto the sphere — a cached findPair() result,
        // separate from the collision census gated above. Both have to respect
        // the flag or a setup figure keeps its markers.
        if (pair && pairMarkers) {
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
        antipodalLatitude,
        setPairMarkers(on) {
            pairMarkers = on;
            refresh();
        },
        setPinchMarker(pin) {
            pinchMarker = pin;
            refresh();
        },
        setCrushFigure(on) {
            if (pushedGrid) pushedGrid.visible = on;
            if (balloon) balloon.visible = !on;
        },
        imagePanel: sliceViewport,
        imageFigure,
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
        refresh() {
            refitMapVisuals();
            refresh();
        },
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
        setSegmentRow(on) {
            if (segmentRow.length === 0) return;
            for (const plate of segmentRow) plate.visible = on;
            // the row IS the figure: the torus and its curves would only crowd it
            torusView.scene.traverse((obj) => {
                if (obj.userData.figureGlass === true) obj.visible = !on;
            });
            for (const tube of torusView.tubes) tube.visible = !on;
            ribbon.visible = !on;
            torusView.core.visible = !on && !ribbonFigure;
            for (const marker of torusView.markers) if (on) marker.visible = false;
            refresh();
        },
        setRibbonFigure(on) {
            ribbonFigure = on;
            // The shell STAYS. Its glass thins instead: this band fills the
            // torus, so at the house ior the shell is seen at a grazing angle
            // over the whole subject and Fresnel whites it out — which is what
            // made the old equator figure a dark, muddy mass. (Deleting the
            // shell and outlining the torus with two circles fixed the light
            // and lost the doughnut: unexplained rings in a plane read as
            // debris, not as a solid torus.)
            torusView.scene.traverse((obj) => {
                if (obj.userData.figureGlass !== true) return;
                obj.userData.figureGlassIor = on ? theme.paper.glass.iorThin : undefined;
            });
            // the core plays no part in §3 — the argument is about the band's
            // two edges — and it reads as a third curve behind the band
            torusView.core.visible = !on;
            ribbon.setTwoTone(on);
            ribbon.setRungs(on ? RUNG_COUNT : 0);
            refresh();
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
