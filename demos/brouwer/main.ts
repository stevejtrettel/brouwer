/**
 * Brouwer fixed point theorem — composed from the shared view modules
 * (TorusView, DiskView) plus the SheetSculptor editing machinery:
 *
 *   - domain panel (top left): the textured disk D², the circle S_r, and
 *     every fixed point marked (gold nodes, violet saddles);
 *   - image panel (bottom left): the CRUMPLED DOMAIN f(D²), EDITABLE — grab the
 *     cloth and pull, drag a coral rim dot to fold; self-overlap composites
 *     darker, folded-over regions tint; the blue curve is f(S_r);
 *   - torus view (right, 2/3 of the screen): Γ_i, Γ_f as tubes, gold event
 *     markers where the curves collide, and dots at each fixed point of f
 *     (shown only as S_r nears them).
 *
 * Chrome is deliberately minimal (no lil-gui): the r slider on the right walks
 * the concentric circles S_r; the reset button on the left restores the baked
 * start. Editing f recomputes the fixed-point census on release.
 */

import { App } from "../../src/app/App.ts";
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
import { makeDiskTexture } from "../../src/components/diskTexture.ts";
import { DiskCurve2D } from "../../src/components/panel2d.ts";
import { attachSheetSculptor } from "../../src/components/SheetSculptor.ts";
import { createTorusView } from "../../src/views/TorusView.ts";
import { createDiskView } from "../../src/views/DiskView.ts";

const SADDLE_COLOR = 0x8d4fd3; // violet for index −1; theme.marker gold otherwise
const N = 512; // samples per graph curve
const EPSILON = 0.03; // collision threshold for event markers
// only reveal a torus fixed-point dot when the circle S_r is within this band
// of the fixed point's radius — i.e. when the graph curves are near/on it
const LANDMARK_BAND = 0.06;

// ---------------------------------------------------------------- the map
// f is a whole sculpting session on the PL sheet — the exact gestures of the
// disk playground, scripted and baked into the mesh so the demo runs a
// genuinely crumpled map (not a tidy analytic one):
//
//   · GRAB — an image-space Gaussian pull; the brush is measured against
//            CURRENT positions, so every layer stacked under it (folded flaps
//            included) moves together, like dragging the cloth.
//   · FOLD — a crease = perpendicular bisector of a rim drag (foldTaking),
//            baked in; the far flap reflects inward and self-overlaps.
//
// Three big grabs + three deep folds → ~⅓ of the image folded over. Since the
// sheet stays inside the convex disk vertex-by-vertex, f is disk-valued for
// free, and Σ index = 1 no matter how violent the crumple.
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

/** image-space grab: pull the sheet near (cx, cy) by (dx, dy), Gaussian σ. */
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

/** fold: crease = perpendicular bisector of the drag [from → to], baked in. */
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

// the demo OPENS on the baked crumple, but the reset button clears the sheet
// all the way back to the identity map (flat D²) — a blank slate to sculpt from
const identityPositions = new Float32Array(grid.domain);

// f is now EDITABLE (sculpt on the image panel), so its fixed-point census is
// recomputed on every commit. minDepth 4: sculpted folds put ±1 pairs close to
// their creases.
let census = findAllFixedPoints(f, 0, { minDepth: 4 });

// ---------------------------------------------------------------- app + state
const app = new App();
const torus = new SolidTorus();

// shareable preset: ?r=0.95 (or generic ?s=) overrides the default radius
const query = new URLSearchParams(window.location.search);
const rParam = query.get("r") ?? query.get("s");
const state = {
    r: rParam !== null && Number.isFinite(Number(rParam)) ? Math.min(1, Math.max(0.02, Number(rParam))) : 0.6,
};

// ---------------------------------------------------------------- torus view
// torus at right; the two big editable disks own the left column
const iCurve = createGraphCurve(N, "identity", "i_r");
const fCurve = createGraphCurve(N, "map", "f_r");
const torusView = createTorusView({
    app,
    torus,
    curves: [iCurve, fCurve],
    rect: { x: 1 / 3, y: 0, w: 2 / 3, h: 1 },
    markers: 8,
    landmarks: 12,
    meridian: false, // no fiber disk — the r slider is the only navigation
});

// ---------------------------------------------------------------- 2D panels
// the two disks are the star of the show — a big left column
const texture = makeDiskTexture();

// domain (bottom-left): flat textured disk + circle S_r + fixed-point dots
const domain = createDiskView({
    app,
    name: "domain",
    rect: { x: 0, y: 0, w: 1 / 3, h: 0.5 },
    texture,
    ring: true,
    dots: 12,
});
domain.disk.refit(identityMap());

// image (top-left): the crumpled domain f(D²) — EDITABLE. Grab the cloth and
// pull, drag a coral rim dot to fold; the map, curves, and census all follow.
const image = createDiskView({
    app,
    name: "image",
    rect: { x: 0, y: 0.5, w: 1 / 3, h: 0.5 },
    texture,
    grid,
    opacity: 0.85,
    backdrop: true,
});
image.disk.setPositions(sheet.positions);
// black outline of the crumpled sheet — the image of the boundary circle
// f(∂D²); the fold grips (rim vertices) ride on it. Follows every edit.
const boundaryCurve = createGraphCurve(N, "map", "∂D²");
const imageBorder = new DiskCurve2D(boundaryCurve, theme.roles.core, 0.012);
imageBorder.position.z = 0.02;
image.scene.add(imageBorder);
function updateBorder(): void {
    refillGraphCurve(boundaryCurve, mapLoop(f, 1).loop);
    imageBorder.refit(boundaryCurve);
}
updateBorder();
// the blue curve f(S_r) for the current radius
const imageCurve = new DiskCurve2D(fCurve, roleColor("map"));
imageCurve.position.z = 0.04;
image.scene.add(imageCurve);

// place the fixed-point dots from the census — on the domain panel and on the
// torus (same disk coordinates, since f(x*) = x*). Recomputed on every edit.
const markerPos = vec3();
function placeFixedPoints(): void {
    const specs = census.fixedPoints.slice(0, 12).map((fp) => ({
        x: fp.x.x,
        y: fp.x.y,
        color: fp.index === -1 ? SADDLE_COLOR : theme.marker,
    }));
    domain.setDots(specs);
    // torus landmark dots: position + color here, visibility gated per-r below
    for (let i = 0; i < torusView.landmarks.length; i++) {
        const fp = census.fixedPoints[i];
        if (!fp) continue;
        const dot = torusView.landmarks[i]!;
        dot.setColor(fp.index === -1 ? SADDLE_COLOR : theme.marker);
        torusView.embed(fp.theta, fp.x.x, fp.x.y, markerPos);
        dot.position.set(markerPos.x, markerPos.y, markerPos.z);
    }
}
placeFixedPoints();

// ---------------------------------------------------------------- overlay
const { status, caption } = buildOverlay("Brouwer fixed point theorem");
for (const [text, top] of [
    ["image f(D²) — grab & fold to sculpt", "6px"],
    ["domain D²", "calc(50% + 6px)"],
] as const) {
    const label = document.createElement("div");
    label.className = "panel-label";
    label.style.top = top;
    label.textContent = text;
    document.body.appendChild(label);
}

// ---------------------------------------------------------------- refresh
const readout = {
    "min |f−i|": "",
    Lk: "",
    "fixed points": census.degenerate ? "∞ (f ≈ id on a region)" : String(census.fixedPoints.length),
    "Σ index":
        census.indexSum === null
            ? "—"
            : census.indexSum === 1
              ? "1 = L(f) ✓"
              : `${census.indexSum} ✗ (should be 1)`,
};

/** Recompute everything downstream of the radius r. */
function refresh(): void {
    refillGraphCurve(iCurve, identityLoop(state.r).loop);
    refillGraphCurve(fCurve, mapLoop(f, state.r).loop);
    torusView.refit();

    const events = detectCollisions(iCurve, fCurve, EPSILON);
    torusView.placeMarkers(census.degenerate ? [] : events);
    updateLandmarks();

    domain.setRingRadius(state.r);
    imageCurve.refit(fCurve);

    const link = linkingNumber(fCurve, iCurve);
    readout["min |f−i|"] = minDistance(iCurve, fCurve).toFixed(3);
    readout.Lk = link.lk === null ? "—" : String(link.lk);

    if (census.degenerate) {
        // identity-like: the displacement vanishes on a region, so every point
        // is a fixed point — don't spew the whole sample grid into the caption
        status.textContent = "f = identity — every point is a fixed point";
        status.className = "status touching";
        caption.textContent = "";
    } else {
        if (link.lk === null) {
            status.textContent = `curves touch — fixed point! (min |f − i| = ${link.separation.toFixed(3)})`;
            status.className = "status touching";
        } else if (link.lk === 0) {
            status.textContent = "unlinked · Lk = 0";
            status.className = "status";
        } else {
            status.textContent = `linked · Lk = ${link.lk}`;
            status.className = "status linked";
        }
        const shown = events
            .slice(0, 6)
            .map((e) => `fixed point @ θ ≈ ${e.theta.toFixed(2)}`)
            .join("   ·   ");
        caption.textContent = events.length > 6 ? `${shown}   ·   +${events.length - 6} more` : shown;
    }
}

interface Collision {
    theta: number;
    x: number;
    y: number;
}

/** Local minima of |f − i| below ε — one per fixed point on this circle. */
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

/** Reveal each torus fixed-point dot only when S_r nears its radius, so the
 *  landmark appears as the graph curves close in on it rather than floating
 *  on the torus at all times. */
function updateLandmarks(): void {
    for (let i = 0; i < torusView.landmarks.length; i++) {
        const fp = census.fixedPoints[i];
        torusView.landmarks[i]!.visible = Boolean(fp) && Math.abs(state.r - fp!.r) < LANDMARK_BAND;
    }
}

/** Recompute the fixed-point census after an edit and refresh everything that
 *  depends on it (meters, domain dots, torus landmarks). */
function recomputeCensus(): void {
    census = findAllFixedPoints(f, 0, { minDepth: 4 });
    readout["fixed points"] = census.degenerate
        ? "∞ (f ≈ id on a region)"
        : String(census.fixedPoints.length);
    readout["Σ index"] =
        census.indexSum === null
            ? "—"
            : census.indexSum === 1
              ? "1 = L(f) ✓"
              : `${census.indexSum} ✗ (should be 1)`;
    placeFixedPoints();
}

function minDistance(gi: GraphCurve, gf: GraphCurve): number {
    let min = Infinity;
    for (let i = 0; i < Math.min(gi.N, gf.N); i++) {
        min = Math.min(min, graphDistanceAtIndex(gi, gf, i));
    }
    return min;
}

// ---------------------------------------------------------------- editing
// make f editable exactly like the disk playground: grab the crumpled cloth,
// drag a coral rim dot to fold. Edits mutate the sheet in place; the curves +
// crumple redraw live, and the fixed-point census recomputes on release.
const sculptor = attachSheetSculptor({
    app,
    viewport: image.viewport,
    scene: image.scene,
    grid,
    sheet,
    gripColor: theme.roles.core, // black fold-grips, quieter than coral
    gripRadius: 0.022,
    onEdit: () => {
        image.disk.setPositions(sheet.positions);
        updateBorder();
        refresh();
    },
    onCommit: () => {
        recomputeCensus();
        refresh();
    },
});

// ---------------------------------------------------------------- controls
// Minimal, unobtrusive chrome (no lil-gui): the r slider on the right walks the
// concentric circles S_r through domain, image, and torus; the reset button on
// the left restores the baked start after the cloth has been messed up. A
// proper custom UI toolkit comes later — this is the deliberate first cut.
buildControls();

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
            position: fixed; left: calc(33% + 16px); bottom: 14px; z-index: 10;
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            color: #33313b; pointer-events: none; user-select: none;
        }
        .proof-overlay h1 { font-size: 18px; margin: 0 0 2px 0; font-weight: 700; }
        .proof-overlay .status { font-size: 15px; font-weight: 700; color: #6b7a99; min-height: 19px; }
        .proof-overlay .status.linked { color: #2f6de1; }
        .proof-overlay .status.touching { color: #b8860b; }
        .proof-overlay .caption { font-size: 13px; color: #b8860b; min-height: 18px; max-width: 50%; }
        .panel-label {
            position: fixed; left: 12px; z-index: 5;
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            font-size: 12px; font-weight: 600; color: #6b7a99;
            pointer-events: none; user-select: none;
        }
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

// Minimal hand-rolled controls: a reset button (left) and the r slider (right).
function buildControls(): void {
    const style = document.createElement("style");
    style.textContent = `
        .brouwer-reset {
            position: fixed; left: 18px; bottom: 18px; z-index: 20;
            font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            font-size: 14px; font-weight: 600; color: #33313b;
            background: rgba(255, 255, 255, 0.85); border: 1px solid #d8d3c8;
            border-radius: 999px; padding: 9px 18px; cursor: pointer;
            box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1); user-select: none;
        }
        .brouwer-reset:hover { background: #fff; }
        .brouwer-r {
            position: fixed; right: 22px; top: 50%; transform: translateY(-50%);
            z-index: 20; display: flex; flex-direction: column; align-items: center;
            gap: 10px; font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
            color: #6b7a99; user-select: none;
        }
        .brouwer-r .r-val { font-size: 14px; font-weight: 700; color: #33313b; }
        .brouwer-r .r-lbl { font-size: 12px; font-weight: 600; }
        .brouwer-r input {
            -webkit-appearance: none; appearance: none;
            writing-mode: vertical-lr; direction: rtl;
            width: 6px; height: 300px; border-radius: 999px;
            background: #d8d3c8; outline: none; cursor: pointer; margin: 0;
        }
        .brouwer-r input::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 20px; height: 20px; border-radius: 50%;
            background: #e4572e; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
        }
        .brouwer-r input::-moz-range-thumb {
            width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff; background: #e4572e;
        }
    `;
    document.head.appendChild(style);

    const reset = document.createElement("button");
    reset.className = "brouwer-reset";
    reset.textContent = "↺ reset";
    reset.addEventListener("click", () => sculptor.reset(identityPositions));
    document.body.appendChild(reset);

    const box = document.createElement("div");
    box.className = "brouwer-r";
    const val = document.createElement("div");
    val.className = "r-val";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0.02";
    slider.max = "1";
    slider.step = "0.002";
    slider.value = String(state.r);
    const lbl = document.createElement("div");
    lbl.className = "r-lbl";
    lbl.textContent = "radius r";
    box.append(val, slider, lbl);
    document.body.appendChild(box);

    const show = (): void => {
        val.textContent = state.r.toFixed(2);
    };
    slider.addEventListener("input", () => {
        state.r = Number(slider.value);
        show();
        refresh();
    });
    show();
}
