/**
 * Disk playground scene — the shared assembly behind the website and lab
 * entries: two DiskViews (flat domain, editable image), the PL sheet with a
 * post-similarity, the SheetSculptor, and the census loop. Chrome lives in
 * the entries; meter text flows out through the onMeters hook.
 *
 * The map IS the mesh: a piecewise-linear map whose state is the image
 * position of every grid vertex (plDiskMap). Folded-over regions render
 * tinted, overlaps composite darker, and the Lefschetz sum is 1 no matter
 * what — that IS Brouwer.
 */

import { App } from "../../src/app/App.ts";
import type { Vec2 } from "../../src/math/types.ts";
import { vec2, set2 } from "../../src/math/types.ts";
import type { DiskMap } from "../../src/math/maps/diskMaps.ts";
import { similarityMap, identityMap } from "../../src/math/maps/diskMaps.ts";
import { createDiskGrid, plDiskMap, orientationCounts } from "../../src/math/diskGrid.ts";
import type { PLDiskMap } from "../../src/math/diskGrid.ts";
import { findAllFixedPoints } from "../../src/math/proofs/brouwer.ts";

import { theme } from "../../src/components/theme.ts";
import { makeDiskTexture } from "../../src/components/diskTexture.ts";
import { DiskDot } from "../../src/components/panel2d.ts";
import { attachSheetSculptor } from "../../src/components/SheetSculptor.ts";
import type { SheetBrush, SheetSculptor } from "../../src/components/SheetSculptor.ts";
import { createDiskView } from "../../src/views/DiskView.ts";
import type { DiskView } from "../../src/views/DiskView.ts";

const SADDLE_COLOR = 0x8d4fd3;

export interface DiskMeters {
    folds: string;
    fixedPoints: string;
    indexSum: string;
}

export interface DiskScene {
    readonly app: App;
    readonly brush: SheetBrush;
    readonly sculptor: SheetSculptor;
    readonly post: DiskMap;
    readonly sheet: PLDiskMap;
    readonly domain: DiskView;
    readonly image: DiskView;
    /** cheap: every drag frame */
    refresh(): void;
    /** expensive: census + dot placement, on commit */
    census(): void;
    /** restore identity sheet AND the post similarity */
    reset(): void;
    hooks: {
        /** meter text after any refresh/census */
        onMeters?(m: DiskMeters): void;
    };
}

export function buildDiskScene(): DiskScene {
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
        const v = 1 + (grid.rings - 1) * grid.sectors + Math.floor(i * (grid.sectors / 12));
        const dot = new DiskDot(0.022);
        dot.setColor(theme.roles.identity);
        dot.position.set(grid.domain[2 * v]!, grid.domain[2 * v + 1]!, 0.02);
        dot.visible = true;
        domain.scene.add(dot);
    }

    // image (right): the crumpled domain f(D²) — EDITABLE (sculptor below)
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
    const meters: DiskMeters = { folds: "none", fixedPoints: "…", indexSum: "…" };
    const evalScratch = vec2();

    const scene: DiskScene = {
        app,
        brush: { sigma: 0.3, smoothing: 0.35, springback: 0.4 },
        sculptor: null as unknown as SheetSculptor, // assigned below
        post,
        sheet,
        domain,
        image,
        refresh,
        census,
        reset,
        hooks: {},
    };

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
        meters.folds =
            folds.reversing === 0 ? "none" : `${(100 * folds.foldFraction).toFixed(0)}% reversed`;
        scene.hooks.onMeters?.(meters);
    }

    function census(): void {
        // minDepth 4: sculpted folds put gold/violet pairs close to their creases
        const { fixedPoints, indexSum, degenerate } = findAllFixedPoints(f, 0, { minDepth: 4 });
        meters.fixedPoints = degenerate ? "∞ (f ≈ id on a region)" : String(fixedPoints.length);
        meters.indexSum =
            indexSum === null ? "—" : indexSum === 1 ? "1 = L(f) ✓" : `${indexSum} ✗ (should be 1)`;
        // fixed points marked in BOTH panels (f(x*) = x*, so same coordinates)
        const specs = fixedPoints.map((fp) => ({
            x: fp.x.x,
            y: fp.x.y,
            color: fp.index === -1 ? SADDLE_COLOR : theme.marker,
        }));
        domain.setDots(specs);
        image.setDots(specs);
        scene.hooks.onMeters?.(meters);
    }

    // ---- editing: the shared SheetSculptor, layered on the image panel ----
    const identityPositions = new Float32Array(grid.domain);
    const sculptor = attachSheetSculptor({
        app,
        viewport: image.viewport,
        scene: image.scene,
        grid,
        sheet,
        brush: scene.brush,
        // drags happen in the post-transformed (final) coordinates
        toSheet: postInverse,
        toImage: postApply,
        brushSigmaScale: () => post.params.s!,
        onEdit: refresh,
        onCommit: census,
    });
    (scene as { sculptor: SheetSculptor }).sculptor = sculptor;

    function reset(): void {
        post.params.s = 1;
        post.params.cx = 0;
        post.params.cy = 0;
        sculptor.reset(identityPositions);
    }

    refresh();
    census();
    app.start();
    return scene;
}
