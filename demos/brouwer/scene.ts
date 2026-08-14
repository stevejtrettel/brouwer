/**
 * Brouwer scene — the shared assembly behind the website, lab, and render
 * entries. Composes the torus view, the two editable disk panels (story
 * mode), the baked crumple map, the fixed-point census, the r-sweep with
 * ghost trails, and the paper's Figure 2 move: the PUSH-TO-CORE homotopy
 * H_t(θ) = (1 − t)·f₁(θ), which slides Γ_f radially onto the core while
 * Γ_i rides the boundary — a radial push can never cross i₁, so Lk = 1 the
 * whole way down. Chrome lives in the entries; status text flows out
 * through hooks.
 */

import { App } from "../../src/app/App.ts";
import { attachParameterSweep } from "../../src/app/ParameterSweep.ts";
import type { ParameterSweep } from "../../src/app/ParameterSweep.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import type { GraphCurve } from "../../src/math/types.ts";
import { vec2, vec3 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { identityMap } from "../../src/math/maps/diskMaps.ts";
import { bakeCrumple } from "../../src/math/maps/bakedCrumple.ts";
import { createDiskGrid } from "../../src/math/diskGrid.ts";
import type { DiskGrid } from "../../src/math/diskGrid.ts";
import { identityLoop, mapLoop, findAllFixedPoints } from "../../src/math/proofs/brouwer.ts";
import { linkingNumber } from "../../src/math/analysis/linking.ts";
import { graphDistanceAtIndex } from "../../src/math/analysis/collisions.ts";

import { theme, roleColor } from "../../src/components/theme.ts";
import { GhostTrail } from "../../src/components/GhostTrail.ts";
import { Marker } from "../../src/components/Marker.ts";
import { RibbonStrip } from "../../src/components/RibbonStrip.ts";
import { MeridianDisk } from "../../src/components/MeridianDisk.ts";
import { SlicePlate } from "../../src/components/SlicePlate.ts";
import { SpanningDisk, diskPiercings } from "../../src/components/SpanningDisk.ts";
import { makeDiskTexture } from "../../src/components/diskTexture.ts";
import { DiskCurve2D } from "../../src/components/panel2d.ts";
import { attachSheetSculptor } from "../../src/components/SheetSculptor.ts";
import type { SheetSculptor } from "../../src/components/SheetSculptor.ts";
import { createTorusView } from "../../src/views/TorusView.ts";
import type { TorusView } from "../../src/views/TorusView.ts";
import { createDiskView } from "../../src/views/DiskView.ts";
import type { DiskView } from "../../src/views/DiskView.ts";

const SADDLE_COLOR = 0x8d4fd3; // violet for index −1; theme.marker gold otherwise
const N = 512; // samples per graph curve
const EPSILON = 0.03; // collision threshold for event markers
// only reveal a torus fixed-point dot when the circle S_r is within this band
// of the fixed point's radius
const LANDMARK_BAND = 0.06;

export type BrouwerMode = "story" | "render";

export interface BrouwerStatus {
    status: string;
    tone: "quiet" | "linked" | "touching";
    caption: string;
    meters: { minDist: string; lk: string; fixedPoints: string; indexSum: string };
}

export interface BrouwerScene {
    readonly app: App;
    readonly state: { r: number; push: number };
    readonly torusView: TorusView;
    readonly domain: DiskView | null;
    readonly image: DiskView | null;
    readonly sculptor: SheetSculptor | null;
    /** the grid the map lives on — a crumple is only valid on this one */
    readonly grid: DiskGrid;
    /** swap in a hand-folded map (crumples/<name>.json) in place of the baked
     *  one, and recount its fixed points */
    applyCrumple(crumple: { positions: Float32Array; layers: Float32Array }): void;
    /** set r + full refresh (does not sync widgets — hooks do) */
    setR(r: number): void;
    refresh(): void;
    /** restore the sheet to the flat identity (story mode) */
    reset(): void;
    /** jump r to the next fixed point's radius (cycles, wraps); null when
     *  the map is degenerate or has no isolated fixed points */
    snapToFixedPoint(): number | null;
    /** r-sweep 1 → 0.02 with ghost trails; returns whether now playing */
    sweepToggle(): boolean;
    /** play/pause the paper's Figure 2 argument as a ROUND TRIP at r = 1:
     *  Γ_f deforms onto the core (ghost trails), holds there with the
     *  punchline, and comes back — always ends (or cancels) in the clean
     *  undeformed state. Returns whether now playing. */
    pushToggle(): boolean;
    /** run the push synchronously with n ghost snapshots (render presets);
     *  `upTo` < 1 freezes the deformation mid-flight for figures */
    bakePushToCore(snapshots?: number, upTo?: number): void;
    /** the r-sweep frozen as a still: n ghost snapshots of BOTH families
     *  across [from, to], so one figure shows unlinked → linked (render
     *  presets; the animated version is sweepToggle) */
    bakeSweep(snapshots?: number, from?: number, to?: number): void;
    /** show the deformation surface (Γ_f → core radial tracks) even with
     *  the curve undeformed — the push figure's staging */
    setPushSurface(on: boolean): void;
    /** the linking certificate: the disk bounded by the core, with the single
     *  piercing of the (1,1)-curve marked. Forces r = 1 and drops Γ_f, which
     *  plays no part in this claim. Render mode only. */
    setSpanningDisk(on: boolean): void;
    /** render mode: the highlighted slice in the torus + the face-on
     *  reference plate beside it (the paper's Figure 2, staged globally);
     *  null in story mode */
    readonly slice: { setTheta(theta: number): void; show(on: boolean): void } | null;
    hooks: {
        afterRefresh?(s: BrouwerStatus): void;
        onSweepStep?(r: number): void;
        onSweepEnd?(): void;
        onPushStep?(t: number): void;
        onPushEnd?(): void;
    };
}

export function buildBrouwerScene(
    options: { mode?: BrouwerMode; r?: number; markIndex?: boolean } = {},
): BrouwerScene {
    const mode = options.mode ?? "story";
    // by default every fixed point wears the same gold — the demo is chasing
    // fixed points, not classifying them; the lab opts into index colors
    const markIndex = options.markIndex ?? false;

    // ------------------------------------------------------------ the map
    // f is a whole sculpting session on the PL sheet — grabs and folds baked
    // into the mesh so the demo runs a genuinely crumpled map.
    const grid = createDiskGrid(64, 128);
    // the render page bakes a wilder crumple: Γ_f rides bigger and further
    // from the core, which the figures (especially push-to-core) want
    const sheet = bakeCrumple(grid, { wild: mode === "render" }).map;
    const f = sheet;
    const identityPositions = new Float32Array(grid.domain);

    let census = findAllFixedPoints(f, 0, { minDepth: 4 });

    // ------------------------------------------------------- app + state
    const app = new App();
    const torus = new SolidTorus();

    const query = new URLSearchParams(window.location.search);
    const rParam = query.get("r") ?? query.get("s");
    const state = {
        r:
            options.r ??
            (rParam !== null && Number.isFinite(Number(rParam))
                ? Math.min(1, Math.max(0.02, Number(rParam)))
                : 0.6),
        push: 0, // push-to-core homotopy parameter t
    };

    // -------------------------------------------------------- torus view
    const iCurve = createGraphCurve(N, "identity", "i_r");
    const fCurve = createGraphCurve(N, "map", "f_r");
    const torusView = createTorusView({
        app,
        torus,
        curves: [iCurve, fCurve],
        rect: mode === "render" ? { x: 0, y: 0, w: 1, h: 1 } : { x: 1 / 3, y: 0, w: 2 / 3, h: 1 },
        markers: 8,
        landmarks: 12,
        meridian: false,
    });

    // The r-sweep figure holds the whole family in one still, so its trails
    // have to read through the glass shell — but only a FEW of them. Ten
    // stacked translucent tubes path-trace into speckled mud; five well-spaced
    // ones read as a family of nested circles, which is the point. (A pool
    // smaller than the snapshot count also silently rotates, overwriting the
    // small-r ghosts nearest the core.)
    const ghostPool =
        mode === "render"
            ? { count: 6, opacity: { newest: 0.5, floor: 0.3 } }
            : { count: 6 };
    const ghostI = new GhostTrail({ torus, source: iCurve, ...ghostPool });
    const ghostF = new GhostTrail({ torus, source: fCurve, ...ghostPool });
    torusView.scene.add(ghostI, ghostF);

    // the deformation surface: at each θ, the radial line from the
    // ORIGINAL Γ_f(θ) down to the core — the union of all the push tracks,
    // a curtain hanging from the blue curve to the core. Shown on demand
    // (the push figure) and during any push animation, where the curve
    // descends inside it.
    let surfaceOn = false;
    const fOrigCurve = createGraphCurve(N, "map", "f₁");
    const zeroCurve = createGraphCurve(N, "core", "core");
    refillGraphCurve(zeroCurve, (_theta, out) => {
        out.x = 0;
        out.y = 0;
    });
    const pushSurface = new RibbonStrip({
        a: fOrigCurve,
        b: zeroCurve,
        torus,
        width: 16,
        color: 0x7da3ec, // lightened map blue — solid enough to read as a surface
        opacity: 0.85,
    });
    pushSurface.visible = false;
    torusView.scene.add(pushSurface);

    // the paper's linking certificate (p. 6): a disk bounded by the core, which
    // the (1,1)-curve pierces exactly once. Render mode only — it is a figure
    // device, not something to fly through while dragging r.
    let spanningDisk: SpanningDisk | null = null;
    const pierceDots: Marker[] = [];
    if (mode === "render") {
        spanningDisk = new SpanningDisk(torus);
        spanningDisk.visible = false;
        for (let i = 0; i < 2; i++) {
            const dot = new Marker(0.105); // the figure's one countable thing
            dot.visible = false;
            pierceDots.push(dot);
        }
        torusView.scene.add(spanningDisk, ...pierceDots);
    }

    function updatePiercings(): void {
        if (!spanningDisk) return;
        const thetas = spanningDisk.visible ? diskPiercings(iCurve) : [];
        for (let i = 0; i < pierceDots.length; i++) {
            const theta = thetas[i];
            pierceDots[i]!.visible = theta !== undefined;
            if (theta === undefined) continue;
            const idx = Math.round((theta / (2 * Math.PI)) * N) % N;
            torusView.embed(theta, iCurve.disk[2 * idx]!, iCurve.disk[2 * idx + 1]!, markerPos);
            pierceDots[i]!.position.set(markerPos.x, markerPos.y, markerPos.z);
        }
    }

    // ---------------------------- highlighted slice + reference plate
    // (render mode) — the paper's Figure 2 staged globally: one meridian
    // disk lit inside the torus, repeated face-on beside it with the
    // radial push segment. Hidden until a preset asks for it.
    let sliceTheta = 5.1;
    let sliceDisk: MeridianDisk | null = null;
    let slicePlate: SlicePlate | null = null;
    let sliceDotI: Marker | null = null;
    let sliceDotF: Marker | null = null;
    const sliceOriginal = vec2();

    if (mode === "render") {
        sliceDisk = new MeridianDisk(torus, { theta: sliceTheta, style: "figure" });
        slicePlate = new SlicePlate();
        slicePlate.scale.setScalar(1.0);
        slicePlate.position.set(-4.3, 0.45, 0); // bottom clears the figure ground
        sliceDotI = new Marker(0.085);
        sliceDotI.setColor(roleColor("identity"));
        sliceDotF = new Marker(0.085);
        sliceDotF.setColor(roleColor("map"));
        torusView.scene.add(sliceDisk, slicePlate, sliceDotI, sliceDotF);
        setSliceVisible(false);
    }

    function setSliceVisible(on: boolean): void {
        if (!slicePlate) return;
        sliceDisk!.visible = on;
        slicePlate.visible = on;
        sliceDotI!.visible = on;
        sliceDotF!.visible = on;
    }

    function updateSliceFigure(): void {
        if (!slicePlate || !slicePlate.visible) return;
        const idx = Math.round((sliceTheta / (2 * Math.PI)) * N) % N;
        const ix = iCurve.disk[2 * idx]!;
        const iy = iCurve.disk[2 * idx + 1]!;
        const fx = fCurve.disk[2 * idx]!;
        const fy = fCurve.disk[2 * idx + 1]!;

        // the reference plate: both points, the radial path to the core,
        // and (mid-push) a faded dot remembering where f₁ started
        slicePlate.setDots([
            { x: ix, y: iy, color: roleColor("identity") },
            { x: fx, y: fy, color: roleColor("map") },
        ]);
        slicePlate.setSegment({ x: fx, y: fy }, { x: 0, y: 0 });
        if (state.push > 0) {
            mapLoop(f, state.r).loop(sliceTheta, sliceOriginal);
            slicePlate.setFadedDot(sliceOriginal);
        } else {
            slicePlate.setFadedDot(null);
        }

        // the same two points on the highlighted disk inside the torus
        torusView.embed(sliceTheta, ix, iy, markerPos);
        sliceDotI!.visible = true;
        sliceDotI!.position.set(markerPos.x, markerPos.y, markerPos.z);
        torusView.embed(sliceTheta, fx, fy, markerPos);
        sliceDotF!.visible = true;
        sliceDotF!.position.set(markerPos.x, markerPos.y, markerPos.z);
    }

    // -------------------------------------------------- 2D panels (story)
    let domain: DiskView | null = null;
    let image: DiskView | null = null;
    let sculptor: SheetSculptor | null = null;
    let imageBorder: DiskCurve2D | null = null;
    let imageCurve: DiskCurve2D | null = null;
    const boundaryCurve = createGraphCurve(N, "map", "∂D²");

    if (mode === "story") {
        const texture = makeDiskTexture();
        domain = createDiskView({
            app,
            name: "domain",
            rect: { x: 0, y: 0, w: 1 / 3, h: 0.5 },
            texture,
            ring: true,
            dots: 12,
        });
        domain.disk.refit(identityMap());

        image = createDiskView({
            app,
            name: "image",
            rect: { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
            texture,
            grid,
            opacity: 0.85,
            backdrop: true,
            dots: 12, // the SAME fixed points as the domain: f(x*) = x*
        });
        image.disk.setPositions(sheet.positions);
        imageBorder = new DiskCurve2D(boundaryCurve, theme.roles.core, 0.012);
        imageBorder.position.z = 0.02;
        image.scene.add(imageBorder);
        imageCurve = new DiskCurve2D(fCurve, roleColor("map"));
        imageCurve.position.z = 0.04;
        image.scene.add(imageCurve);
    }

    function updateBorder(): void {
        if (!imageBorder) return;
        refillGraphCurve(boundaryCurve, mapLoop(f, 1).loop);
        imageBorder.refit(boundaryCurve);
    }
    updateBorder();

    const markerPos = vec3();
    function fixedPointColor(index: number | null): number {
        return markIndex && index === -1 ? SADDLE_COLOR : theme.marker;
    }
    function placeFixedPoints(): void {
        const specs = census.fixedPoints.slice(0, 12).map((fp) => ({
            x: fp.x.x,
            y: fp.x.y,
            color: fixedPointColor(fp.index),
        }));
        // a fixed point satisfies f(x*) = x*, so the SAME dot marks it on the
        // domain and on the crumpled image — that coincidence is the point
        domain?.setDots(specs);
        image?.setDots(specs);
        for (let i = 0; i < torusView.landmarks.length; i++) {
            const fp = census.fixedPoints[i];
            if (!fp) continue;
            const dot = torusView.landmarks[i]!;
            dot.setColor(fixedPointColor(fp.index));
            torusView.embed(fp.theta, fp.x.x, fp.x.y, markerPos);
            dot.position.set(markerPos.x, markerPos.y, markerPos.z);
        }
    }
    placeFixedPoints();

    // ----------------------------------------------------------- refresh
    const status: BrouwerStatus = {
        status: "",
        tone: "quiet",
        caption: "",
        meters: { minDist: "", lk: "", fixedPoints: "", indexSum: "" },
    };

    function censusMeters(): void {
        status.meters.fixedPoints = census.degenerate
            ? "∞ (f ≈ id on a region)"
            : String(census.fixedPoints.length);
        status.meters.indexSum =
            census.indexSum === null
                ? "—"
                : census.indexSum === 1
                  ? "1 = L(f) ✓"
                  : `${census.indexSum} ✗ (should be 1)`;
    }
    censusMeters();

    function refresh(): void {
        refillGraphCurve(iCurve, identityLoop(state.r).loop);
        const fLoop = mapLoop(f, state.r).loop;
        if (state.push > 0) {
            // the paper's deformation: scale the whole image loop toward 0
            const s = 1 - state.push;
            refillGraphCurve(fCurve, (theta, out) => {
                fLoop(theta, out);
                out.x *= s;
                out.y *= s;
            });
        } else {
            refillGraphCurve(fCurve, fLoop);
        }
        torusView.refit();

        const wantSurface = surfaceOn || state.push > 0;
        pushSurface.visible = wantSurface;
        if (wantSurface) {
            refillGraphCurve(fOrigCurve, fLoop);
            pushSurface.refit();
        }

        const events = state.push > 0 ? [] : detectCollisions(iCurve, fCurve, EPSILON);
        // with the spanning disk up, Γ_f is hidden and a fixed-point marker on a
        // curve nobody can see reads as a second piercing — the one count the
        // figure exists to make
        const showEvents = !census.degenerate && spanningDisk?.visible !== true;
        torusView.placeMarkers(showEvents ? events : []);
        updateLandmarks();

        domain?.setRingRadius(state.r);
        imageCurve?.refit(fCurve);
        updateSliceFigure();
        updatePiercings();

        const link = linkingNumber(fCurve, iCurve);
        status.meters.minDist = minDistance(iCurve, fCurve).toFixed(3);
        status.meters.lk = link.lk === null ? "—" : String(link.lk);

        if (pushPhase === "hold") {
            status.status = `Γ_f rides the core — visibly linked with Γ_i · Lk = ${link.lk ?? "—"}`;
            status.tone = "linked";
            status.caption =
                "the deformation never crossed Γ_i, and linking can't change without a crossing — " +
                "so Γ_f was linked all along";
        } else if (pushPhase === "down") {
            status.status = `deforming Γ_f onto the core · Lk stays ${link.lk ?? "—"}`;
            status.tone = "linked";
            status.caption =
                "each point of Γ_f slides straight toward its disk's center — " +
                "it can never cross Γ_i, which rides the boundary";
        } else if (pushPhase === "up") {
            status.status = `…and back — the linking never changed · Lk = ${link.lk ?? "—"}`;
            status.tone = "linked";
            status.caption = "no crossings in either direction; the ghosts record the trip";
        } else if (census.degenerate) {
            status.status = "f = identity — every point is a fixed point";
            status.tone = "touching";
            status.caption = "";
        } else if (link.lk === null) {
            status.status = "the curves touch — f(x) = x: a fixed point!";
            status.tone = "touching";
            status.caption = captionFor(events);
        } else if (link.lk === 0) {
            status.status = "unlinked · Lk = 0 — these curves could be pulled apart";
            status.tone = "quiet";
            status.caption = captionFor(events);
        } else {
            status.status = `linked · Lk = ${link.lk} — they cannot separate without touching`;
            status.tone = "linked";
            status.caption = captionFor(events);
        }
        scene.hooks.afterRefresh?.(status);
    }

    function captionFor(events: Collision[]): string {
        if (!events.length) return "";
        const shown = events
            .slice(0, 6)
            .map((e) => `fixed point @ θ ≈ ${e.theta.toFixed(2)}`)
            .join("   ·   ");
        return events.length > 6 ? `${shown}   ·   +${events.length - 6} more` : shown;
    }

    interface Collision {
        theta: number;
        x: number;
        y: number;
    }

    function detectCollisions(gi: GraphCurve, gf: GraphCurve, epsilon: number): Collision[] {
        const events: Collision[] = [];
        const M = Math.min(gi.N, gf.N);
        for (let i = 0; i < M; i++) {
            const d = graphDistanceAtIndex(gi, gf, i);
            if (d >= epsilon) continue;
            const prev = graphDistanceAtIndex(gi, gf, (i + M - 1) % M);
            const next = graphDistanceAtIndex(gi, gf, (i + 1) % M);
            if (d <= prev && d <= next) {
                events.push({
                    theta: gi.theta[i]!,
                    x: (gi.disk[2 * i]! + gf.disk[2 * i]!) / 2,
                    y: (gi.disk[2 * i + 1]! + gf.disk[2 * i + 1]!) / 2,
                });
            }
        }
        return events;
    }

    function minDistance(gi: GraphCurve, gf: GraphCurve): number {
        let min = Infinity;
        for (let i = 0; i < Math.min(gi.N, gf.N); i++) {
            min = Math.min(min, graphDistanceAtIndex(gi, gf, i));
        }
        return min;
    }

    function updateLandmarks(): void {
        // the linking-disk figure is about the core and the (1,1)-curve only: a
        // fixed-point dot there reads as a second piercing and muddles the count
        const suppress = spanningDisk?.visible === true;
        for (let i = 0; i < torusView.landmarks.length; i++) {
            const fp = census.fixedPoints[i];
            torusView.landmarks[i]!.visible =
                !suppress &&
                Boolean(fp) &&
                state.push === 0 &&
                Math.abs(state.r - fp!.r) < LANDMARK_BAND;
        }
    }

    function recomputeCensus(): void {
        census = findAllFixedPoints(f, 0, { minDepth: 4 });
        censusMeters();
        placeFixedPoints();
    }

    // ------------------------------------------------------------ sweeps
    const sweep: ParameterSweep = attachParameterSweep({
        app,
        range: [1, 0.02],
        duration: 10,
        snapshots: 7,
        onStep: (r) => {
            state.r = r;
            scene.hooks.onSweepStep?.(r);
            refresh();
        },
        onSnapshot: () => {
            ghostI.snapshot();
            ghostF.snapshot();
        },
        onDone: () => scene.hooks.onSweepEnd?.(),
    });

    // the linking argument as a round trip: descend (0→1), hold at the core
    // with the punchline, return (1→0). The u-parameter drives the profile.
    let pushPhase: "down" | "hold" | "up" | null = null;
    function pushProfile(u: number): { t: number; phase: "down" | "hold" | "up" } {
        if (u < 0.4) return { t: u / 0.4, phase: "down" };
        if (u < 0.6) return { t: 1, phase: "hold" };
        return { t: (1 - u) / 0.4, phase: "up" };
    }
    const push: ParameterSweep = attachParameterSweep({
        app,
        range: [0, 1],
        duration: 10,
        snapshots: 16, // ~6 land in the descent phase
        onStep: (u) => {
            const p = pushProfile(u);
            state.push = p.t;
            pushPhase = p.phase;
            scene.hooks.onPushStep?.(p.t);
            refresh();
        },
        onSnapshot: () => {
            if (pushPhase === "down") ghostF.snapshot();
        },
        onDone: () => {
            state.push = 0;
            pushPhase = null;
            refresh();
            scene.hooks.onPushEnd?.();
        },
    });

    /** Cancel any in-flight (or paused) deformation — every other control
     *  calls this first so the demo can never be left in the deformed state. */
    function cancelPush(): void {
        if (!push.playing && state.push === 0) return;
        push.pause();
        state.push = 0;
        pushPhase = null;
        scene.hooks.onPushEnd?.();
    }

    // ------------------------------------------------- editing (story)
    if (mode === "story" && image) {
        sculptor = attachSheetSculptor({
            app,
            viewport: image.viewport,
            scene: image.scene,
            grid,
            sheet,
            gripColor: theme.roles.core,
            // small + tight: the baked crumple bunches the rim grips together,
            // and generous grips would steal every grab into a fold
            gripRadius: 0.014,
            gripHitRadius: 0.04,
            onEdit: () => {
                image!.disk.setPositions(sheet.positions);
                updateBorder();
                refresh();
            },
            onCommit: () => {
                recomputeCensus();
                refresh();
            },
        });
    }

    const scene: BrouwerScene = {
        grid,
        applyCrumple(crumple) {
            sheet.positions.set(crumple.positions);
            recomputeCensus();
            refresh();
        },
        app,
        state,
        torusView,
        domain,
        image,
        sculptor,
        setR(r) {
            cancelPush(); // a manual r change always shows the true curves
            state.r = r;
            refresh();
        },
        refresh,
        reset() {
            cancelPush();
            sculptor?.reset(identityPositions);
        },
        snapToFixedPoint() {
            cancelPush();
            if (census.degenerate || census.fixedPoints.length === 0) return null;
            const radii = [...new Set(census.fixedPoints.map((fp) => fp.r))].sort((a, b) => a - b);
            // cycle upward through the fixed-point circles, wrapping around
            const next = radii.find((r) => r > state.r + 1e-4) ?? radii[0]!;
            state.r = Math.min(1, Math.max(0.02, next));
            // put the reference slice ON the fixed point, so the plate shows the
            // two dots coincident — that coincidence IS the figure
            const at = census.fixedPoints.find((fp) => fp.r === next);
            if (at && slicePlate) {
                sliceTheta = ((at.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                sliceDisk!.theta = sliceTheta;
            }
            refresh();
            return state.r;
        },
        sweepToggle() {
            if (sweep.playing) {
                sweep.pause();
                return false;
            }
            cancelPush();
            ghostI.reset();
            ghostF.reset();
            sweep.play();
            return true;
        },
        pushToggle() {
            if (push.playing) {
                push.pause(); // frozen mid-trip; any other control cancels
                return false;
            }
            if (state.push > 0) {
                push.toggle(); // paused mid-trip: resume where it left off
                return true;
            }
            if (sweep.playing) {
                sweep.pause();
                scene.hooks.onSweepEnd?.();
            }
            state.r = 1;
            scene.hooks.onSweepStep?.(1); // sync any r widget
            ghostI.reset();
            ghostF.reset();
            push.play();
            return true;
        },
        bakePushToCore(snapshots = 7, upTo = 1) {
            state.r = 1;
            ghostI.reset();
            ghostF.reset();
            for (let k = 0; k < snapshots; k++) {
                state.push = (upTo * k) / (snapshots - 1);
                refresh();
                if (k < snapshots - 1) ghostF.snapshot();
            }
        },
        bakeSweep(snapshots = 7, from = 0.08, to = 1) {
            cancelPush();
            ghostI.reset();
            ghostF.reset();
            // BOTH families leave trails: the figure's whole point is that the
            // pair goes from unlinked to linked together, so Γ_i's shrink toward
            // the core has to be as visible as Γ_f's wander.
            for (let k = 0; k < snapshots; k++) {
                state.r = from + ((to - from) * k) / (snapshots - 1);
                refresh();
                if (k < snapshots - 1) {
                    ghostI.snapshot();
                    ghostF.snapshot();
                }
            }
        },
        setPushSurface(on) {
            surfaceOn = on;
            refresh();
        },
        setSpanningDisk(on) {
            if (!spanningDisk) return;
            cancelPush();
            spanningDisk.visible = on;
            // the claim is about the core and the (1,1)-curve alone
            torusView.tubes[1]!.visible = !on;
            if (on) state.r = 1;
            torusView.core.visible = true;
            refresh();
        },
        slice: slicePlate
            ? {
                  setTheta(theta) {
                      sliceTheta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                      sliceDisk!.theta = sliceTheta;
                      updateSliceFigure();
                  },
                  show(on) {
                      setSliceVisible(on);
                      updateSliceFigure();
                  },
              }
            : null,
        hooks: {},
    };

    app.views.resize(window.innerWidth, window.innerHeight);
    refresh();
    app.start();
    return scene;
}
