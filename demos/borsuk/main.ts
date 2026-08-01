/**
 * Borsuk–Ulam theorem — assembled explicitly from components (no ProofDemo,
 * no ProofModel).
 *
 * f: S² → D² graphed along a latitude φ together with its antipodal companion
 * f̄(x) = f(−x). Near the pole the two graphs are parallel unlinked loops
 * (twist 0); at the equator f̄ is the half-turn shift of f and the twist is
 * forced odd. Slide φ and watch the curves cross — that collision is the
 * antipodal pair f(x) = f(−x).
 *
 *   - torus view (left): the two graph curves as tubes, a sweepable meridian
 *     fiber, and gold markers where they collide;
 *   - slice inspector (right): the fiber disk {θ} × D² with the two curve
 *     points and the segment joining them (the difference f − f̄).
 */

import { Color, OrthographicCamera, Scene } from "three";
import GUI from "lil-gui";

import { App } from "../../src/app/App.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import type { GraphCurve } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { offsetProjection } from "../../src/math/maps/sphereMaps.ts";
import {
    latitudeGraphLoop,
    antipodalGraphLoop,
    findAntipodalPair,
} from "../../src/math/proofs/borsukUlam.ts";
import { graphDistanceAtIndex } from "../../src/math/analysis/collisions.ts";
import { relativeWinding } from "../../src/math/analysis/winding.ts";
import { linkingNumber } from "../../src/math/analysis/linking.ts";

import { theme } from "../../src/components/theme.ts";
import { SliceDisk } from "../../src/components/SliceDisk.ts";
import { createTorusView } from "../../src/views/TorusView.ts";

const N = 512;
const EPSILON = 0.03;

const f = offsetProjection(0.35, 0.1, 0.15);

// ---------------------------------------------------------------- app + state
const app = new App();
const torus = new SolidTorus();

const query = new URLSearchParams(window.location.search);
const phiParam = query.get("phi") ?? query.get("s"); // ?phi= or generic ?s=
const thetaParam = query.get("theta");
const state = {
    phi: phiParam !== null && Number.isFinite(Number(phiParam)) ? Number(phiParam) : Math.PI / 2,
    theta: thetaParam !== null && Number.isFinite(Number(thetaParam)) ? Number(thetaParam) : 0,
};

// ---------------------------------------------------------------- torus view
// two curves: the latitude graph f and its antipodal companion f̄
const fCurve = createGraphCurve(N, "map", "f");
const fbarCurve = createGraphCurve(N, "antipodal-map", "f̄");
const torusView = createTorusView({
    app,
    torus,
    curves: [fCurve, fbarCurve],
    rect: { x: 0, y: 0, w: 0.72, h: 1 },
    markers: 8,
});

// ---------------------------------------------------------------- slice inspector
const sliceScene = new Scene();
sliceScene.background = new Color(theme.sliceBackground);
const slice = new SliceDisk();
sliceScene.add(slice);
const sliceCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
sliceCamera.position.z = 5;
app.views.add({
    name: "slice",
    scene: sliceScene,
    camera: sliceCamera,
    rect: { x: 0.72, y: 0, w: 0.28, h: 1 },
    orthoHalfHeight: 1.2,
});

// ---------------------------------------------------------------- overlay
const { status, caption } = buildOverlay("Borsuk–Ulam theorem");

// ---------------------------------------------------------------- refresh
const readout = { "min |f−f̄|": "", twist: "" };

/** Recompute everything downstream of the latitude φ. */
function refresh(): void {
    refillGraphCurve(fCurve, latitudeGraphLoop(f, state.phi).loop);
    refillGraphCurve(fbarCurve, antipodalGraphLoop(f, state.phi).loop);
    torusView.refit();

    const events = detectCollisions(fCurve, fbarCurve, EPSILON);
    torusView.placeMarkers(events);

    const twist = relativeWinding(fCurve, fbarCurve);
    readout["min |f−f̄|"] = minDistance(fCurve, fbarCurve).toFixed(3);
    readout.twist = twist.toFixed(2);

    const link = linkingNumber(fCurve, fbarCurve);
    if (link.lk === null) {
        status.textContent = `curves touch — antipodal pair! (min |f − f̄| = ${link.separation.toFixed(3)})`;
        status.className = "status touching";
    } else if (link.lk === 0) {
        status.textContent = "unlinked · twist = 0";
        status.className = "status";
    } else {
        status.textContent = `linked · twist = ${link.lk}`;
        status.className = "status linked";
    }
    caption.textContent = events.length
        ? events.map((e) => `antipodal pair @ θ ≈ ${e.theta.toFixed(2)}`).join("   ·   ")
        : "";

    updateSlice();
}

interface Collision {
    index: number;
    theta: number;
    x: number;
    y: number;
}

/** Local minima of |f − f̄| below ε — one per antipodal pair on this circle. */
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

/** Slice-only update (θ slider) — no curve recomputation. */
function updateSlice(): void {
    const index = Math.round((state.theta / (2 * Math.PI)) * N) % N;
    torusView.setMeridianTheta(state.theta);
    slice.updateSlice([fCurve, fbarCurve], index);
    const events = detectCollisions(fCurve, fbarCurve, EPSILON);
    const near = events.find((e) => angularIndexDistance(e.index, index, N) < N / 64);
    slice.showEvent(near ? { x: near.x, y: near.y } : null);
}

function angularIndexDistance(a: number, b: number, n: number): number {
    const d = Math.abs(a - b) % n;
    return Math.min(d, n - d);
}

// ---------------------------------------------------------------- controls
const gui = new GUI({ title: "controls" });
const phiCtrl = gui.add(state, "phi", 0.02, Math.PI / 2, Math.PI / 1000).name("φ").onChange(refresh);
const thetaCtrl = gui.add(state, "theta", 0, 2 * Math.PI, 0.01).name("slice θ").onChange(updateSlice);

const folder = gui.addFolder("map f = offset projection");
folder.add(f.params, "c", -1, 1, 0.01).name("pole offset c").onChange(refresh);
folder.add(f.params, "bx", -0.5, 0.5, 0.01).name("value shift x").onChange(refresh);
folder.add(f.params, "by", -0.5, 0.5, 0.01).name("value shift y").onChange(refresh);

gui.add(
    {
        find: () => {
            const pair = findAntipodalPair(f);
            if (!pair.found) {
                caption.textContent = "finder did not converge — degenerate map?";
                return;
            }
            state.phi = Math.min(Math.PI / 2, Math.max(0.02, pair.phi));
            state.theta = ((pair.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            phiCtrl.updateDisplay();
            thetaCtrl.updateDisplay();
            refresh();
            caption.textContent =
                `antipodal pair at x = (${pair.x.x.toFixed(3)}, ${pair.x.y.toFixed(3)}, ${pair.x.z.toFixed(3)})` +
                `  ·  f(x) = f(−x) = (${pair.value.x.toFixed(3)}, ${pair.value.y.toFixed(3)})` +
                `  ·  |f(x) − f(−x)| = ${pair.residual.toExponential(1)}`;
        },
    },
    "find",
).name("⊚ find antipodal pair");

const meters = gui.addFolder("meters");
for (const key of Object.keys(readout) as (keyof typeof readout)[]) {
    meters.add(readout, key).listen().disable();
}
gui.add({ png: () => app.exportPNG("borsuk") }, "png").name("save PNG");

// ---------------------------------------------------------------- go
app.views.resize(window.innerWidth, window.innerHeight);
refresh();
app.start();

// ---------------------------------------------------------------- overlay dom
function buildOverlay(title: string): { status: HTMLElement; caption: HTMLElement } {
    const style = document.createElement("style");
    style.textContent = `
        html, body { margin: 0; padding: 0; overflow: hidden; }
        .proof-overlay {
            position: fixed; left: 16px; bottom: 14px; z-index: 10;
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            color: #33313b; pointer-events: none; user-select: none;
        }
        .proof-overlay h1 { font-size: 18px; margin: 0 0 2px 0; font-weight: 700; }
        .proof-overlay .status { font-size: 15px; font-weight: 700; color: #6b7a99; min-height: 19px; }
        .proof-overlay .status.linked { color: #2f6de1; }
        .proof-overlay .status.touching { color: #b8860b; }
        .proof-overlay .caption { font-size: 14px; color: #b8860b; min-height: 18px; }
        .lil-gui.autoPlace { right: auto; left: 8px; top: 8px; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.className = "proof-overlay";
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const status = document.createElement("div");
    status.className = "status";
    const caption = document.createElement("div");
    caption.className = "caption";
    overlay.append(h1, status, caption);
    document.body.appendChild(overlay);
    return { status, caption };
}
