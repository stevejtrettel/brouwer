/**
 * Disk map playground — sculpt a map f: D² → D² like a piece of cloth and
 * watch every invariant respond.
 *
 * The map IS the mesh: a piecewise-linear map whose state is the image
 * position of every grid vertex (plDiskMap). That makes the interactions
 * honest:
 *
 *   - GRAB THE SHEET ANYWHERE and pull. The brush lives in IMAGE space, so
 *     every layer stacked under it — folded flaps included — moves
 *     together, with Gaussian falloff (brush size σ);
 *   - drag a CORAL rim dot to FOLD: the crease (perpendicular bisector of
 *     the drag) is baked into the vertex positions on release;
 *   - undo restores a position snapshot; the post-transform sliders
 *     shrink/move the whole picture inside D².
 *
 * Folded-over regions render tinted, overlaps composite darker, and the
 * meters keep the books: fold fraction, fixed points (gold +1, violet
 * saddles), and the Lefschetz sum — 1 no matter what. That IS Brouwer.
 */

import { Color, OrthographicCamera, Scene } from "three";
import GUI from "lil-gui";

import { App } from "../../src/app/App.ts";
import type { Viewport } from "../../src/app/ViewManager.ts";
import type { Vec2 } from "../../src/math/types.ts";
import { vec2, set2 } from "../../src/math/types.ts";
import type { DiskMap } from "../../src/math/maps/diskMaps.ts";
import { creaseFold, foldTaking, similarityMap, identityMap } from "../../src/math/maps/diskMaps.ts";
import {
    createDiskGrid,
    plDiskMap,
    orientationCounts,
    buildNeighborhoods,
    smoothDisplacements,
    buildSpringEdges,
    relaxSprings,
} from "../../src/math/diskGrid.ts";
import { findAllFixedPoints } from "../../src/math/proofs/brouwer.ts";

import { theme } from "../../src/components/theme.ts";
import { makeDiskTexture } from "../../src/components/diskTexture.ts";
import { PushforwardDisk } from "../../src/components/PushforwardDisk.ts";
import { makeDiskBackdrop, DiskDot } from "../../src/components/panel2d.ts";

// ---- the map: post similarity ∘ PL sheet ----

const grid = createDiskGrid(64, 128);
const sheet = plDiskMap(grid);
const hood = buildNeighborhoods(grid);
const springs = buildSpringEdges(grid);
const smoothScratch = new Float32Array(2 * grid.V);
const post = similarityMap(1, 0, 0);
const brush = { sigma: 0.3, smoothing: 0.35, springback: 0.4 };

const f: DiskMap = {
    id: "hand-sculpted",
    name: "hand-sculpted",
    params: {},
    evalDisk: (x, time, out) => {
        sheet.evalDisk(x, time, out);
        return post.evalDisk(out, time, out);
    },
};

/** invert the post similarity (drags happen in final coordinates). */
function postInverse(p: Vec2, out: Vec2): void {
    set2(out, (p.x - post.params.cx!) / post.params.s!, (p.y - post.params.cy!) / post.params.s!);
}

// rim fold-grips: 12 boundary vertices of the grid
const gripVertices: number[] = [];
for (let i = 0; i < 12; i++) {
    gripVertices.push(1 + (grid.rings - 1) * grid.sectors + i * (grid.sectors / 12));
}

// ---- panels ----

const app = new App();
const texture = makeDiskTexture();

function makePanel(name: string, x: number): { scene: Scene; viewport: Viewport } {
    const scene = new Scene();
    scene.background = new Color(theme.sliceBackground);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;
    const viewport = app.views.add({
        name,
        scene,
        camera,
        rect: { x, y: 0, w: 0.5, h: 1 },
        orthoHalfHeight: 1.15,
    });
    return { scene, viewport };
}

const domain = makePanel("domain", 0);
const domainDisk = new PushforwardDisk({ texture });
domainDisk.refit(identityMap());
domain.scene.add(domainDisk);

const image = makePanel("image", 0.5);
image.scene.add(makeDiskBackdrop());
const crumple = new PushforwardDisk({ texture, grid, opacity: 0.85 });
crumple.position.z = 0.01;
image.scene.add(crumple);

// rim grips: coral, marked on both panels
for (const v of gripVertices) {
    const dot = new DiskDot(0.022);
    dot.setColor(theme.roles.identity);
    dot.position.set(grid.domain[2 * v]!, grid.domain[2 * v + 1]!, 0.02);
    dot.visible = true;
    domain.scene.add(dot);
}
const rimDots = gripVertices.map(() => {
    const dot = new DiskDot(0.042);
    dot.setColor(theme.roles.identity);
    dot.position.z = 0.05;
    dot.visible = true;
    image.scene.add(dot);
    return dot;
});
// gold feedback dot at the pinch while dragging
const pinchDot = new DiskDot(0.045);
pinchDot.position.z = 0.06;
image.scene.add(pinchDot);
// fixed points marked in BOTH panels: f(x*) = x*, so the dot sits at the
// same coordinates on the domain and on the crumpled image
const fixedPointDots: DiskDot[] = [];
const fixedPointDomainDots: DiskDot[] = [];
for (let i = 0; i < 12; i++) {
    const dot = new DiskDot(0.035);
    dot.position.z = 0.03;
    fixedPointDots.push(dot);
    image.scene.add(dot);
    const domainDot = new DiskDot(0.035);
    domainDot.position.z = 0.03;
    fixedPointDomainDots.push(domainDot);
    domain.scene.add(domainDot);
}

// ---- refresh: cheap every drag frame, census on release ----

const displayPositions = new Float32Array(2 * grid.V);
const readout = { edits: "0", folds: "none", "fixed points": "…", "Σ index": "…" };
const evalScratch = vec2();

function refresh(): void {
    // display = post ∘ sheet, applied to every vertex
    for (let i = 0; i < grid.V; i++) {
        set2(evalScratch, sheet.positions[2 * i]!, sheet.positions[2 * i + 1]!);
        post.evalDisk(evalScratch, 0, evalScratch);
        displayPositions[2 * i] = evalScratch.x;
        displayPositions[2 * i + 1] = evalScratch.y;
    }
    crumple.setPositions(displayPositions);
    for (let g = 0; g < gripVertices.length; g++) {
        const v = gripVertices[g]!;
        rimDots[g]!.position.x = displayPositions[2 * v]!;
        rimDots[g]!.position.y = displayPositions[2 * v + 1]!;
    }
    const folds = orientationCounts(grid, sheet.positions);
    readout.folds =
        folds.reversing === 0 ? "none" : `${(100 * folds.foldFraction).toFixed(0)}% reversed`;
    readout.edits = String(undoStack.length);
}

function census(): void {
    // minDepth 4: resolve gold/violet pairs down to ~0.13 apart — sculpted
    // folds put fixed-point pairs close to their creases
    const { fixedPoints, indexSum, degenerate } = findAllFixedPoints(f, 0, { minDepth: 4 });
    readout["fixed points"] = degenerate ? "∞ (f ≈ id on a region)" : String(fixedPoints.length);
    readout["Σ index"] =
        indexSum === null ? "—" : indexSum === 1 ? "1 = L(f) ✓" : `${indexSum} ✗ (should be 1)`;
    for (let i = 0; i < fixedPointDots.length; i++) {
        const fp = fixedPoints[i];
        for (const dot of [fixedPointDots[i]!, fixedPointDomainDots[i]!]) {
            dot.visible = Boolean(fp);
            if (fp) {
                dot.setColor(fp.index === -1 ? 0x8d4fd3 : theme.marker);
                dot.position.x = fp.x.x;
                dot.position.y = fp.x.y;
            }
        }
    }
}

// ---- editing: image-space brush + baked folds, snapshot undo ----

const undoStack: Float32Array[] = [];
const MAX_UNDO = 60;

function beginAction(): void {
    undoStack.push(sheet.snapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
}

type Drag =
    | { kind: "grab"; weights: Float32Array; affected: number[]; last: Vec2 }
    | { kind: "fold"; grip: number; origin: Vec2 };
let drag: Drag | null = null;

const pointer = vec2();
const prePointer = vec2();

function pointerWorld(e: PointerEvent): boolean {
    return app.views.pointerToWorld(
        image.viewport,
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
        pointer,
    );
}

const canvas = app.renderer.domElement;
canvas.addEventListener("pointerdown", (e) => {
    if (!pointerWorld(e)) return;
    drag = null;

    // rim grips take priority when clicked directly
    let bestRim = 0.12;
    for (let g = 0; g < rimDots.length; g++) {
        const d = Math.hypot(rimDots[g]!.position.x - pointer.x, rimDots[g]!.position.y - pointer.y);
        if (d < bestRim) {
            bestRim = d;
            drag = { kind: "fold", grip: g, origin: vec2() };
        }
    }

    if (drag) {
        const v = gripVertices[(drag as Extract<Drag, { kind: "fold" }>).grip]!;
        set2(
            (drag as Extract<Drag, { kind: "fold" }>).origin,
            sheet.positions[2 * v]!,
            sheet.positions[2 * v + 1]!,
        );
        rimDots[(drag as Extract<Drag, { kind: "fold" }>).grip]!.setColor(theme.marker);
        beginAction();
    } else {
        // grab the cloth: brush weights measured in IMAGE space, so every
        // layer stacked under the brush moves together
        postInverse(pointer, prePointer);
        // require the cursor to actually touch the sheet
        let nearest = Infinity;
        for (let i = 0; i < grid.V; i++) {
            const d = Math.hypot(
                sheet.positions[2 * i]! - prePointer.x,
                sheet.positions[2 * i + 1]! - prePointer.y,
            );
            if (d < nearest) nearest = d;
        }
        if (nearest > 0.1) return;

        const sigma = brush.sigma / post.params.s!;
        const s2 = 2 * sigma * sigma;
        const weights = new Float32Array(grid.V);
        const affected: number[] = [];
        for (let i = 0; i < grid.V; i++) {
            const dx = sheet.positions[2 * i]! - prePointer.x;
            const dy = sheet.positions[2 * i + 1]! - prePointer.y;
            const weight = Math.exp(-(dx * dx + dy * dy) / s2);
            if (weight > 1e-3) {
                weights[i] = weight;
                affected.push(i);
            }
        }
        drag = { kind: "grab", weights, affected, last: vec2(prePointer.x, prePointer.y) };
        pinchDot.setColor(theme.marker);
        pinchDot.visible = true;
        beginAction();
    }
    canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
    if (!drag || !pointerWorld(e)) return;
    postInverse(pointer, prePointer);

    if (drag.kind === "grab") {
        // move every vertex under the brush by its share of the cursor step
        const dx = prePointer.x - drag.last.x;
        const dy = prePointer.y - drag.last.y;
        set2(drag.last, prePointer.x, prePointer.y);
        for (const i of drag.affected) {
            const weight = drag.weights[i]!;
            let px = sheet.positions[2 * i]! + weight * dx;
            let py = sheet.positions[2 * i + 1]! + weight * dy;
            const r = Math.hypot(px, py);
            if (r > 1) {
                px /= r;
                py /= r;
            }
            sheet.positions[2 * i] = px;
            sheet.positions[2 * i + 1] = py;
        }
        pinchDot.position.x = pointer.x;
        pinchDot.position.y = pointer.y;
    } else {
        // fold gesture: crease = perpendicular bisector of [origin, cursor],
        // re-baked from the snapshot every move so it tracks the drag live
        const snap = undoStack[undoStack.length - 1]!;
        if (Math.hypot(prePointer.x - drag.origin.x, prePointer.y - drag.origin.y) < 0.03) {
            sheet.restore(snap);
        } else {
            const { t, angle } = foldTaking(drag.origin, prePointer);
            const fold = creaseFold(t, angle);
            const p = evalScratch;
            for (let i = 0; i < grid.V; i++) {
                set2(p, snap[2 * i]!, snap[2 * i + 1]!);
                fold.evalDisk(p, 0, p);
                const r = Math.hypot(p.x, p.y);
                if (r > 1) {
                    p.x /= r;
                    p.y /= r;
                }
                sheet.positions[2 * i] = p.x;
                sheet.positions[2 * i + 1] = p.y;
            }
        }
    }
    refresh();
});

// fabric ironing: while grabbing (and briefly after release), smooth the
// displacement field — wrinkles and over-tight crumples relax while
// stretches and translations pass through freely; grabbed region pinned
let settleFrames = 0;
app.addAnimateCallback(() => {
    if (brush.smoothing <= 0 && brush.springback <= 0) return;
    const grabbing = drag?.kind === "grab";
    if (!grabbing && settleFrames <= 0) return;
    const pins = grabbing ? (drag as Extract<Drag, { kind: "grab" }>).weights : null;
    if (brush.smoothing > 0) {
        smoothDisplacements(grid, hood, sheet.positions, smoothScratch, {
            iterations: 2,
            lambda: 0.5 * brush.smoothing,
            pinWeights: pins,
        });
    }
    // one-sided springs: scrunched regions re-inflate, stretch stays free —
    // counters the "folds up too small" ratchet of iterated dragging
    if (brush.springback > 0) {
        relaxSprings(grid, springs, sheet.positions, {
            iterations: 2,
            stiffness: 0.35 * brush.springback,
            mode: "compress-only",
            pinWeights: pins,
        });
    }
    if (!grabbing) {
        settleFrames--;
        if (settleFrames === 0) census();
    }
    refresh();
});

canvas.addEventListener("pointerup", () => {
    if (!drag) return;
    if (drag.kind === "grab") {
        pinchDot.visible = false;
        if (Math.hypot(prePointer.x - drag.last.x, prePointer.y - drag.last.y) < 1e-9) {
            // no-op click: don't spend an undo slot if nothing moved
            const snap = undoStack[undoStack.length - 1]!;
            let moved = false;
            for (let i = 0; i < 2 * grid.V; i++) {
                if (Math.abs(sheet.positions[i]! - snap[i]!) > 1e-9) {
                    moved = true;
                    break;
                }
            }
            if (!moved) undoStack.pop();
        }
        // let the fabric settle after the hand lets go
        if (brush.smoothing > 0 || brush.springback > 0) settleFrames = 45;
    } else {
        rimDots[drag.grip]!.setColor(theme.roles.identity);
    }
    drag = null;
    refresh();
    census();
});

// ---- GUI & overlay ----

const gui = new GUI({ title: "disk playground" });
gui.add(brush, "sigma", 0.1, 0.8, 0.01).name("brush size σ");
gui.add(brush, "smoothing", 0, 1, 0.01).name("smoothing (iron)");
gui.add(brush, "springback", 0, 1, 0.01).name("spring-back (unscrunch)");
const postFolder = gui.addFolder("move / shrink everything");
postFolder.add(post.params, "s", 0.2, 1, 0.01).name("scale").onChange(() => {
    refresh();
    census();
});
postFolder.add(post.params, "cx", -0.8, 0.8, 0.01).name("shift x").onChange(() => {
    refresh();
    census();
});
postFolder.add(post.params, "cy", -0.8, 0.8, 0.01).name("shift y").onChange(() => {
    refresh();
    census();
});
gui.add(
    {
        undo: () => {
            const snap = undoStack.pop();
            if (snap) sheet.restore(snap);
            refresh();
            census();
        },
    },
    "undo",
).name("⎌ undo");
gui.add(
    {
        reset: () => {
            sheet.resetToIdentity();
            undoStack.length = 0;
            post.params.s = 1;
            post.params.cx = 0;
            post.params.cy = 0;
            postFolder.controllers.forEach((c) => c.updateDisplay());
            refresh();
            census();
        },
    },
    "reset",
).name("↺ reset");
const meters = gui.addFolder("meters");
meters.add(readout, "edits").listen().disable();
meters.add(readout, "folds").listen().disable();
meters.add(readout, "fixed points").listen().disable();
meters.add(readout, "Σ index").listen().disable();
gui.add({ png: () => app.exportPNG("disk-playground") }, "png").name("save PNG");

const style = document.createElement("style");
style.textContent = `
    html, body { margin: 0; overflow: hidden; }
    .overlay {
        position: fixed; left: 16px; bottom: 14px; z-index: 10;
        font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
        color: #33313b; pointer-events: none; user-select: none;
    }
    .overlay h1 { font-size: 18px; margin: 0 0 2px 0; }
    .overlay p { font-size: 13px; margin: 0; color: #6b7a99; }
    .panel-label {
        position: fixed; top: 8px; z-index: 5;
        font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
        font-size: 12px; font-weight: 600; color: #6b7a99;
        pointer-events: none; user-select: none;
    }
    .lil-gui { --width: 270px; }
`;
document.head.appendChild(style);
const overlay = document.createElement("div");
overlay.className = "overlay";
overlay.innerHTML = `<h1>Disk map playground</h1>
<p>grab the sheet anywhere and pull — all layers under the brush move together ·
drag a coral rim dot to fold · gold/violet dots are fixed points (Σ index = 1, always)</p>`;
document.body.appendChild(overlay);
for (const [text, left] of [
    ["domain D²", "calc(25% - 30px)"],
    ["image f(D²)", "calc(75% - 34px)"],
] as const) {
    const label = document.createElement("div");
    label.className = "panel-label";
    label.style.left = left;
    label.textContent = text;
    document.body.appendChild(label);
}

refresh();
census();
app.start();
