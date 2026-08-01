/**
 * Poincaré / hairy-ball theorem — assembled explicitly from components (no
 * ProofDemo, no ProofModel).
 *
 * A tangent field v on S² restricted to a latitude loop γ_φ becomes a
 * disk-valued loop via the moving frame; the graph curve crosses the core
 * exactly where v vanishes on γ. As φ sweeps 0 → π the loops sweep the sphere
 * and the winding must go +1 → −1, so the graph is forced across the core —
 * a zero of the field, which no field can avoid (Σ index = χ(S²) = 2).
 *
 *   - torus view (left): the graph curve as a tube, a sweepable meridian
 *     fiber, and gold markers where it crosses the core;
 *   - slice inspector (right): the fiber disk {θ} × D² with the curve point
 *     and the core at the center.
 */

import { Color, OrthographicCamera, Scene } from "three";
import GUI from "lil-gui";

import { App } from "../../src/app/App.ts";
import { SolidTorus } from "../../src/math/torus.ts";
import type { GraphCurve } from "../../src/math/types.ts";
import { vec2 } from "../../src/math/types.ts";
import { createGraphCurve, refillGraphCurve } from "../../src/math/graphCurve.ts";
import { projectedConstantField } from "../../src/math/maps/tangentFields.ts";
import { latitudeLoop, tangentGraphLoop } from "../../src/math/frames.ts";
import { coreDistanceAtIndex } from "../../src/math/analysis/collisions.ts";
import { windingNumber } from "../../src/math/analysis/winding.ts";
import { findSphereFieldZeros } from "../../src/math/analysis/sphereFieldZeros.ts";
import type { SphereCensus } from "../../src/math/analysis/sphereFieldZeros.ts";

import { theme } from "../../src/components/theme.ts";
import { SliceDisk } from "../../src/components/SliceDisk.ts";
import { createTorusView } from "../../src/views/TorusView.ts";

const N = 512;
const EPSILON = 0.05;

const v = projectedConstantField(1, 0, 0);

// the field-zero census depends only on v (not the loop parameter), so cache
// it and recompute only when the field's params actually change
let censusKey = "";
let census: SphereCensus = findSphereFieldZeros(v);
function getCensus(): SphereCensus {
    const key = JSON.stringify(v.params);
    if (key !== censusKey) {
        census = findSphereFieldZeros(v);
        censusKey = key;
    }
    return census;
}

// ---------------------------------------------------------------- app + state
const app = new App();
const torus = new SolidTorus();

const query = new URLSearchParams(window.location.search);
const phiParam = query.get("phi") ?? query.get("s"); // ?phi= or generic ?s=
const thetaParam = query.get("theta");
const state = {
    phi: phiParam !== null && Number.isFinite(Number(phiParam)) ? Number(phiParam) : 0.4,
    theta: thetaParam !== null && Number.isFinite(Number(thetaParam)) ? Number(thetaParam) : 0,
};

// ---------------------------------------------------------------- torus view
const gCurve = createGraphCurve(N, "vector-field", "v∘γ");
const torusView = createTorusView({
    app,
    torus,
    curves: [gCurve],
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
const { status, caption } = buildOverlay("Poincaré / hairy-ball theorem");

// ---------------------------------------------------------------- refresh
const readout = { "min |v|": "", winding: "", "zeros of v": "", "Σ index": "" };

/** Recompute everything downstream of the latitude φ (or the field). */
function refresh(): void {
    refillGraphCurve(gCurve, tangentGraphLoop(v, latitudeLoop(state.phi)));
    torusView.refit();

    const events = detectCrossings(gCurve, EPSILON);
    torusView.placeMarkers(events);

    const w = windingNumber(gCurve);
    const { zeros, indexSum } = getCensus();
    readout["min |v|"] = minCoreDistance(gCurve).toFixed(3);
    readout.winding = w.toFixed(2);
    readout["zeros of v"] = String(zeros.length);
    readout["Σ index"] =
        indexSum === null
            ? "—"
            : indexSum === 2
              ? "2 = χ(S²) ✓"
              : `${indexSum} ✗ (should be 2)`;

    const min = minCoreDistance(gCurve);
    if (min < EPSILON) {
        status.textContent = `graph crosses the core — zero of the field! (min |v| = ${min.toFixed(3)})`;
        status.className = "status touching";
    } else {
        status.textContent = `winding ${w.toFixed(2)} · no crossing yet`;
        status.className = "status linked";
    }
    caption.textContent = events.length
        ? events.map((e) => `zero of v @ θ ≈ ${e.theta.toFixed(2)}`).join("   ·   ")
        : "";

    updateSlice();
}

interface Crossing {
    index: number;
    theta: number;
    x: number;
    y: number;
}

/** Local minima of |v| (distance to the core) below ε. */
function detectCrossings(g: GraphCurve, epsilon: number): Crossing[] {
    const events: Crossing[] = [];
    for (let i = 0; i < g.N; i++) {
        const d = coreDistanceAtIndex(g, i);
        if (d >= epsilon) continue;
        const prev = coreDistanceAtIndex(g, (i + g.N - 1) % g.N);
        const next = coreDistanceAtIndex(g, (i + 1) % g.N);
        if (d <= prev && d <= next) {
            events.push({
                index: i,
                theta: g.theta[i]!,
                x: g.disk[2 * i]!,
                y: g.disk[2 * i + 1]!,
            });
        }
    }
    return events;
}

function minCoreDistance(g: GraphCurve): number {
    let min = Infinity;
    for (let i = 0; i < g.N; i++) min = Math.min(min, coreDistanceAtIndex(g, i));
    return min;
}

/** Slice-only update (θ slider) — no curve recomputation. */
function updateSlice(): void {
    const index = Math.round((state.theta / (2 * Math.PI)) * N) % N;
    torusView.setMeridianTheta(state.theta);
    slice.updateSlice([gCurve], index);
    const events = detectCrossings(gCurve, EPSILON);
    const near = events.find((e) => angularIndexDistance(e.index, index, N) < N / 64);
    slice.showEvent(near ? vec2(near.x, near.y) : null);
}

function angularIndexDistance(a: number, b: number, n: number): number {
    const d = Math.abs(a - b) % n;
    return Math.min(d, n - d);
}

// ---------------------------------------------------------------- controls
const gui = new GUI({ title: "controls" });
gui.add(state, "phi", 0.05, Math.PI - 0.05, (Math.PI - 0.1) / 500).name("φ").onChange(refresh);
gui.add(state, "theta", 0, 2 * Math.PI, 0.01).name("slice θ").onChange(updateSlice);

const folder = gui.addFolder("field v = a − ⟨a,x⟩x");
folder.add(v.params, "ax", -1, 1, 0.01).name("a·x̂").onChange(refresh);
folder.add(v.params, "ay", -1, 1, 0.01).name("a·ŷ").onChange(refresh);
folder.add(v.params, "az", -1, 1, 0.01).name("a·ẑ").onChange(refresh);

const meters = gui.addFolder("meters");
for (const key of Object.keys(readout) as (keyof typeof readout)[]) {
    meters.add(readout, key).listen().disable();
}
gui.add({ png: () => app.exportPNG("poincare") }, "png").name("save PNG");

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
