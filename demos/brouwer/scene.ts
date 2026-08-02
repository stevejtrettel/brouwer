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
import { vec2, set2, vec3 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { creaseFold, foldTaking, identityMap } from "../../src/math/maps/diskMaps.ts";
import { createDiskGrid, plDiskMap } from "../../src/math/diskGrid.ts";
import { identityLoop, mapLoop, findAllFixedPoints } from "../../src/math/proofs/brouwer.ts";
import { linkingNumber } from "../../src/math/analysis/linking.ts";
import { graphDistanceAtIndex } from "../../src/math/analysis/collisions.ts";

import { theme, roleColor } from "../../src/components/theme.ts";
import { GhostTrail } from "../../src/components/GhostTrail.ts";
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
    /** run the push synchronously with n ghost snapshots (render presets) */
    bakePushToCore(snapshots?: number): void;
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
    const sheet = plDiskMap(grid);
    const pos = sheet.positions;
    const scratch = vec2();

    function clampVertex(i: number): void {
        const r = Math.hypot(pos[2 * i]!, pos[2 * i + 1]!);
        if (r > 1) {
            pos[2 * i]! /= r;
            pos[2 * i + 1]! /= r;
        }
    }
    function grab(cx: number, cy: number, dx: number, dy: number, sigma: number): void {
        const s2 = 2 * sigma * sigma;
        for (let i = 0; i < grid.V; i++) {
            const px = pos[2 * i]!;
            const py = pos[2 * i + 1]!;
            const w = Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / s2);
            pos[2 * i] = px + w * dx;
            pos[2 * i + 1] = py + w * dy;
            clampVertex(i);
        }
    }
    function fold(fx: number, fy: number, tx: number, ty: number): void {
        const { t, angle } = foldTaking(vec2(fx, fy), vec2(tx, ty));
        const crease = creaseFold(t, angle);
        for (let i = 0; i < grid.V; i++) {
            set2(scratch, pos[2 * i]!, pos[2 * i + 1]!);
            crease.evalDisk(scratch, 0, scratch);
            pos[2 * i] = scratch.x;
            pos[2 * i + 1] = scratch.y;
            clampVertex(i);
        }
    }
    grab(0.15, 0.1, -0.7, -0.55, 0.6);
    fold(Math.cos(2.2), Math.sin(2.2), 0.15, 0.05);
    grab(-0.35, -0.25, 0.7, 0.45, 0.55);
    fold(Math.cos(-0.6), Math.sin(-0.6), -0.05, 0.1);
    grab(0.35, -0.2, -0.35, 0.7, 0.5);
    fold(Math.cos(1.0), Math.sin(1.0), -0.1, -0.05);
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

    const ghostI = new GhostTrail({ torus, source: iCurve });
    const ghostF = new GhostTrail({ torus, source: fCurve });
    torusView.scene.add(ghostI, ghostF);

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

        const events = state.push > 0 ? [] : detectCollisions(iCurve, fCurve, EPSILON);
        torusView.placeMarkers(census.degenerate ? [] : events);
        updateLandmarks();

        domain?.setRingRadius(state.r);
        imageCurve?.refit(fCurve);

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
        for (let i = 0; i < torusView.landmarks.length; i++) {
            const fp = census.fixedPoints[i];
            torusView.landmarks[i]!.visible =
                Boolean(fp) && state.push === 0 && Math.abs(state.r - fp!.r) < LANDMARK_BAND;
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
        bakePushToCore(snapshots = 7) {
            state.r = 1;
            ghostI.reset();
            ghostF.reset();
            for (let k = 0; k < snapshots; k++) {
                state.push = k / (snapshots - 1);
                refresh();
                if (k < snapshots - 1) ghostF.snapshot();
            }
        },
        hooks: {},
    };

    app.views.resize(window.innerWidth, window.innerHeight);
    refresh();
    app.start();
    return scene;
}
