/**
 * Disk map playground — sculpt a map f: D² → D² like a piece of cloth and
 * watch every invariant respond.
 *
 * The map IS the mesh: a piecewise-linear map whose state is the image
 * position of every grid vertex (plDiskMap). The editing (grab the sheet and
 * pull, drag a coral rim dot to fold, smoothing/spring settle, undo) is the
 * shared SheetSculptor machinery; this demo just composes two DiskViews and
 * layers the sculptor onto the image one.
 *
 * Folded-over regions render tinted, overlaps composite darker, and the meters
 * keep the books: fold fraction, fixed points (gold +1, violet saddles), and
 * the Lefschetz sum — 1 no matter what. That IS Brouwer.
 */

import GUI from "lil-gui";

import { App } from "../../src/app/App.ts";
import type { Vec2 } from "../../src/math/types.ts";
import { vec2, set2 } from "../../src/math/types.ts";
import type { DiskMap } from "../../src/math/maps/diskMaps.ts";
import { similarityMap, identityMap } from "../../src/math/maps/diskMaps.ts";
import { createDiskGrid, plDiskMap, orientationCounts } from "../../src/math/diskGrid.ts";
import { findAllFixedPoints } from "../../src/math/proofs/brouwer.ts";

import { theme } from "../../src/components/theme.ts";
import { makeDiskTexture } from "../../src/components/diskTexture.ts";
import { DiskDot } from "../../src/components/panel2d.ts";
import { attachSheetSculptor } from "../../src/components/SheetSculptor.ts";
import { createDiskView } from "../../src/views/DiskView.ts";

const SADDLE_COLOR = 0x8d4fd3;

// ---- the map: post similarity ∘ PL sheet ----
const grid = createDiskGrid(64, 128);
const sheet = plDiskMap(grid);
const post = similarityMap(1, 0, 0);

const f: DiskMap = {
    id: "hand-sculpted",
    name: "hand-sculpted",
    params: {},
    evalDisk: (x, time, out) => {
        sheet.evalDisk(x, time, out);
        return post.evalDisk(out, time, out);
    },
};

/** invert / apply the post similarity (drags happen in final coordinates). */
function postInverse(p: Vec2, out: Vec2): void {
    set2(out, (p.x - post.params.cx!) / post.params.s!, (p.y - post.params.cy!) / post.params.s!);
}
function postApply(p: Vec2, out: Vec2): void {
    post.evalDisk(p, 0, out);
}

// ---- panels ----
const app = new App();
const texture = makeDiskTexture();

// domain (left): flat textured disk + static grip markers + fixed-point dots
const domain = createDiskView({ app, name: "domain", rect: { x: 0, y: 0, w: 0.5, h: 1 }, texture, dots: 12 });
domain.disk.refit(identityMap());
for (let i = 0; i < 12; i++) {
    const v = 1 + (grid.rings - 1) * grid.sectors + i * (grid.sectors / 12);
    const dot = new DiskDot(0.022);
    dot.setColor(theme.roles.identity);
    dot.position.set(grid.domain[2 * v]!, grid.domain[2 * v + 1]!, 0.02);
    dot.visible = true;
    domain.scene.add(dot);
}

// image (right): the crumpled domain f(D²) — EDITABLE (sculptor attached below)
const image = createDiskView({
    app,
    name: "image",
    rect: { x: 0.5, y: 0, w: 0.5, h: 1 },
    texture,
    grid,
    opacity: 0.85,
    backdrop: true,
    dots: 12,
});

// ---- refresh: cheap every drag frame, census on release ----
const displayPositions = new Float32Array(2 * grid.V);
const readout = { folds: "none", "fixed points": "…", "Σ index": "…" };
const evalScratch = vec2();

function refresh(): void {
    // display = post ∘ sheet, applied to every vertex
    for (let i = 0; i < grid.V; i++) {
        set2(evalScratch, sheet.positions[2 * i]!, sheet.positions[2 * i + 1]!);
        post.evalDisk(evalScratch, 0, evalScratch);
        displayPositions[2 * i] = evalScratch.x;
        displayPositions[2 * i + 1] = evalScratch.y;
    }
    image.disk.setPositions(displayPositions);
    const folds = orientationCounts(grid, sheet.positions);
    readout.folds =
        folds.reversing === 0 ? "none" : `${(100 * folds.foldFraction).toFixed(0)}% reversed`;
}

function census(): void {
    // minDepth 4: sculpted folds put gold/violet pairs close to their creases
    const { fixedPoints, indexSum, degenerate } = findAllFixedPoints(f, 0, { minDepth: 4 });
    readout["fixed points"] = degenerate ? "∞ (f ≈ id on a region)" : String(fixedPoints.length);
    readout["Σ index"] =
        indexSum === null ? "—" : indexSum === 1 ? "1 = L(f) ✓" : `${indexSum} ✗ (should be 1)`;
    // fixed points marked in BOTH panels (f(x*) = x*, so same coordinates)
    const specs = fixedPoints.map((fp) => ({
        x: fp.x.x,
        y: fp.x.y,
        color: fp.index === -1 ? SADDLE_COLOR : theme.marker,
    }));
    domain.setDots(specs);
    image.setDots(specs);
}

// ---- editing: the shared SheetSculptor, layered on the image panel ----
const brush = { sigma: 0.3, smoothing: 0.35, springback: 0.4 };
const identityPositions = new Float32Array(grid.domain);
const sculptor = attachSheetSculptor({
    app,
    viewport: image.viewport,
    scene: image.scene,
    grid,
    sheet,
    brush,
    // drags happen in the post-transformed (final) coordinates
    toSheet: postInverse,
    toImage: postApply,
    brushSigmaScale: () => post.params.s!,
    onEdit: refresh,
    onCommit: census,
});

// ---- GUI & overlay ----
const gui = new GUI({ title: "disk playground" });
gui.add(brush, "sigma", 0.1, 0.8, 0.01).name("brush size σ");
gui.add(brush, "smoothing", 0, 1, 0.01).name("smoothing (iron)");
gui.add(brush, "springback", 0, 1, 0.01).name("spring-back (unscrunch)");
const postFolder = gui.addFolder("move / shrink everything");
for (const [key, label, lo, hi] of [
    ["s", "scale", 0.2, 1],
    ["cx", "shift x", -0.8, 0.8],
    ["cy", "shift y", -0.8, 0.8],
] as const) {
    postFolder.add(post.params, key, lo, hi, 0.01).name(label).onChange(() => {
        refresh();
        census();
    });
}
gui.add({ undo: () => sculptor.undo() }, "undo").name("⎌ undo");
gui.add(
    {
        reset: () => {
            post.params.s = 1;
            post.params.cx = 0;
            post.params.cy = 0;
            postFolder.controllers.forEach((c) => c.updateDisplay());
            sculptor.reset(identityPositions);
        },
    },
    "reset",
).name("↺ reset");
const meters = gui.addFolder("meters");
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
